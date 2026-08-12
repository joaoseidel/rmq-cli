import type { ConnectionInfo } from "../src/core/domain/connection.ts";
import {
  createMessageId,
  type CompositeMessageId,
} from "../src/core/domain/message-id.ts";
import type { Message } from "../src/core/domain/message.ts";
import type { Queue } from "../src/core/domain/queue.ts";
import type { VHost } from "../src/core/domain/vhost.ts";
import {
  PartialReadError,
  type BrokerClient,
  type BrokerConnection,
  type PublishInput,
  type PurgeResult,
} from "../src/core/ports/broker.ts";
import { ConnectionInfoSchema } from "../src/core/domain/connection.ts";
import { vHost } from "../src/core/domain/vhost.ts";

export const testConnection: ConnectionInfo = ConnectionInfoSchema.parse({
  id: "test",
  type: "amqp",
  name: "test",
  host: "localhost",
  username: "guest",
  password: "guest",
  vHost: vHost("/"),
  isDefault: true,
});

export interface StoredMessage {
  readonly payload: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly properties: Readonly<Record<string, string>>;
  readonly exchange: string;
  readonly routingKey: string;
}

export interface PublishRecord {
  readonly exchange: string | undefined;
  readonly routingKey: string;
  readonly payload: string;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly properties: Readonly<Record<string, string>> | undefined;
}

function stored(payload: string, queueName: string): StoredMessage {
  return {
    payload,
    headers: {},
    properties: {},
    exchange: "",
    routingKey: queueName,
  };
}

export class FakeBroker implements BrokerClient {
  readonly queues = new Map<string, StoredMessage[]>();
  readonly rejectPublishTo = new Set<string>();
  readonly rejectReadsFrom = new Set<string>();
  readonly failReadsAfter = new Map<string, number>();
  readonly published: PublishRecord[] = [];
  connectionsOpened = 0;

  constructor(seed: Record<string, string[]> = {}) {
    for (const [name, payloads] of Object.entries(seed)) {
      this.queues.set(
        name,
        payloads.map((payload) => stored(payload, name)),
      );
    }
  }

  private contents(name: string): StoredMessage[] {
    const existing = this.queues.get(name);
    if (existing !== undefined) return existing;

    const created: StoredMessage[] = [];
    this.queues.set(name, created);
    return created;
  }

  private toMessage(
    queueName: string,
    entry: StoredMessage,
    index: number,
  ): Message {
    return {
      transport: "amqp",
      id: createMessageId({
        deliveryTagOrCount: index + 1,
        queue: queueName,
        exchange: entry.exchange,
        routingKey: entry.routingKey,
        payload: Buffer.from(entry.payload),
      }),
      exchange: entry.exchange,
      routingKey: entry.routingKey,
      payload: entry.payload,
      headers: { ...entry.headers },
      properties: { ...entry.properties },
    };
  }

  payloads(queueName: string): string[] {
    return this.contents(queueName).map((entry) => entry.payload);
  }

  stored(queueName: string): StoredMessage[] {
    return [...this.contents(queueName)];
  }

  seedMessage(queueName: string, entry: StoredMessage): void {
    this.contents(queueName).push(entry);
  }

  async connect(info: ConnectionInfo): Promise<BrokerConnection> {
    this.connectionsOpened += 1;
    return {
      info,
      channel: null,
      ackAll: async () => {},
      requeueAll: async () => {},
      close: async () => {},
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async publishMessage(input: PublishInput): Promise<boolean> {
    this.published.push({
      exchange: input.exchange,
      routingKey: input.routingKey,
      payload: input.payload,
      headers: input.headers,
      properties: input.properties,
    });

    if (this.rejectPublishTo.has(input.routingKey)) return false;

    const queue = this.queues.get(input.routingKey);
    if (queue === undefined) return false;

    queue.push({
      payload: input.payload,
      headers: { ...input.headers },
      properties: { ...input.properties },
      exchange: input.exchange ?? "",
      routingKey: input.routingKey,
    });

    return true;
  }

  async getMessages(input: {
    queueName: string;
    count: number;
    ack?: boolean;
  }): Promise<Message[]> {
    if (this.rejectReadsFrom.has(input.queueName)) {
      throw new Error(`NOT_FOUND - no queue '${input.queueName}'`);
    }

    const queue = this.contents(input.queueName);
    const cap = this.failReadsAfter.get(input.queueName);
    const wanted = Math.min(input.count, queue.length);
    const taken = queue.slice(0, cap === undefined ? wanted : Math.min(cap, wanted));

    const read = taken.map((entry, index) =>
      this.toMessage(input.queueName, entry, index),
    );

    if (cap !== undefined && wanted > cap) {
      throw new PartialReadError(
        input.queueName,
        read,
        new Error("connection reset"),
      );
    }

    if (input.ack === true) queue.splice(0, taken.length);

    return read;
  }

  async purgeQueue(queueName: string): Promise<PurgeResult> {
    const queue = this.contents(queueName);
    const purged = queue.length;
    queue.length = 0;
    return { ok: true, purged };
  }

  async listQueues(pattern: string | null): Promise<Queue[]> {
    return [...this.queues.entries()]
      .filter(
        ([name]) =>
          pattern === null || name.includes(pattern.replaceAll("*", "")),
      )
      .map(([name, entries]) => ({
        name,
        vhost: "/",
        messagesReady: entries.length,
        messagesUnacknowledged: 0,
      }));
  }

  async listVHosts(): Promise<VHost[]> {
    return [{ id: "/", name: "/", description: "", isDefault: true }];
  }

  async consumeMessages(): Promise<string> {
    throw new Error("not supported by the fake broker");
  }

  async cancelConsumer(): Promise<boolean> {
    return true;
  }

  async findMessage(input: {
    id: CompositeMessageId;
    queueName: string;
  }): Promise<Message | null> {
    const messages = await this.getMessages({
      queueName: input.queueName,
      count: Number.MAX_SAFE_INTEGER,
    });
    return messages.find((message) => message.id === input.id) ?? null;
  }

  async withConnection<T>(
    info: ConnectionInfo,
    block: (connection: BrokerConnection) => Promise<T>,
  ): Promise<T> {
    return block(await this.connect(info));
  }
}
