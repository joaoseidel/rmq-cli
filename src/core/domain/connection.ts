import { randomUUID } from "node:crypto";
import { z } from "zod";
import { VHostSchema, type VHost } from "./vhost.ts";

const BaseConnectionSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string(),
  host: z.string(),
  username: z.string(),
  password: z.string(),
  vHost: VHostSchema,
  useSsl: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  httpPort: z.number().int().default(15672),
});

export const AmqpConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal("amqp"),
  amqpPort: z.number().int().default(5672),
});

export const HttpConnectionSchema = BaseConnectionSchema.extend({
  type: z.literal("http"),
});

export const ConnectionInfoSchema = z.discriminatedUnion("type", [
  AmqpConnectionSchema,
  HttpConnectionSchema,
]);

export type AmqpConnectionInfo = z.infer<typeof AmqpConnectionSchema>;
export type HttpConnectionInfo = z.infer<typeof HttpConnectionSchema>;
export type ConnectionInfo = z.infer<typeof ConnectionInfoSchema>;

export type ConnectionType = ConnectionInfo["type"];

export function isAmqp(
  connection: ConnectionInfo,
): connection is AmqpConnectionInfo {
  return connection.type === "amqp";
}

export function httpApiUrl(connection: ConnectionInfo): string {
  const protocol = connection.useSsl ? "https" : "http";
  return `${protocol}://${connection.host}:${connection.httpPort}/api`;
}

export function amqpUrl(connection: AmqpConnectionInfo): string {
  const protocol = connection.useSsl ? "amqps" : "amqp";
  const user = encodeURIComponent(connection.username);
  const password = encodeURIComponent(connection.password);
  const vhost = encodeURIComponent(connection.vHost.name);
  return `${protocol}://${user}:${password}@${connection.host}:${connection.amqpPort}/${vhost}`;
}

export function portSummary(connection: ConnectionInfo): string {
  return isAmqp(connection)
    ? `${connection.amqpPort} (AMQP) / ${connection.httpPort} (HTTP)`
    : `${connection.httpPort} (HTTP)`;
}

export function withVHost(
  connection: ConnectionInfo,
  target: VHost,
): ConnectionInfo {
  return { ...connection, vHost: target };
}

export function withIsDefault(
  connection: ConnectionInfo,
  isDefault: boolean,
): ConnectionInfo {
  return { ...connection, isDefault };
}
