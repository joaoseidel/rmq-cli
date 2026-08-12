import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import type { OperationProgress } from "../src/core/domain/operation.ts";
import { ALL_MESSAGES } from "../src/core/usecase/message-operations.ts";
import {
  QueueOperations,
  totalsOf,
} from "../src/core/usecase/queue-operations.ts";
import { FakeBroker, testConnection } from "./fake-broker.ts";

function setUp(seed: Record<string, string[]>) {
  const broker = new FakeBroker(seed);
  const backups = new JsonMessageBackupRepository(
    new JsonSettingsStore({
      configDir: mkdtempSync(join(tmpdir(), "rmq-bulk-")),
      fileName: "backups",
    }),
  );

  return {
    broker,
    backups,
    queues: new QueueOperations(broker, new BackedUpOperationCoordinator(backups)),
  };
}

describe("moving several queues into one", () => {
  it("drains every source into the destination", async () => {
    const { broker, queues } = setUp({
      "dlq-a": ["a1", "a2"],
      "dlq-b": ["b1"],
      "dlq-c": ["c1", "c2", "c3"],
      retry: [],
    });

    const outcomes = await broker.withConnection(testConnection, (open) =>
      queues.safeRequeueQueues({
        fromQueues: ["dlq-a", "dlq-b", "dlq-c"],
        toQueue: "retry",
        limit: ALL_MESSAGES,
        connection: open,
      }),
    );

    expect(totalsOf(outcomes)).toEqual({ successful: 6, failed: 0 });
    expect(broker.payloads("retry")).toEqual([
      "a1",
      "a2",
      "b1",
      "c1",
      "c2",
      "c3",
    ]);
    expect(broker.payloads("dlq-a")).toEqual([]);
    expect(broker.payloads("dlq-b")).toEqual([]);
    expect(broker.payloads("dlq-c")).toEqual([]);
  });

  it("caps each source at the limit rather than the whole run", async () => {
    const { broker, queues } = setUp({
      "dlq-a": ["a1", "a2", "a3"],
      "dlq-b": ["b1", "b2", "b3"],
      retry: [],
    });

    await broker.withConnection(testConnection, (open) =>
      queues.safeRequeueQueues({
        fromQueues: ["dlq-a", "dlq-b"],
        toQueue: "retry",
        limit: 2,
        connection: open,
      }),
    );

    expect(broker.payloads("retry")).toEqual(["a1", "a2", "b1", "b2"]);
    expect(broker.payloads("dlq-a")).toEqual(["a3"]);
    expect(broker.payloads("dlq-b")).toEqual(["b3"]);
  });

  it("refuses when the destination is also one of the sources", async () => {
    const { broker, queues, backups } = setUp({
      "dlq-a": ["a1"],
      retry: ["r1"],
    });

    await expect(
      broker.withConnection(testConnection, (open) =>
        queues.safeRequeueQueues({
          fromQueues: ["dlq-a", "retry"],
          toQueue: "retry",
          limit: ALL_MESSAGES,
          connection: open,
        }),
      ),
    ).rejects.toThrow(/both a source and the destination/);

    expect(broker.payloads("dlq-a")).toEqual(["a1"]);
    expect(broker.payloads("retry")).toEqual(["r1"]);
    expect(backups.listInterruptedOperations()).toHaveLength(0);
  });

  it("refuses before taking anything when the destination is missing", async () => {
    const { broker, queues, backups } = setUp({
      "dlq-a": ["a1"],
      "dlq-b": ["b1"],
    });

    await expect(
      broker.withConnection(testConnection, (open) =>
        queues.safeRequeueQueues({
          fromQueues: ["dlq-a", "dlq-b"],
          toQueue: "retyr",
          limit: ALL_MESSAGES,
          connection: open,
        }),
      ),
    ).rejects.toThrow(/'dlq-a', 'dlq-b'/);

    expect(broker.payloads("dlq-a")).toEqual(["a1"]);
    expect(broker.payloads("dlq-b")).toEqual(["b1"]);
    expect(backups.listInterruptedOperations()).toHaveLength(0);
  });

  it("backs each source up on its own, so a late failure keeps the earlier moves", async () => {
    const { broker, queues } = setUp({
      "dlq-a": ["a1"],
      "dlq-b": ["b1"],
      "dlq-c": ["c1"],
      retry: [],
    });

    broker.rejectReadsFrom.add("dlq-c");

    await expect(
      broker.withConnection(testConnection, (open) =>
        queues.safeRequeueQueues({
          fromQueues: ["dlq-a", "dlq-b", "dlq-c"],
          toQueue: "retry",
          limit: ALL_MESSAGES,
          connection: open,
        }),
      ),
    ).rejects.toThrow(/dlq-c/);

    expect(broker.payloads("retry")).toEqual(["a1", "b1"]);
    expect(broker.payloads("dlq-c")).toEqual(["c1"]);
  });

  it("counts down queues when there are several, and messages when there is one", async () => {
    const { broker, queues } = setUp({
      "dlq-a": ["a1", "a2"],
      "dlq-b": ["b1"],
      retry: [],
    });

    const many: OperationProgress[] = [];
    await broker.withConnection(testConnection, (open) =>
      queues.safeRequeueQueues({
        fromQueues: ["dlq-a", "dlq-b"],
        toQueue: "retry",
        limit: ALL_MESSAGES,
        connection: open,
        onProgress: (progress) => many.push(progress),
      }),
    );

    expect(many).toEqual([
      { phase: "Transferring", done: 1, total: 2 },
      { phase: "Transferring", done: 2, total: 2 },
    ]);

    const one: OperationProgress[] = [];
    broker.queues.set("dlq-a", []);
    await broker.withConnection(testConnection, (open) =>
      queues.safeRequeueQueues({
        fromQueues: ["retry"],
        toQueue: "dlq-a",
        limit: ALL_MESSAGES,
        connection: open,
        onProgress: (progress) => one.push(progress),
      }),
    );

    expect(one.at(-1)).toEqual({ phase: "Transferring", done: 3, total: 3 });
  });

  it("stops between queues when the job is cancelled", async () => {
    const { broker, queues } = setUp({
      "dlq-a": ["a1"],
      "dlq-b": ["b1"],
      retry: [],
    });

    await expect(
      broker.withConnection(testConnection, (open) =>
        queues.safeRequeueQueues({
          fromQueues: ["dlq-a", "dlq-b"],
          toQueue: "retry",
          limit: ALL_MESSAGES,
          connection: open,
          throwIfCancelled: () => {
            if (broker.payloads("retry").length > 0) throw new Error("Cancelled");
          },
        }),
      ),
    ).rejects.toThrow("Cancelled");

    expect(broker.payloads("retry")).toEqual(["a1"]);
    expect(broker.payloads("dlq-b")).toEqual(["b1"]);
  });
});

describe("reprocessing a whole queue", () => {
  it("republishes each message to the exchange and key it arrived on", async () => {
    const { broker, queues } = setUp({ "orders.created": [] });
    broker.queues.set("dlq", []);

    broker.seedMessage("dlq", {
      payload: "first",
      headers: { "x-attempt": "2" },
      properties: { messageId: "m-1" },
      exchange: "orders",
      routingKey: "orders.created",
    });
    broker.seedMessage("dlq", {
      payload: "second",
      headers: {},
      properties: {},
      exchange: "orders",
      routingKey: "orders.created",
    });

    const outcomes = await broker.withConnection(testConnection, (open) =>
      queues.safeReprocessQueues({
        queues: ["dlq"],
        limit: ALL_MESSAGES,
        connection: open,
      }),
    );

    expect(totalsOf(outcomes)).toEqual({ successful: 2, failed: 0 });
    expect(broker.payloads("dlq")).toEqual([]);
    expect(broker.payloads("orders.created")).toEqual(["first", "second"]);

    expect(broker.published).toEqual([
      {
        exchange: "orders",
        routingKey: "orders.created",
        payload: "first",
        headers: { "x-attempt": "2" },
        properties: { messageId: "m-1" },
      },
      {
        exchange: "orders",
        routingKey: "orders.created",
        payload: "second",
        headers: {},
        properties: {},
      },
    ]);
  });

  it("reprocesses several queues in one go", async () => {
    const { broker, queues } = setUp({ retry: [] });
    broker.queues.set("dlq-a", []);
    broker.queues.set("dlq-b", []);

    for (const queue of ["dlq-a", "dlq-b"]) {
      broker.seedMessage(queue, {
        payload: `${queue}-1`,
        headers: {},
        properties: {},
        exchange: "retry-exchange",
        routingKey: "retry",
      });
    }

    const outcomes = await broker.withConnection(testConnection, (open) =>
      queues.safeReprocessQueues({
        queues: ["dlq-a", "dlq-b"],
        limit: ALL_MESSAGES,
        connection: open,
      }),
    );

    expect(outcomes.map((outcome) => outcome.queue)).toEqual([
      "dlq-a",
      "dlq-b",
    ]);
    expect(new Set(outcomes.map((outcome) => outcome.summary.id)).size).toBe(2);
    expect(broker.payloads("retry")).toEqual(["dlq-a-1", "dlq-b-1"]);
  });

  it("lands messages back in the same queue when their route points here", async () => {
    const { broker, queues } = setUp({ dlq: ["stuck"] });

    await broker.withConnection(testConnection, (open) =>
      queues.safeReprocessQueues({
        queues: ["dlq"],
        limit: ALL_MESSAGES,
        connection: open,
      }),
    );

    expect(broker.payloads("dlq")).toEqual(["stuck"]);
  });

  it("keeps the messages in a backup when the exchange refuses them", async () => {
    const { broker, queues, backups } = setUp({ dlq: ["stuck"] });
    broker.rejectPublishTo.add("dlq");

    const outcomes = await broker.withConnection(testConnection, (open) =>
      queues.safeReprocessQueues({
        queues: ["dlq"],
        limit: ALL_MESSAGES,
        connection: open,
      }),
    );

    expect(totalsOf(outcomes)).toEqual({ successful: 0, failed: 1 });

    const [interrupted] = backups.listInterruptedOperations();
    expect(interrupted?.origin.queueName).toBe("dlq");
    expect(interrupted?.remaining).toBe(1);
  });
});
