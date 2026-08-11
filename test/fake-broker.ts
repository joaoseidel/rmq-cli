import type { ConnectionInfo } from "../src/core/domain/connection.ts";
import { createMessageId, type CompositeMessageId } from "../src/core/domain/message-id.ts";
import type { Message } from "../src/core/domain/message.ts";
import type { Queue } from "../src/core/domain/queue.ts";
import type { VHost } from "../src/core/domain/vhost.ts";
import type { BrokerClient, BrokerConnection, PurgeResult } from "../src/core/ports/broker.ts";
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

/**
 * An in-memory broker.
 *
 * Models the one property that makes queue surgery dangerous: `getMessages` with
 * `ack` genuinely removes messages, so any code that drains a queue and fails to
 * put messages back loses them here exactly as it would in production.
 */
export class FakeBroker implements BrokerClient {
  readonly queues = new Map<string, string[]>();
  /** Queue names for which publishing fails, to exercise the recovery paths. */
  readonly rejectPublishTo = new Set<string>();
  /** Queue names whose reads throw, standing in for a queue deleted mid-scan. */
  readonly rejectReadsFrom = new Set<string>();

  constructor(seed: Record<string, string[]> = {}) {
    for (const [name, payloads] of Object.entries(seed)) this.queues.set(name, [...payloads]);
  }

  private contents(name: string): string[] {
    const existing = this.queues.get(name);
    if (existing !== undefined) return existing;

    const created: string[] = [];
    this.queues.set(name, created);
    return created;
  }

  private toMessage(queueName: string, payload: string, index: number): Message {
    return {
      transport: "amqp",
      id: createMessageId({
        deliveryTagOrCount: index + 1,
        queue: queueName,
        exchange: "",
        routingKey: queueName,
        payload: Buffer.from(payload),
      }),
      exchange: "",
      routingKey: queueName,
      payload,
      headers: {},
      properties: {},
    };
  }

  payloads(queueName: string): string[] {
    return [...this.contents(queueName)];
  }

  async connect(info: ConnectionInfo): Promise<BrokerConnection> {
    return { info, channel: null, close: async () => {} };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async publishMessage(input: { routingKey: string; payload: string }): Promise<boolean> {
    if (this.rejectPublishTo.has(input.routingKey)) return false;
    this.contents(input.routingKey).push(input.payload);
    return true;
  }

  async getMessages(input: { queueName: string; count: number; ack?: boolean }): Promise<Message[]> {
    if (this.rejectReadsFrom.has(input.queueName)) {
      throw new Error(`NOT_FOUND - no queue '${input.queueName}'`);
    }

    const queue = this.contents(input.queueName);
    const taken = queue.slice(0, Math.min(input.count, queue.length));

    if (input.ack === true) queue.splice(0, taken.length);

    return taken.map((payload, index) => this.toMessage(input.queueName, payload, index));
  }

  async purgeQueue(queueName: string): Promise<PurgeResult> {
    const queue = this.contents(queueName);
    const purged = queue.length;
    queue.length = 0;
    return { ok: true, purged };
  }

  async listQueues(pattern: string | null): Promise<Queue[]> {
    return [...this.queues.entries()]
      .filter(([name]) => pattern === null || name.includes(pattern.replaceAll("*", "")))
      .map(([name, payloads]) => ({
        name,
        vhost: "/",
        messagesReady: payloads.length,
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

  async findMessage(input: { id: CompositeMessageId; queueName: string }): Promise<Message | null> {
    const messages = await this.getMessages({ queueName: input.queueName, count: Number.MAX_SAFE_INTEGER });
    return messages.find((message) => message.id === input.id) ?? null;
  }

  async withConnection<T>(info: ConnectionInfo, block: (connection: BrokerConnection) => Promise<T>): Promise<T> {
    return block(await this.connect(info));
  }
}
