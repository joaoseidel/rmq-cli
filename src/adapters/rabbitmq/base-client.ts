import type { ConnectionInfo } from "../../core/domain/connection.ts";
import type { Message } from "../../core/domain/message.ts";
import type { Queue } from "../../core/domain/queue.ts";
import type { VHost } from "../../core/domain/vhost.ts";
import type {
  BrokerClient,
  BrokerConnection,
  ConsumeInput,
  FindMessageInput,
  GetMessagesInput,
  PublishInput,
  PurgeResult,
} from "../../core/ports/broker.ts";
import { ManagementApi } from "./management-api.ts";

export abstract class BaseBrokerClient implements BrokerClient {
  abstract connect(info: ConnectionInfo): Promise<BrokerConnection>;
  abstract testConnection(info: ConnectionInfo): Promise<boolean>;
  abstract publishMessage(input: PublishInput): Promise<boolean>;
  abstract getMessages(input: GetMessagesInput): Promise<Message[]>;
  abstract purgeQueue(
    queueName: string,
    connection: BrokerConnection,
  ): Promise<PurgeResult>;
  abstract consumeMessages(input: ConsumeInput): Promise<string>;
  abstract cancelConsumer(
    consumerTag: string,
    connection: BrokerConnection,
  ): Promise<boolean>;

  protected management(info: ConnectionInfo): ManagementApi {
    return new ManagementApi(info);
  }

  listQueues(
    pattern: string | null,
    connection: BrokerConnection,
  ): Promise<Queue[]> {
    return this.management(connection.info).listQueues(pattern);
  }

  async listVHosts(connection: BrokerConnection): Promise<VHost[]> {
    const raw = await this.management(connection.info).listVHosts();
    return raw.map((entry) => ({
      id: entry.name,
      name: entry.name,
      description: entry.description,
      isDefault: connection.info.vHost.name === entry.name,
    }));
  }

  async findMessage(input: FindMessageInput): Promise<Message | null> {
    const messages = await this.getMessages({
      queueName: input.queueName,
      count: Number.MAX_SAFE_INTEGER,
      ack: input.ack ?? false,
      connection: input.connection,
    });

    return messages.find((message) => message.id === input.id) ?? null;
  }

  async withConnection<T>(
    info: ConnectionInfo,
    block: (connection: BrokerConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.connect(info);
    try {
      return await block(connection);
    } finally {
      await connection.close();
    }
  }
}
