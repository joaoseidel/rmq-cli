import type { Channel } from "amqplib";
import type { ConnectionInfo } from "../domain/connection.ts";
import type { CompositeMessageId } from "../domain/message-id.ts";
import type { Message } from "../domain/message.ts";
import type { Queue } from "../domain/queue.ts";
import type { VHost } from "../domain/vhost.ts";

export interface BrokerConnection {
  readonly info: ConnectionInfo;
  readonly channel: Channel | null;
  ackAll(): Promise<void>;
  requeueAll(): Promise<void>;
  close(): Promise<void>;
}

export class PartialReadError extends Error {
  constructor(
    readonly queueName: string,
    readonly messages: readonly Message[],
    readonly source: unknown,
  ) {
    super(
      `read failed after ${messages.length} messages: ${
        source instanceof Error ? source.message : String(source)
      }`,
    );
    this.name = "PartialReadError";
  }
}

export interface PurgeResult {
  readonly ok: boolean;
  readonly purged: number | null;
}

export type MessageHandler = (message: Message, consumerTag: string) => void;
export type CancellationHandler = (consumerTag: string) => void;

export interface PublishInput {
  readonly exchange?: string | undefined;
  readonly routingKey: string;
  readonly payload: string;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly properties?: Readonly<Record<string, string>> | undefined;
  readonly connection: BrokerConnection;
}

export interface GetMessagesInput {
  readonly queueName: string;
  readonly count: number;
  readonly ack?: boolean;
  readonly connection: BrokerConnection;
}

export interface ConsumeInput {
  readonly queueName: string;
  readonly autoAck: boolean;
  readonly prefetchCount: number;
  readonly onMessage: MessageHandler;
  readonly onCancel: CancellationHandler;
  readonly connection: BrokerConnection;
}

export interface FindMessageInput {
  readonly id: CompositeMessageId;
  readonly queueName: string;
  readonly ack?: boolean;
  readonly connection: BrokerConnection;
}

export interface BrokerClient {
  connect(info: ConnectionInfo): Promise<BrokerConnection>;
  testConnection(info: ConnectionInfo): Promise<boolean>;

  publishMessage(input: PublishInput): Promise<boolean>;

  getMessages(input: GetMessagesInput): Promise<Message[]>;

  purgeQueue(
    queueName: string,
    connection: BrokerConnection,
  ): Promise<PurgeResult>;

  listQueues(
    pattern: string | null,
    connection: BrokerConnection,
  ): Promise<Queue[]>;

  listVHosts(connection: BrokerConnection): Promise<VHost[]>;

  consumeMessages(input: ConsumeInput): Promise<string>;

  cancelConsumer(
    consumerTag: string,
    connection: BrokerConnection,
  ): Promise<boolean>;

  withConnection<T>(
    info: ConnectionInfo,
    block: (connection: BrokerConnection) => Promise<T>,
  ): Promise<T>;

  findMessage(input: FindMessageInput): Promise<Message | null>;
}
