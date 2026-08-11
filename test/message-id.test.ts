import { describe, expect, it } from "vitest";
import { MESSAGE_ID_LENGTH, createMessageId } from "../src/core/domain/message-id.ts";

/** The delivery tag occupies the first 8 bytes — 16 hex characters — big-endian. */
const deliveryTagOf = (id: string) => BigInt.asIntN(64, BigInt(`0x${id.slice(0, 16)}`));

const base = {
  deliveryTagOrCount: 7,
  queue: "orders",
  exchange: "events",
  routingKey: "order.created",
  payload: Buffer.from('{"id":1}'),
};

describe("createMessageId", () => {
  it("is deterministic for identical input", () => {
    expect(createMessageId(base)).toBe(createMessageId(base));
  });

  it("produces a 40-character hex string", () => {
    const id = createMessageId(base);
    expect(id).toHaveLength(MESSAGE_ID_LENGTH);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("distinguishes messages that differ only by payload", () => {
    const other = createMessageId({ ...base, payload: Buffer.from('{"id":2}') });
    expect(createMessageId(base)).not.toBe(other);
  });

  it("distinguishes messages that differ only by delivery tag", () => {
    expect(createMessageId(base)).not.toBe(createMessageId({ ...base, deliveryTagOrCount: 8 }));
  });

  it("distinguishes messages that differ only by routing", () => {
    expect(createMessageId(base)).not.toBe(createMessageId({ ...base, routingKey: "order.updated" }));
  });

  it("treats a blank exchange and a missing one alike", () => {
    // Both collapse to "-" in the routing string, so the ids must agree.
    const blank = createMessageId({ ...base, exchange: "" });
    const spaces = createMessageId({ ...base, exchange: "   " });
    expect(blank).toBe(spaces);
  });

  it("writes the delivery tag into the leading bytes", () => {
    // The layout is wire-compatible with the original Kotlin implementation, so
    // the offsets are part of the contract, not an implementation detail.
    expect(deliveryTagOf(createMessageId(base))).toBe(7n);
  });

  it("handles large delivery tags without losing precision", () => {
    const id = createMessageId({ ...base, deliveryTagOrCount: 2 ** 40 });
    expect(deliveryTagOf(id)).toBe(BigInt(2 ** 40));
  });
});
