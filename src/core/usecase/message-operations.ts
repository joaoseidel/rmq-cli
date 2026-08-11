import type { CompositeMessageId } from "../domain/message-id.ts";
import type { Message } from "../domain/message.ts";
import { failure, success } from "../domain/operation.ts";
import type { BrokerClient, BrokerConnection } from "../ports/broker.ts";
import type { SafeOperationCoordinator } from "../ports/stores.ts";
import { globMatcher } from "../util/glob.ts";
import { errorMessage } from "../util/text.ts";

export const ALL_MESSAGES = Number.MAX_SAFE_INTEGER;

export const SEARCH_DEPTHS = [100, 200, 500, 1000, 5000, 10_000] as const;

/** Messages peeked per queue by a cross-queue search. */
export const DEFAULT_SEARCH_LIMIT = 200;

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

export function messageMatcher(term: string): (message: Message) => boolean {
  const matches = globMatcher(`*${term}*`);
  return (message) => matches(message.payload) || matches(message.id);
}

export interface RemovalOutcome {
  readonly operationId: string;
  /** Targeted messages that were removed. */
  readonly removed: number;
  /** Bystanders successfully put back on the queue. */
  readonly restored: number;
  /** Bystanders that could not be put back — recoverable from the backup. */
  readonly lost: number;
  readonly unprocessedMessages: readonly Message[];
}

export class MessageOperations {
  constructor(
    private readonly broker: BrokerClient,
    private readonly coordinator: SafeOperationCoordinator,
  ) {}

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
    queueNames: readonly string[];
    term: string;
    limitPerQueue?: number;
    connection: BrokerConnection;
    onProgress?: (outcome: MessageSearchOutcome) => void;
    isCancelled?: () => boolean;
  }): Promise<MessageSearchOutcome> {
    const { queueNames, term, connection } = input;
    const limit = input.limitPerQueue ?? DEFAULT_SEARCH_LIMIT;
    const matches = messageMatcher(term);

    const hits: MessageSearchHit[] = [];
    const failures: MessageSearchFailure[] = [];
    const truncated: string[] = [];
    let scanned = 0;
    let queuesScanned = 0;
    let cancelled = false;

    const snapshot = (): MessageSearchOutcome => ({
      hits: [...hits],
      scanned,
      queuesScanned,
      failures: [...failures],
      truncated: [...truncated],
      cancelled,
    });

    for (const queueName of queueNames) {
      if (input.isCancelled?.() === true) {
        cancelled = true;
        break;
      }

      try {
        const messages = await this.broker.getMessages({
          queueName,
          count: limit,
          ack: false,
          connection,
        });

        scanned += messages.length;
        if (messages.length >= limit) truncated.push(queueName);

        for (const message of messages) {
          if (matches(message)) hits.push({ queue: queueName, message });
        }
      } catch (error) {
        failures.push({ queue: queueName, error: errorMessage(error) });
      }

      queuesScanned += 1;
      input.onProgress?.(snapshot());
    }

    return snapshot();
  }

  async removeFromQueue(input: {
    queueName: string;
    targets: readonly CompositeMessageId[];
    connection: BrokerConnection;
  }): Promise<RemovalOutcome> {
    const { queueName, connection } = input;
    const targets = new Set<string>(input.targets);

    let removed = 0;
    let restored = 0;
    let lost = 0;

    const summary = await this.coordinator.executeOperation({
      operationType: "remove-messages",
      provideMessages: () =>
        this.broker.getMessages({
          queueName,
          count: ALL_MESSAGES,
          ack: true,
          connection,
        }),
      process: async (message) => {
        if (targets.has(message.id)) {
          removed += 1;
          return success(message.id);
        }

        const republished = await this.broker.publishMessage({
          routingKey: queueName,
          payload: message.payload,
          connection,
        });

        if (republished) {
          restored += 1;
          return success(message.id);
        }

        lost += 1;
        return failure(message.id, "Failed to restore message to the queue");
      },
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
  }): Promise<RemovalOutcome> {
    const { id, ...rest } = input;
    return this.removeFromQueue({ ...rest, targets: [id] });
  }

  async safeRequeueMessage(input: {
    message: Message;
    fromQueue: string;
    toQueue: string;
    connection: BrokerConnection;
  }): Promise<RemovalOutcome> {
    const { message, fromQueue, toQueue, connection } = input;

    const published = await this.broker.publishMessage({
      routingKey: toQueue,
      payload: message.payload,
      connection,
    });

    if (!published) {
      throw new Error(
        `Failed to publish to '${toQueue}'. The message was left in '${fromQueue}'.`,
      );
    }

    return this.removeFromQueue({
      queueName: fromQueue,
      targets: [message.id],
      connection,
    });
  }

  async safeReprocessMessage(input: {
    message: Message;
    fromQueue: string;
    connection: BrokerConnection;
  }): Promise<RemovalOutcome> {
    const { message, fromQueue, connection } = input;

    const published = await this.broker.publishMessage({
      exchange: message.exchange,
      routingKey: message.routingKey,
      payload: message.payload,
      connection,
    });

    if (!published) {
      throw new Error(
        `Failed to republish to '${message.exchange}'. The message was left in '${fromQueue}'.`,
      );
    }

    return this.removeFromQueue({
      queueName: fromQueue,
      targets: [message.id],
      connection,
    });
  }
}
