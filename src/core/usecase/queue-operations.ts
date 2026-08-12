import {
  failure,
  success,
  type OperationSummary,
  type ProgressReporter,
} from "../domain/operation.ts";
import { originOf, republishInput } from "./message-operations.ts";
import type { Queue } from "../domain/queue.ts";
import type {
  BrokerClient,
  BrokerConnection,
  ConsumeInput,
  PurgeResult,
} from "../ports/broker.ts";
import type { SafeOperationCoordinator } from "../ports/stores.ts";

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

    if (!(await this.queueExists(toQueue, connection))) {
      throw new Error(
        `Queue '${toQueue}' does not exist. Nothing was taken from '${fromQueue}'.`,
      );
    }

    return this.coordinator.executeOperation({
      operationType: "requeue-messages",
      origin: originOf(fromQueue, connection),
      provideMessages: () =>
        this.broker.getMessages({
          queueName: fromQueue,
          count: limit,
          ack: true,
          connection,
        }),
      process: async (message) => {
        const published = await this.broker.publishMessage(
          republishInput(message, { routingKey: toQueue }, connection),
        );

        return published
          ? success(message.id)
          : failure(message.id, "Failed to publish to target queue");
      },
      ...(onProgress === undefined
        ? {}
        : {
            onProgress: (progress: { processed: number; total: number }) =>
              onProgress({
                phase: "Transferring",
                done: progress.processed,
                total: progress.total,
              }),
          }),
    });
  }
}
