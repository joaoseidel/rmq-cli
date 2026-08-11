import type { ConsumeMessage, GetMessage, MessageProperties } from "amqplib";
import { z } from "zod";
import {
  createMessageId,
  messageId,
  type CompositeMessageId,
} from "./message-id.ts";

export const MessageSchema = z.object({
  transport: z.enum(["amqp", "http"]),
  id: z.string().transform(messageId),
  exchange: z.string(),
  routingKey: z.string(),
  payload: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  properties: z.record(z.string(), z.string()).default({}),
});

export type Message = Omit<z.infer<typeof MessageSchema>, "id"> & {
  id: CompositeMessageId;
};

export const DEFAULT_EXCHANGE = "amq.default";

const AMQP_PROPERTY_KEYS = [
  "contentType",
  "contentEncoding",
  "deliveryMode",
  "priority",
  "correlationId",
  "replyTo",
  "expiration",
  "messageId",
  "timestamp",
  "type",
  "userId",
  "appId",
  "clusterId",
] as const satisfies readonly (keyof MessageProperties)[];

function stringifyRecord(
  source: Record<string, unknown> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined || value === null) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
}

function amqpProperties(properties: MessageProperties): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of AMQP_PROPERTY_KEYS) {
    const value = properties[key];
    if (value === undefined || value === null) continue;
    result[key] = String(value);
  }
  return result;
}

export function messageFromAmqp(
  delivery: GetMessage | ConsumeMessage,
): Message {
  const { fields, properties, content } = delivery;

  return {
    transport: "amqp",
    id: createMessageId({
      deliveryTagOrCount: fields.deliveryTag,
      queue: fields.routingKey,
      exchange: fields.exchange,
      routingKey: fields.routingKey,
      payload: content,
    }),
    exchange: fields.exchange,
    routingKey: fields.routingKey,
    payload: content.toString("utf8"),
    headers: stringifyRecord(properties.headers),
    properties: amqpProperties(properties),
  };
}

export interface HttpInboundMessage {
  payload: string;
  payload_encoding?: string;
  exchange?: string;
  routing_key: string;
  message_count: number;
  redelivered?: boolean;
  properties?: {
    headers?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export function messageFromHttp(inbound: HttpInboundMessage): Message {
  const payload =
    inbound.payload_encoding === "base64"
      ? Buffer.from(inbound.payload, "base64")
      : Buffer.from(inbound.payload, "utf8");

  const exchange =
    inbound.exchange === undefined || inbound.exchange === ""
      ? DEFAULT_EXCHANGE
      : inbound.exchange;
  const { headers, ...rest } = inbound.properties ?? {};

  return {
    transport: "http",
    id: createMessageId({
      deliveryTagOrCount: inbound.message_count,
      queue: inbound.routing_key,
      exchange,
      routingKey: inbound.routing_key,
      payload,
    }),
    exchange,
    routingKey: inbound.routing_key,
    payload: payload.toString("utf8"),
    headers: stringifyRecord(headers),
    properties: stringifyRecord(rest),
  };
}

export function displayExchange(message: Message): string {
  return message.exchange === "" ? DEFAULT_EXCHANGE : message.exchange;
}
