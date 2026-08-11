import { createHash } from "node:crypto";

/**
 * Byte layout of a composite message id. The total is 20 bytes, rendered as a
 * 40-character lowercase hex string.
 *
 * ```
 *  0        8               16        20
 *  ├────────┼───────────────┼─────────┤
 *  │ tag    │ routing hash  │ content │
 *  │ i64 BE │ sha256[0..8]  │ sha[..4]│
 * ```
 *
 * This layout is wire-compatible with the original Kotlin implementation, so ids
 * minted by either version address the same message.
 */
const DELIVERY_TAG_SIZE = 8;
const ROUTING_INFO_SIZE = 8;
const CONTENT_HASH_SIZE = 4;
const TOTAL_BYTES = DELIVERY_TAG_SIZE + ROUTING_INFO_SIZE + CONTENT_HASH_SIZE;

export const MESSAGE_ID_LENGTH = TOTAL_BYTES * 2;

export type CompositeMessageId = string & {
  readonly __brand: "CompositeMessageId";
};

export function messageId(value: string): CompositeMessageId {
  return value as CompositeMessageId;
}

function buildRoutingInfo(
  queue: string | null,
  exchange: string,
  routingKey: string,
): string {
  const orDash = (value: string) => (value.trim() === "" ? "-" : value);
  return `q:${queue ?? "-"}:e:${orDash(exchange)}:rk:${orDash(routingKey)}`;
}

function sha256(data: Buffer | string): Buffer {
  return createHash("sha256").update(data).digest();
}

export function createMessageId(input: {
  deliveryTagOrCount: bigint | number;
  queue: string | null;
  exchange: string;
  routingKey: string;
  payload: Buffer;
}): CompositeMessageId {
  const routingInfoHash = sha256(
    Buffer.from(
      buildRoutingInfo(input.queue, input.exchange, input.routingKey),
      "utf8",
    ),
  );
  const contentHash = sha256(input.payload);

  const buffer = Buffer.alloc(TOTAL_BYTES);
  buffer.writeBigInt64BE(BigInt(input.deliveryTagOrCount), 0);
  routingInfoHash.copy(buffer, DELIVERY_TAG_SIZE, 0, ROUTING_INFO_SIZE);
  contentHash.copy(
    buffer,
    DELIVERY_TAG_SIZE + ROUTING_INFO_SIZE,
    0,
    CONTENT_HASH_SIZE,
  );

  return messageId(buffer.toString("hex"));
}
