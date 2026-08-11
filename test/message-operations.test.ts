import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { MessageOperations } from "../src/core/usecase/message-operations.ts";
import type { BrokerConnection } from "../src/core/ports/broker.ts";
import { FakeBroker, testConnection } from "./fake-broker.ts";

function build(seed: Record<string, string[]>) {
  const broker = new FakeBroker(seed);
  const backups = new JsonMessageBackupRepository(
    new JsonSettingsStore({ configDir: mkdtempSync(join(tmpdir(), "rmq-msg-")), fileName: "backups" }),
  );
  const messages = new MessageOperations(broker, new BackedUpOperationCoordinator(backups));
  return { broker, messages, backups };
}

async function withConnection<T>(
  broker: FakeBroker,
  block: (connection: BrokerConnection) => Promise<T>,
): Promise<T> {
  return broker.withConnection(testConnection, block);
}

describe("removing a message from a queue", () => {
  let context: ReturnType<typeof build>;

  beforeEach(() => {
    context = build({ orders: ["a", "b", "c", "d"] });
  });

  it("removes only the targeted message", async () => {
    // The operation drains the queue and republishes the bystanders. Getting the
    // filter backwards destroys the queue, so this is the load-bearing test.
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));
    const target = all[1];
    expect(target).toBeDefined();

    await withConnection(broker, (open) =>
      messages.safeDeleteMessage({ id: target!.id, queueName: "orders", connection: open }),
    );

    expect(broker.payloads("orders")).toEqual(["a", "c", "d"]);
  });

  it("preserves the order of the messages it puts back", async () => {
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));

    await withConnection(broker, (open) =>
      messages.safeDeleteMessage({ id: all[0]!.id, queueName: "orders", connection: open }),
    );

    expect(broker.payloads("orders")).toEqual(["b", "c", "d"]);
  });

  it("reports what it removed and what it restored", async () => {
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));

    const outcome = await withConnection(broker, (open) =>
      messages.safeDeleteMessage({ id: all[2]!.id, queueName: "orders", connection: open }),
    );

    expect(outcome.removed).toBe(1);
    expect(outcome.restored).toBe(3);
    expect(outcome.lost).toBe(0);
  });

  it("removes several messages in one pass", async () => {
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));

    const outcome = await withConnection(broker, (open) =>
      messages.removeFromQueue({
        targets: [all[0]!.id, all[3]!.id],
        queueName: "orders",
        connection: open,
      }),
    );

    expect(outcome.removed).toBe(2);
    expect(broker.payloads("orders")).toEqual(["b", "c"]);
  });

  it("leaves the queue alone when the id is not present", async () => {
    const { broker, messages } = context;

    // An id that matches nothing must still put every message back.
    const outcome = await withConnection(broker, (open) =>
      messages.safeDeleteMessage({
        id: "0".repeat(40) as never,
        queueName: "orders",
        connection: open,
      }),
    );

    expect(outcome.removed).toBe(0);
    expect(broker.payloads("orders")).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps unrestorable messages in the backup rather than dropping them", async () => {
    const { broker, messages, backups } = context;
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));

    // The broker refuses everything, so no bystander can be put back.
    broker.rejectPublishTo.add("orders");

    const outcome = await withConnection(broker, (open) =>
      messages.safeDeleteMessage({ id: all[1]!.id, queueName: "orders", connection: open }),
    );

    expect(outcome.lost).toBe(3);
    expect(outcome.unprocessedMessages).toHaveLength(3);
    expect(backups.getUnprocessedMessages(outcome.operationId)).toHaveLength(3);
  });
});

describe("moving a message to another queue", () => {
  it("publishes to the target and removes from the source", async () => {
    const { broker, messages } = build({ orders: ["a", "b", "c"], retry: [] });
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));

    const outcome = await withConnection(broker, (open) =>
      messages.safeRequeueMessage({
        message: all[1]!,
        fromQueue: "orders",
        toQueue: "retry",
        connection: open,
      }),
    );

    expect(outcome.removed).toBe(1);
    expect(broker.payloads("orders")).toEqual(["a", "c"]);
    expect(broker.payloads("retry")).toEqual(["b"]);
  });

  it("leaves the source untouched when the target refuses the message", async () => {
    // Publishing first means a failure costs nothing; removing first would lose
    // the message entirely.
    const { broker, messages } = build({ orders: ["a", "b"], retry: [] });
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));
    broker.rejectPublishTo.add("retry");

    await expect(
      withConnection(broker, (open) =>
        messages.safeRequeueMessage({
          message: all[0]!,
          fromQueue: "orders",
          toQueue: "retry",
          connection: open,
        }),
      ),
    ).rejects.toThrow(/Failed to publish/);

    expect(broker.payloads("orders")).toEqual(["a", "b"]);
  });
});

describe("reprocessing a message", () => {
  it("republishes to the original routing key and removes the queued copy", async () => {
    const { broker, messages } = build({ orders: ["a", "b"] });
    const all = await withConnection(broker, (open) => messages.getMessages("orders", 10, false, open));

    const outcome = await withConnection(broker, (open) =>
      messages.safeReprocessMessage({ message: all[0]!, fromQueue: "orders", connection: open }),
    );

    expect(outcome.removed).toBe(1);
    // The fake routes the default exchange straight back to the queue, so the
    // republished copy lands at the end and the original is gone.
    expect(broker.payloads("orders")).toEqual(["b", "a"]);
  });
});
