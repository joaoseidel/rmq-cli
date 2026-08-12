import {
  failure,
  success,
  type OperationSummary,
  type ProgressReporter,
} from "../domain/operation.ts";
import { originOf, republishInput } from "./message-operations.ts";
import type { Message } from "../domain/message.ts";
import type { Queue } from "../domain/queue.ts";
import type {
  BrokerClient,
  BrokerConnection,
  ConsumeInput,
  PurgeResult,
} from "../ports/broker.ts";
import type { SafeOperationCoordinator } from "../ports/stores.ts";

export interface QueueOutcome {
  readonly queue: string;
  readonly summary: OperationSummary;
}

export function totalsOf(outcomes: readonly QueueOutcome[]): {
  readonly successful: number;
  readonly failed: number;
} {
  return {
    successful: outcomes.reduce(
      (sum, outcome) => sum + outcome.summary.successful,
      0,
    ),
    failed: outcomes.reduce((sum, outcome) => sum + outcome.summary.failed, 0),
  };
}

export function listNames(names: readonly string[], limit = 3): string {
  const shown = names.slice(0, limit).map((name) => `'${name}'`);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(", ")}, and ${rest} more` : shown.join(", ");
}

export class QueueOperations {
  constructor(
    private readonly broker: BrokerClient,
    private readonly coordinator: SafeOperationCoordinator,
  ) {}

  listQueues(
    connection: BrokerConnection,
    pattern?: string | null,
  ): Promise<Queue[]> {
    return this.broker.listQueues(pattern ?? null, connection);
  }

  async queueExists(
    name: string,
    connection: BrokerConnection,
  ): Promise<boolean> {
    const queues = await this.broker.listQueues(null, connection);
    return queues.some((queue) => queue.name === name);
  }

  purgeQueue(
    queueName: string,
    connection: BrokerConnection,
  ): Promise<PurgeResult> {
    return this.broker.purgeQueue(queueName, connection);
  }

  consumeMessages(input: ConsumeInput): Promise<string> {
    return this.broker.consumeMessages(input);
  }

  cancelConsumer(
    consumerTag: string,
    connection: BrokerConnection,
  ): Promise<boolean> {
    return this.broker.cancelConsumer(consumerTag, connection);
  }

  async safeRequeueMessages(input: {
    fromQueue: string;
    toQueue: string;
    limit: number;
    connection: BrokerConnection;
    onProgress?: ProgressReporter;
  }): Promise<OperationSummary> {
    const { fromQueue, toQueue, limit, connection, onProgress } = input;

    await this.assertDestinationExists(toQueue, [fromQueue], connection);
    return this.requeueFrom({
      fromQueue,
      toQueue,
      limit,
      connection,
      onProgress,
    });
  }

  /**
   * Drains each source queue in turn into a single destination. Every source
   * gets its own backup, so an interrupted run is recovered per queue.
   */
  async safeRequeueQueues(input: {
    fromQueues: readonly string[];
    toQueue: string;
    limit: number;
    connection: BrokerConnection;
    onProgress?: ProgressReporter;
    throwIfCancelled?: () => void;
  }): Promise<readonly QueueOutcome[]> {
    const { toQueue, limit, connection } = input;
    const sources = [...new Set(input.fromQueues)];

    if (sources.includes(toQueue)) {
      throw new Error(
        `'${toQueue}' is both a source and the destination. Nothing was moved.`,
      );
    }

    await this.assertDestinationExists(toQueue, sources, connection);

    return this.perQueue({
      queues: sources,
      phase: "Transferring",
      onProgress: input.onProgress,
      throwIfCancelled: input.throwIfCancelled,
      run: (fromQueue, onProgress) =>
        this.requeueFrom({ fromQueue, toQueue, limit, connection, onProgress }),
    });
  }

  /**
   * Republishes everything in each queue to the exchange and routing key it
   * arrived on, then takes it off the queue.
   */
  async safeReprocessQueues(input: {
    queues: readonly string[];
    limit: number;
    connection: BrokerConnection;
    onProgress?: ProgressReporter;
    throwIfCancelled?: () => void;
  }): Promise<readonly QueueOutcome[]> {
    const { limit, connection } = input;

    return this.perQueue({
      queues: [...new Set(input.queues)],
      phase: "Reprocessing",
      onProgress: input.onProgress,
      throwIfCancelled: input.throwIfCancelled,
      run: (queueName, onProgress) =>
        this.reprocessFrom({ queueName, limit, connection, onProgress }),
    });
  }

  private async assertDestinationExists(
    toQueue: string,
    sources: readonly string[],
    connection: BrokerConnection,
  ): Promise<void> {
    if (await this.queueExists(toQueue, connection)) return;

    throw new Error(
      `Queue '${toQueue}' does not exist. Nothing was taken from ${listNames(sources)}.`,
    );
  }

  /**
   * Works through the queues one at a time - they share a channel, so running
   * them at once would interleave reads. A single queue reports its own
   * message-by-message progress; several report a queue at a time, because a
   * per-message bar would restart on every queue.
   */
  private async perQueue(input: {
    queues: readonly string[];
    phase: string;
    onProgress?: ProgressReporter;
    throwIfCancelled?: () => void;
    run: (
      queueName: string,
      onProgress: ProgressReporter | undefined,
    ) => Promise<OperationSummary>;
  }): Promise<readonly QueueOutcome[]> {
    const { queues, phase, onProgress } = input;
    const alone = queues.length === 1;
    const outcomes: QueueOutcome[] = [];

    for (const [index, queue] of queues.entries()) {
      input.throwIfCancelled?.();

      const summary = await input.run(queue, alone ? onProgress : undefined);
      outcomes.push({ queue, summary });

      if (!alone) {
        onProgress?.({ phase, done: index + 1, total: queues.length });
      }
    }

    return outcomes;
  }

  private requeueFrom(input: {
    fromQueue: string;
    toQueue: string;
    limit: number;
    connection: BrokerConnection;
    onProgress: ProgressReporter | undefined;
  }): Promise<OperationSummary> {
    const { fromQueue, toQueue, limit, connection } = input;

    return this.drainAndRepublish({
      operationType: "requeue-messages",
      queueName: fromQueue,
      limit,
      connection,
      phase: "Transferring",
      onProgress: input.onProgress,
      route: () => ({ routingKey: toQueue }),
      whenRefused: "Failed to publish to target queue",
    });
  }

  private reprocessFrom(input: {
    queueName: string;
    limit: number;
    connection: BrokerConnection;
    onProgress: ProgressReporter | undefined;
  }): Promise<OperationSummary> {
    return this.drainAndRepublish({
      operationType: "reprocess-messages",
      queueName: input.queueName,
      limit: input.limit,
      connection: input.connection,
      phase: "Reprocessing",
      onProgress: input.onProgress,
      route: (message) => ({
        exchange: message.exchange,
        routingKey: message.routingKey,
      }),
      whenRefused: "Failed to republish to its original exchange",
    });
  }

  private drainAndRepublish(input: {
    operationType: string;
    queueName: string;
    limit: number;
    connection: BrokerConnection;
    phase: string;
    onProgress: ProgressReporter | undefined;
    route: (message: Message) => {
      exchange?: string | undefined;
      routingKey: string;
    };
    whenRefused: string;
  }): Promise<OperationSummary> {
    const { queueName, limit, connection, phase, onProgress } = input;

    return this.coordinator.executeOperation({
      operationType: input.operationType,
      origin: originOf(queueName, connection),
      provideMessages: () =>
        this.broker.getMessages({
          queueName,
          count: limit,
          ack: true,
          connection,
        }),
      process: async (message) => {
        const published = await this.broker.publishMessage(
          republishInput(message, input.route(message), connection),
        );

        return published
          ? success(message.id)
          : failure(message.id, input.whenRefused);
      },
      ...(onProgress === undefined
        ? {}
        : {
            onProgress: (progress: { processed: number; total: number }) =>
              onProgress({
                phase,
                done: progress.processed,
                total: progress.total,
              }),
          }),
    });
  }
}
