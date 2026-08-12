import type { ConnectionInfo } from "../domain/connection.ts";
import type { CompositeMessageId } from "../domain/message-id.ts";
import type { Message } from "../domain/message.ts";
import {
  failure,
  success,
  type InterruptedOperation,
  type ProgressReporter,
} from "../domain/operation.ts";
import {
  PartialReadError,
  type BrokerClient,
  type BrokerConnection,
  type PublishInput,
} from "../ports/broker.ts";
import type {
  MessageBackupRepository,
  SafeOperationCoordinator,
} from "../ports/stores.ts";
import { mapWithConcurrency } from "../util/pool.ts";
import { errorMessage } from "../util/text.ts";
import { messageMatcher } from "./message-query.ts";

export const ALL_MESSAGES = Number.MAX_SAFE_INTEGER;

export const SEARCH_DEPTHS = [100, 200, 500, 1000, 5000, 10_000] as const;

export const DEFAULT_SEARCH_LIMIT = 200;

export const DEFAULT_SEARCH_CONCURRENCY = 4;

export const DEFAULT_PUBLISH_CONCURRENCY = 16;

const DRAIN_CHUNK = 500;

export interface SearchTarget {
  readonly name: string;
  readonly total: number;
}

export interface MessageSearchHit {
  readonly queue: string;
  readonly message: Message;
}

export interface MessageSearchFailure {
  readonly queue: string;
  readonly error: string;
}

export interface MessageSearchOutcome {
  readonly hits: readonly MessageSearchHit[];
  readonly scanned: number;
  readonly queuesScanned: number;
  readonly failures: readonly MessageSearchFailure[];
  readonly truncated: readonly string[];
  readonly partial: readonly string[];
  readonly cancelled: boolean;
}

export function stepSearchDepth(
  current: number,
  direction: "deeper" | "shallower",
): number {
  const index = SEARCH_DEPTHS.indexOf(
    current as (typeof SEARCH_DEPTHS)[number],
  );
  if (index === -1) return DEFAULT_SEARCH_LIMIT;

  const next = direction === "deeper" ? index + 1 : index - 1;
  return SEARCH_DEPTHS[next] ?? current;
}

export function republishInput(
  message: Message,
  route: { exchange?: string | undefined; routingKey: string },
  connection: BrokerConnection,
): PublishInput {
  return {
    ...(route.exchange === undefined ? {} : { exchange: route.exchange }),
    routingKey: route.routingKey,
    payload: message.payload,
    headers: message.headers,
    properties: message.properties,
    connection,
  };
}

export interface RemovalOutcome {
  readonly operationId: string;
  readonly removed: number;
  readonly restored: number;
  readonly lost: number;
  readonly unprocessedMessages: readonly Message[];
}

export interface RecoveryOutcome {
  readonly restored: number;
  readonly failed: number;
}

export class MessageOperations {
  constructor(
    private readonly broker: BrokerClient,
    private readonly coordinator: SafeOperationCoordinator,
    private readonly backups: MessageBackupRepository,
  ) {}

  listInterruptedOperations(): InterruptedOperation[] {
    return this.backups.listInterruptedOperations();
  }

  forgetOperation(operationId: string): boolean {
    return this.backups.forget(operationId);
  }

  pruneOldBackups(maxAgeMs: number): number {
    return this.backups.pruneOlderThan(Date.now() - maxAgeMs);
  }

  async recoverOperation(input: {
    operationId: string;
    queueName: string;
    connection: BrokerConnection;
    onProgress?: ProgressReporter;
    isCancelled?: () => boolean;
  }): Promise<RecoveryOutcome> {
    const { operationId, queueName, connection } = input;
    const pending = this.backups.getUnprocessedMessages(operationId);

    let restored = 0;
    let failed = 0;

    for (const message of pending) {
      if (input.isCancelled?.() === true) break;

      const published = await this.broker.publishMessage(
        republishInput(message, { routingKey: queueName }, connection),
      );

      if (published) {
        this.backups.markMessageAsProcessed(operationId, message.id);
        restored += 1;
      } else {
        failed += 1;
      }

      input.onProgress?.({
        phase: "Restoring",
        done: restored + failed,
        total: pending.length,
      });
    }

    if (failed === 0) this.backups.completeOperation(operationId);
    return { restored, failed };
  }

  publishToQueue(
    queueName: string,
    payload: string,
    connection: BrokerConnection,
  ): Promise<boolean> {
    return this.broker.publishMessage({
      routingKey: queueName,
      payload,
      connection,
    });
  }

  publishToExchange(
    exchange: string,
    routingKey: string,
    payload: string,
    connection: BrokerConnection,
  ): Promise<boolean> {
    return this.broker.publishMessage({
      exchange,
      routingKey,
      payload,
      connection,
    });
  }

  publishMessage(
    message: Message,
    route: { exchange?: string | undefined; routingKey: string },
    connection: BrokerConnection,
  ): Promise<boolean> {
    return this.broker.publishMessage(
      republishInput(message, route, connection),
    );
  }

  findMessage(
    id: CompositeMessageId,
    queueName: string,
    connection: BrokerConnection,
  ): Promise<Message | null> {
    return this.broker.findMessage({ id, queueName, ack: false, connection });
  }

  getMessages(
    queueName: string,
    count: number,
    ack: boolean,
    connection: BrokerConnection,
  ): Promise<Message[]> {
    return this.broker.getMessages({ queueName, count, ack, connection });
  }

  async searchMessages(input: {
    queues: readonly SearchTarget[];
    term: string;
    info: ConnectionInfo;
    limitPerQueue?: number;
    concurrency?: number;
    onProgress?: (outcome: MessageSearchOutcome) => void;
    isCancelled?: () => boolean;
  }): Promise<MessageSearchOutcome> {
    const { queues, term, info } = input;
    const limit = input.limitPerQueue ?? DEFAULT_SEARCH_LIMIT;
    const matches = messageMatcher(term);

    const hitsByQueue = queues.map((): MessageSearchHit[] => []);
    const failures: MessageSearchFailure[] = [];
    const truncated: string[] = [];
    const partial: string[] = [];
    let scanned = 0;
    let queuesScanned = 0;
    let cancelled = false;

    const snapshot = (): MessageSearchOutcome => ({
      hits: hitsByQueue.flat(),
      scanned,
      queuesScanned,
      failures: [...failures],
      truncated: [...truncated],
      partial: [...partial],
      cancelled,
    });

    const collect = (
      index: number,
      target: SearchTarget,
      found: readonly Message[],
    ): void => {
      scanned += found.length;
      if (found.length >= limit && target.total > found.length) {
        truncated.push(target.name);
      }

      const bucket = hitsByQueue[index];
      if (bucket === undefined) return;

      for (const message of found) {
        if (matches(message)) bucket.push({ queue: target.name, message });
      }
    };

    let cursor = 0;
    const workers = Math.max(
      1,
      Math.min(input.concurrency ?? DEFAULT_SEARCH_CONCURRENCY, queues.length),
    );

    const scan = async (connection: BrokerConnection): Promise<void> => {
      for (;;) {
        if (input.isCancelled?.() === true) {
          cancelled = true;
          return;
        }

        const index = cursor;
        cursor += 1;

        const target = queues[index];
        if (target === undefined) return;

        try {
          const found = await this.broker.getMessages({
            queueName: target.name,
            count: limit,
            ack: false,
            connection,
          });
          collect(index, target, found);
        } catch (error) {
          if (error instanceof PartialReadError) {
            collect(index, target, error.messages);
            partial.push(target.name);
          }
          failures.push({ queue: target.name, error: errorMessage(error) });
        }

        await connection.requeueAll();

        queuesScanned += 1;
        input.onProgress?.(snapshot());
      }
    };

    if (queues.length > 0) {
      await Promise.all(
        Array.from({ length: workers }, () =>
          this.broker.withConnection(info, scan),
        ),
      );
    }

    return snapshot();
  }

  private async drainForTargets(input: {
    queueName: string;
    targets: ReadonlySet<string>;
    drainAll: boolean;
    connection: BrokerConnection;
  }): Promise<readonly Message[]> {
    const { queueName, targets, drainAll, connection } = input;

    if (drainAll) {
      return this.broker.getMessages({
        queueName,
        count: ALL_MESSAGES,
        ack: true,
        connection,
      });
    }

    const drained: Message[] = [];
    let remaining = targets.size;

    while (remaining > 0) {
      const chunk = await this.broker.getMessages({
        queueName,
        count: DRAIN_CHUNK,
        ack: true,
        connection,
      });

      for (const message of chunk) {
        drained.push(message);
        if (targets.has(message.id)) remaining -= 1;
      }

      if (chunk.length < DRAIN_CHUNK) break;
    }

    return drained;
  }

  async removeFromQueue(input: {
    queueName: string;
    targets: readonly CompositeMessageId[];
    connection: BrokerConnection;
    drainAll?: boolean;
    onProgress?: ProgressReporter;
  }): Promise<RemovalOutcome> {
    const { queueName, connection, onProgress } = input;
    const targets = new Set<string>(input.targets);

    let removed = 0;
    let restored = 0;
    let lost = 0;

    const summary = await this.coordinator.executeOperation({
      operationType: "remove-messages",
      queueName,
      provideMessages: () =>
        this.drainForTargets({
          queueName,
          targets,
          drainAll: input.drainAll ?? true,
          connection,
        }),
      process: async (message) => {
        if (targets.has(message.id)) {
          removed += 1;
          return success(message.id);
        }

        const republished = await this.broker.publishMessage(
          republishInput(message, { routingKey: queueName }, connection),
        );

        if (republished) {
          restored += 1;
          return success(message.id);
        }

        lost += 1;
        return failure(message.id, "Failed to restore message to the queue");
      },
      ...(onProgress === undefined
        ? {}
        : {
            onProgress: (progress: { processed: number; total: number }) =>
              onProgress({
                phase: "Repositioning",
                done: progress.processed,
                total: progress.total,
              }),
          }),
    });

    return {
      operationId: summary.id,
      removed,
      restored,
      lost,
      unprocessedMessages: summary.unprocessedMessages,
    };
  }

  safeDeleteMessage(input: {
    id: CompositeMessageId;
    queueName: string;
    connection: BrokerConnection;
    onProgress?: ProgressReporter;
  }): Promise<RemovalOutcome> {
    const { id, ...rest } = input;
    return this.removeFromQueue({ ...rest, targets: [id] });
  }

  private async publishAll(
    messages: readonly Message[],
    connection: BrokerConnection,
    route: (message: Message) => {
      exchange?: string | undefined;
      routingKey: string;
    },
    describe: (message: Message) => string,
    options: {
      concurrency?: number;
      onProgress?: ProgressReporter;
    } = {},
  ): Promise<void> {
    let copied = 0;
    let firstFailure: Message | null = null;

    const concurrency = Math.max(
      1,
      options.concurrency ?? DEFAULT_PUBLISH_CONCURRENCY,
    );

    await mapWithConcurrency(messages, concurrency, async (message) => {
      if (firstFailure !== null) return;

      const published = await this.broker.publishMessage(
        republishInput(message, route(message), connection),
      );

      if (!published) {
        firstFailure ??= message;
        return;
      }

      copied += 1;
      options.onProgress?.({
        phase: "Copying",
        done: copied,
        total: messages.length,
      });
    });

    if (firstFailure !== null) {
      throw new Error(
        `Failed to publish to ${describe(firstFailure)}. ` +
          (copied === 0
            ? "Nothing was moved."
            : `${copied} of ${messages.length} were already copied; none have been removed.`),
      );
    }
  }

  async safeMoveMessages(input: {
    messages: readonly Message[];
    fromQueue: string;
    toQueue: string;
    connection: BrokerConnection;
    concurrency?: number;
    onProgress?: ProgressReporter;
  }): Promise<RemovalOutcome> {
    const { messages, fromQueue, toQueue, connection, onProgress } = input;

    await this.publishAll(
      messages,
      connection,
      () => ({ routingKey: toQueue }),
      () => `'${toQueue}'`,
      {
        ...(input.concurrency === undefined
          ? {}
          : { concurrency: input.concurrency }),
        ...(onProgress === undefined ? {} : { onProgress }),
      },
    );

    return this.removeFromQueue({
      queueName: fromQueue,
      targets: messages.map((message) => message.id),
      connection,
      ...(onProgress === undefined ? {} : { onProgress }),
    });
  }

  async safeReprocessMessages(input: {
    messages: readonly Message[];
    fromQueue: string;
    connection: BrokerConnection;
    concurrency?: number;
    onProgress?: ProgressReporter;
  }): Promise<RemovalOutcome> {
    const { messages, fromQueue, connection, onProgress } = input;

    await this.publishAll(
      messages,
      connection,
      (message) => ({
        exchange: message.exchange,
        routingKey: message.routingKey,
      }),
      (message) => `'${message.exchange}'`,
      {
        ...(input.concurrency === undefined
          ? {}
          : { concurrency: input.concurrency }),
        ...(onProgress === undefined ? {} : { onProgress }),
      },
    );

    return this.removeFromQueue({
      queueName: fromQueue,
      targets: messages.map((message) => message.id),
      connection,
      ...(onProgress === undefined ? {} : { onProgress }),
    });
  }

  safeRequeueMessage(input: {
    message: Message;
    fromQueue: string;
    toQueue: string;
    connection: BrokerConnection;
    onProgress?: ProgressReporter;
  }): Promise<RemovalOutcome> {
    const { message, ...rest } = input;
    return this.safeMoveMessages({ ...rest, messages: [message] });
  }

  safeReprocessMessage(input: {
    message: Message;
    fromQueue: string;
    connection: BrokerConnection;
    onProgress?: ProgressReporter;
  }): Promise<RemovalOutcome> {
    const { message, ...rest } = input;
    return this.safeReprocessMessages({ ...rest, messages: [message] });
  }
}
