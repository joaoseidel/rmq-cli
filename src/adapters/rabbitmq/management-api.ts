import {
  httpApiUrl,
  type ConnectionInfo,
} from "../../core/domain/connection.ts";
import type { HttpInboundMessage } from "../../core/domain/message.ts";
import type { Queue } from "../../core/domain/queue.ts";
import { toGlobRegex } from "../../core/util/glob.ts";
import { createLogger } from "../../core/util/logger.ts";

const logger = createLogger("management-api");

/** Page size for queue listings. Large enough that most brokers need one call. */
const PAGE_SIZE = 500;

export class ManagementApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
  ) {
    super(
      `Management API responded ${status} ${statusText}${body === "" ? "" : `: ${body}`}`,
    );
    this.name = "ManagementApiError";
  }
}

interface QueuesPage {
  items?: unknown[];
  page?: number;
  page_count?: number;
}

interface RawQueue {
  name?: string;
  vhost?: string;
  messages_ready?: number;
  messages_unacknowledged?: number;
}

interface RawVHost {
  name?: string;
  description?: string;
}

export class ManagementApi {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(private readonly info: ConnectionInfo) {
    this.baseUrl = httpApiUrl(info);
    this.authorization = `Basic ${Buffer.from(`${info.username}:${info.password}`).toString("base64")}`;
  }

  private get vhostSegment(): string {
    return encodeURIComponent(this.info.vHost.name);
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: this.authorization,
        "content-type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new ManagementApiError(
        response.status,
        response.statusText,
        await response.text().catch(() => ""),
      );
    }

    return response;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.request(path);
    return (await response.json()) as T;
  }

  async whoAmI(): Promise<boolean> {
    try {
      await this.getJson<{ name?: string }>("/whoami");
      return true;
    } catch (error) {
      logger.error(`whoami failed for ${this.info.name}`, error);
      return false;
    }
  }

  async listQueues(pattern: string | null): Promise<Queue[]> {
    const columns = [
      "name",
      "vhost",
      "messages_ready",
      "messages_unacknowledged",
    ].join(",");
    const queues: Queue[] = [];

    let page = 1;
    let pageCount = 1;

    try {
      do {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(PAGE_SIZE),
          columns,
          sort: "messages_unacknowledged",
          sort_reverse: "true",
          pagination: "true",
        });

        if (pattern !== null) {
          params.set("name", toGlobRegex(pattern).source);
          params.set("use_regex", "true");
        }

        const body = await this.getJson<QueuesPage>(
          `/queues/${this.vhostSegment}?${params.toString()}`,
        );

        for (const item of body.items ?? []) {
          const raw = item as RawQueue;
          if (raw.name === undefined) continue;
          queues.push({
            name: raw.name,
            vhost: raw.vhost ?? this.info.vHost.name,
            messagesReady: raw.messages_ready ?? 0,
            messagesUnacknowledged: raw.messages_unacknowledged ?? 0,
          });
        }

        pageCount = body.page_count ?? 1;
        page += 1;
      } while (page <= pageCount);

      return queues;
    } catch (error) {
      logger.error("Failed to list queues", error);
      return queues;
    }
  }

  async listVHosts(): Promise<{ name: string; description: string }[]> {
    try {
      const body = await this.getJson<RawVHost[]>("/vhosts");
      return body
        .filter(
          (raw): raw is RawVHost & { name: string } => raw.name !== undefined,
        )
        .map((raw) => ({ name: raw.name, description: raw.description ?? "" }));
    } catch (error) {
      logger.error("Failed to list vhosts", error);
      return [];
    }
  }

  async getMessages(
    queueName: string,
    count: number,
    ack: boolean,
  ): Promise<HttpInboundMessage[]> {
    try {
      const response = await this.request(
        `/queues/${this.vhostSegment}/${encodeURIComponent(queueName)}/get`,
        {
          method: "POST",
          body: JSON.stringify({
            count: Math.min(count, 100_000),
            ackmode: ack ? "ack_requeue_false" : "ack_requeue_true",
            encoding: "auto",
          }),
        },
      );

      return (await response.json()) as HttpInboundMessage[];
    } catch (error) {
      logger.error(`Failed to get messages from queue '${queueName}'`, error);
      return [];
    }
  }

  async publish(
    exchange: string,
    routingKey: string,
    payload: string,
  ): Promise<boolean> {
    try {
      const response = await this.request(
        `/exchanges/${this.vhostSegment}/${encodeURIComponent(exchange)}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            properties: {},
            routing_key: routingKey,
            payload,
            payload_encoding: "string",
          }),
        },
      );

      const body = (await response.json()) as { routed?: boolean };
      return body.routed !== false;
    } catch (error) {
      logger.error(`Failed to publish to exchange '${exchange}'`, error);
      return false;
    }
  }

  async purgeQueue(queueName: string): Promise<boolean> {
    try {
      await this.request(
        `/queues/${this.vhostSegment}/${encodeURIComponent(queueName)}/contents`,
        {
          method: "DELETE",
        },
      );
      return true;
    } catch (error) {
      logger.error(`Failed to purge queue '${queueName}'`, error);
      return false;
    }
  }
}
