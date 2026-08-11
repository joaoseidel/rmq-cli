import {
  connect as amqpConnect,
  type ChannelModel,
  type ConfirmChannel,
} from "amqplib";
import { randomUUID } from "node:crypto";
import {
  amqpUrl,
  isAmqp,
  type ConnectionInfo,
} from "../../core/domain/connection.ts";
import {
  DEFAULT_EXCHANGE,
  messageFromAmqp,
  type Message,
} from "../../core/domain/message.ts";
import type {
  BrokerConnection,
  ConsumeInput,
  GetMessagesInput,
  PublishInput,
  PurgeResult,
} from "../../core/ports/broker.ts";
import { createLogger } from "../../core/util/logger.ts";
import { BaseBrokerClient } from "./base-client.ts";

const logger = createLogger("amqp-client");

const MAX_PREFETCH = 65_535;

const CONNECT_TIMEOUT_MS = 10_000;

const PUBLISH_TOKEN_HEADER = "x-rmq-publish-token";

class AmqpBrokerConnection implements BrokerConnection {
  private readonly returned = new Set<string>();

  constructor(
    readonly info: ConnectionInfo,
    readonly channel: ConfirmChannel,
    private readonly model: ChannelModel,
  ) {
    channel.on("return", (message) => {
      const token = message.properties.headers?.[PUBLISH_TOKEN_HEADER];
      if (typeof token === "string") this.returned.add(token);
    });
  }

  async publishConfirmed(
    exchange: string,
    routingKey: string,
    payload: Buffer,
  ): Promise<boolean> {
    const token = randomUUID();

    const confirmed = await new Promise<boolean>((resolve) => {
      this.channel.publish(
        exchange,
        routingKey,
        payload,
        {
          persistent: true,
          mandatory: true,
          headers: { [PUBLISH_TOKEN_HEADER]: token },
        },
        (error) => resolve(error === null || error === undefined),
      );
    });

    const wasReturned = this.returned.delete(token);
    return confirmed && !wasReturned;
  }

  async close(): Promise<void> {
    try {
      await this.channel.close();
    } catch (error) {
      logger.debug("Channel already closed", error);
    }

    try {
      await this.model.close();
    } catch (error) {
      logger.debug("Connection already closed", error);
    }
  }
}

function toWireExchange(exchange: string | undefined): string {
  if (
    exchange === undefined ||
    exchange === "" ||
    exchange === DEFAULT_EXCHANGE
  )
    return "";
  return exchange;
}

export class AmqpBrokerClient extends BaseBrokerClient {
  override async connect(info: ConnectionInfo): Promise<BrokerConnection> {
    if (!isAmqp(info)) {
      throw new Error(`Connection '${info.name}' is not an AMQP connection`);
    }

    const model = await amqpConnect(amqpUrl(info), {
      timeout: CONNECT_TIMEOUT_MS,
    });

    model.on("error", (error) => logger.warn("AMQP connection error", error));

    const channel = await model.createConfirmChannel();
    channel.on("error", (error) => logger.warn("AMQP channel error", error));

    return new AmqpBrokerConnection(info, channel, model);
  }

  override async testConnection(info: ConnectionInfo): Promise<boolean> {
    try {
      const connection = await this.connect(info);
      await connection.close();
      return true;
    } catch (error) {
      logger.error(`Failed to connect to '${info.name}'`, error);
      return false;
    }
  }

  override async publishMessage(input: PublishInput): Promise<boolean> {
    const connection = input.connection;
    if (!(connection instanceof AmqpBrokerConnection)) return false;

    try {
      return await connection.publishConfirmed(
        toWireExchange(input.exchange),
        input.routingKey,
        Buffer.from(input.payload, "utf8"),
      );
    } catch (error) {
      logger.error("Failed to publish message", error);
      return false;
    }
  }

  override async getMessages(input: GetMessagesInput): Promise<Message[]> {
    const channel = input.connection.channel;
    if (channel === null) return [];

    const messages: Message[] = [];

    try {
      for (let fetched = 0; fetched < input.count; fetched += 1) {
        const delivery = await channel.get(input.queueName, {
          noAck: input.ack ?? false,
        });
        if (delivery === false) break;
        messages.push(messageFromAmqp(delivery));
      }
    } catch (error) {
      logger.error(
        `Failed to get messages from queue '${input.queueName}'`,
        error,
      );
    }

    return messages;
  }

  override async purgeQueue(
    queueName: string,
    connection: BrokerConnection,
  ): Promise<PurgeResult> {
    const channel = connection.channel;
    if (channel === null) return { ok: false, purged: null };

    try {
      const { messageCount } = await channel.purgeQueue(queueName);
      return { ok: true, purged: messageCount };
    } catch (error) {
      logger.error(`Failed to purge queue '${queueName}'`, error);
      return { ok: false, purged: null };
    }
  }

  override async consumeMessages(input: ConsumeInput): Promise<string> {
    const channel = input.connection.channel;
    if (channel === null) {
      throw new Error("Cannot consume: no AMQP channel on this connection");
    }

    if (input.prefetchCount > 0) {
      await channel.prefetch(Math.min(input.prefetchCount, MAX_PREFETCH));
    }

    const { consumerTag } = await channel.consume(
      input.queueName,
      (delivery) => {
        if (delivery === null) {
          input.onCancel(consumerTag);
          return;
        }
        input.onMessage(messageFromAmqp(delivery), delivery.fields.consumerTag);
      },
      { noAck: input.autoAck },
    );

    return consumerTag;
  }

  override async cancelConsumer(
    consumerTag: string,
    connection: BrokerConnection,
  ): Promise<boolean> {
    const channel = connection.channel;
    if (channel === null) return false;

    try {
      await channel.cancel(consumerTag);
      return true;
    } catch (error) {
      logger.error(`Failed to cancel consumer '${consumerTag}'`, error);
      return false;
    }
  }
}
