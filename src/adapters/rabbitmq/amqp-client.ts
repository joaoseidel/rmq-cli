import {
  connect as amqpConnect,
  type Channel,
  type ChannelModel,
} from "amqplib";
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

/** RabbitMQ rejects a prefetch above this; clamp rather than fail the command. */
const MAX_PREFETCH = 65_535;

/** How long to wait for a TCP connection before giving up. */
const CONNECT_TIMEOUT_MS = 10_000;

class AmqpBrokerConnection implements BrokerConnection {
  constructor(
    readonly info: ConnectionInfo,
    readonly channel: Channel,
    private readonly model: ChannelModel,
  ) {}

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

    // amqplib emits 'error' on the model; without a listener Node would treat a
    // broker-side close as an unhandled exception and kill the CLI.
    model.on("error", (error) => logger.warn("AMQP connection error", error));

    const channel = await model.createChannel();
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
    const channel = input.connection.channel;
    if (channel === null) return false;

    try {
      return channel.publish(
        toWireExchange(input.exchange),
        input.routingKey,
        Buffer.from(input.payload, "utf8"),
        { persistent: true },
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
      // The purge-ok frame carries the true count, unlike the management API's
      // periodically-sampled statistics.
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
        // amqplib delivers null when the server cancels the consumer.
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
