import type { CompositeMessageId } from "../domain/message-id.ts";
import type { Message } from "../domain/message.ts";
import { failure, success } from "../domain/operation.ts";
import type { BrokerClient, BrokerConnection } from "../ports/broker.ts";
import type { SafeOperationCoordinator } from "../ports/stores.ts";

export const ALL_MESSAGES = Number.MAX_SAFE_INTEGER;

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
