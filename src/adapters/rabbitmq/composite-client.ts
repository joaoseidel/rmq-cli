import type { ConnectionInfo } from "../../core/domain/connection.ts";
import type { Message } from "../../core/domain/message.ts";
import type {
  BrokerClient,
  BrokerConnection,
  ConsumeInput,
  GetMessagesInput,
  PublishInput,
  PurgeResult,
} from "../../core/ports/broker.ts";
import { AmqpBrokerClient } from "./amqp-client.ts";
import { BaseBrokerClient } from "./base-client.ts";
import { HttpBrokerClient } from "./http-client.ts";

export class CompositeBrokerClient extends BaseBrokerClient {
  constructor(
    private readonly amqp: BrokerClient = new AmqpBrokerClient(),
    private readonly http: BrokerClient = new HttpBrokerClient(),
  ) {
    super();
  }

  private forInfo(info: ConnectionInfo): BrokerClient {
    return info.type === "amqp" ? this.amqp : this.http;
  }

  private forConnection(connection: BrokerConnection): BrokerClient {
    return this.forInfo(connection.info);
  }

  override connect(info: ConnectionInfo): Promise<BrokerConnection> {
    return this.forInfo(info).connect(info);
  }

  override testConnection(info: ConnectionInfo): Promise<boolean> {
    return this.forInfo(info).testConnection(info);
  }

  override publishMessage(input: PublishInput): Promise<boolean> {
    return this.forConnection(input.connection).publishMessage(input);
  }

  override getMessages(input: GetMessagesInput): Promise<Message[]> {
    return this.forConnection(input.connection).getMessages(input);
  }

  override purgeQueue(
    queueName: string,
    connection: BrokerConnection,
  ): Promise<PurgeResult> {
    return this.forConnection(connection).purgeQueue(queueName, connection);
  }

  override consumeMessages(input: ConsumeInput): Promise<string> {
    return this.forConnection(input.connection).consumeMessages(input);
  }

  override cancelConsumer(
    consumerTag: string,
    connection: BrokerConnection,
  ): Promise<boolean> {
    return this.forConnection(connection).cancelConsumer(
      consumerTag,
      connection,
    );
  }
}
