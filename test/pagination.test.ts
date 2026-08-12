import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { MessageOperations } from "../src/core/usecase/message-operations.ts";
import { FakeBroker, testConnection } from "./fake-broker.ts";

function build(seed: Record<string, string[]>, cursored: boolean) {
  const broker = new FakeBroker(seed);
  broker.cursored = cursored;

  const backups = new JsonMessageBackupRepository(
    new JsonSettingsStore({
      configDir: mkdtempSync(join(tmpdir(), "rmq-page-")),
      fileName: "backups",
    }),
  );

  return {
    broker,
    messages: new MessageOperations(
      broker,
      new BackedUpOperationCoordinator(backups),
      backups,
    ),
  };
}

const deep = Array.from({ length: 25 }, (_, index) => `m${index}`);

describe.each([
  ["a cursored transport", true],
  ["a transport without a cursor", false],
])("paging through a queue over %s", (_label, cursored) => {
  it("hands back consecutive pages", async () => {
    const { messages } = build({ orders: deep }, cursored);
    const session = await messages.openPeekSession({
      queueName: "orders",
      info: testConnection,
    });

    const first = await session.next(10);
    const second = await session.next(10);

    expect(first.messages.map((entry) => entry.payload)).toEqual(
      deep.slice(0, 10),
    );
    expect(second.messages.map((entry) => entry.payload)).toEqual(
      deep.slice(10, 20),
    );
    expect(first.exhausted).toBe(false);
    expect(second.exhausted).toBe(false);

    await session.close();
  });

  it("reports the end of the queue and stops fetching", async () => {
    const { messages } = build({ orders: deep }, cursored);
    const session = await messages.openPeekSession({
      queueName: "orders",
      info: testConnection,
    });

    await session.next(10);
    await session.next(10);
    const last = await session.next(10);
    const past = await session.next(10);

    expect(last.messages.map((entry) => entry.payload)).toEqual(deep.slice(20));
    expect(last.exhausted).toBe(true);
    expect(past.messages).toEqual([]);

    await session.close();
  });

  it("leaves the queue exactly as it found it", async () => {
    const { broker, messages } = build({ orders: deep }, cursored);
    const session = await messages.openPeekSession({
      queueName: "orders",
      info: testConnection,
    });

    await session.next(10);
    await session.next(10);
    await session.close();

    expect(broker.payloads("orders")).toEqual(deep);
  });

  it("opens exactly one connection for the whole session", async () => {
    const { broker, messages } = build({ orders: deep }, cursored);
    const session = await messages.openPeekSession({
      queueName: "orders",
      info: testConnection,
    });

    await session.next(10);
    await session.next(10);

    expect(broker.connectionsOpened).toBe(1);
    await session.close();
  });

  it("treats an empty queue as exhausted straight away", async () => {
    const { messages } = build({ orders: [] }, cursored);
    const session = await messages.openPeekSession({
      queueName: "orders",
      info: testConnection,
    });

    const page = await session.next(10);

    expect(page.messages).toEqual([]);
    expect(page.exhausted).toBe(true);

    await session.close();
  });
});

describe("paging when a read fails part way", () => {
  it("keeps what it read and stops", async () => {
    const { messages } = build({ orders: deep }, true);
    const session = await messages.openPeekSession({
      queueName: "orders",
      info: testConnection,
    });

    const first = await session.next(10);
    expect(first.messages).toHaveLength(10);

    const broken = build({ orders: deep }, true);
    broken.broker.failReadsAfter.set("orders", 4);
    const failing = await broken.messages.openPeekSession({
      queueName: "orders",
      info: testConnection,
    });

    const page = await failing.next(10);
    expect(page.messages).toHaveLength(4);
    expect(page.exhausted).toBe(true);

    await session.close();
    await failing.close();
  });
});
