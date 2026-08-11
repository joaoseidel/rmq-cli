import {
  failure,
  success,
  type OperationSummary,
} from "../domain/operation.ts";
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

  safeRequeueMessages(input: {
    fromQueue: string;
    toQueue: string;
    limit: number;
    connection: BrokerConnection;
  }): Promise<OperationSummary> {
    const { fromQueue, toQueue, limit, connection } = input;

    return this.coordinator.executeOperation({
      operationType: "requeue-messages",
      provideMessages: () =>
        this.broker.getMessages({
          queueName: fromQueue,
          count: limit,
          ack: true,
          connection,
        }),
      process: async (message) => {
        const published = await this.broker.publishMessage({
          routingKey: toQueue,
          payload: message.payload,
          connection,
        });

        return published
          ? success(message.id)
          : failure(message.id, "Failed to publish to target queue");
      },
    });
  }
}
