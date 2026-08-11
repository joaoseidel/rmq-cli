import type { ConnectionInfo } from "../../core/domain/connection.ts";
import {
  DEFAULT_EXCHANGE,
  messageFromHttp,
  type Message,
} from "../../core/domain/message.ts";
import type {
  BrokerConnection,
  GetMessagesInput,
  PublishInput,
  PurgeResult,
} from "../../core/ports/broker.ts";
import { BaseBrokerClient } from "./base-client.ts";

export class UnsupportedOverHttpError extends Error {
  constructor(operation: string) {
    super(
      `${operation} is not supported over the HTTP management API — use an AMQP connection instead`,
    );
    this.name = "UnsupportedOverHttpError";
  }
}

class HttpBrokerConnection implements BrokerConnection {
  readonly channel = null;

  constructor(readonly info: ConnectionInfo) {}

  async close(): Promise<void> {
    // Nothing to release.
  }
}

export class HttpBrokerClient extends BaseBrokerClient {
  override async connect(info: ConnectionInfo): Promise<BrokerConnection> {
    return new HttpBrokerConnection(info);
  }

  override testConnection(info: ConnectionInfo): Promise<boolean> {
    return this.management(info).whoAmI();
  }

  override publishMessage(input: PublishInput): Promise<boolean> {
    const exchange =
      input.exchange === undefined || input.exchange === ""
        ? DEFAULT_EXCHANGE
        : input.exchange;
    return this.management(input.connection.info).publish(
      exchange,
      input.routingKey,
      input.payload,
    );
  }

  override async getMessages(input: GetMessagesInput): Promise<Message[]> {
    const inbound = await this.management(input.connection.info).getMessages(
      input.queueName,
      input.count,
      input.ack ?? false,
    );

    return inbound.map(messageFromHttp);
  }

  override async purgeQueue(
    queueName: string,
    connection: BrokerConnection,
  ): Promise<PurgeResult> {
    // The management API's purge endpoint returns no body, so the count is
    // genuinely unknown here rather than merely unread.
    const ok = await this.management(connection.info).purgeQueue(queueName);
    return { ok, purged: null };
  }

  override consumeMessages(): Promise<string> {
    throw new UnsupportedOverHttpError("Real-time message consumption");
  }

  override cancelConsumer(): Promise<boolean> {
    throw new UnsupportedOverHttpError("Cancelling consumers");
  }
}
