import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import {
  DEFAULT_SEARCH_LIMIT,
  MessageOperations,
  SEARCH_DEPTHS,
  stepSearchDepth,
} from "../src/core/usecase/message-operations.ts";
import type { BrokerConnection } from "../src/core/ports/broker.ts";
import { FakeBroker, testConnection } from "./fake-broker.ts";

function build(seed: Record<string, string[]>) {
  const broker = new FakeBroker(seed);
  const backups = new JsonMessageBackupRepository(
    new JsonSettingsStore({
      configDir: mkdtempSync(join(tmpdir(), "rmq-msg-")),
      fileName: "backups",
    }),
  );
  const messages = new MessageOperations(
    broker,
    new BackedUpOperationCoordinator(backups),
  );
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
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );
    const target = all[1];
    expect(target).toBeDefined();

    await withConnection(broker, (open) =>
      messages.safeDeleteMessage({
        id: target!.id,
        queueName: "orders",
        connection: open,
      }),
    );

    expect(broker.payloads("orders")).toEqual(["a", "c", "d"]);
  });

  it("preserves the order of the messages it puts back", async () => {
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    await withConnection(broker, (open) =>
      messages.safeDeleteMessage({
        id: all[0]!.id,
        queueName: "orders",
        connection: open,
      }),
    );

    expect(broker.payloads("orders")).toEqual(["b", "c", "d"]);
  });

  it("reports what it removed and what it restored", async () => {
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    const outcome = await withConnection(broker, (open) =>
      messages.safeDeleteMessage({
        id: all[2]!.id,
        queueName: "orders",
        connection: open,
      }),
    );

    expect(outcome.removed).toBe(1);
    expect(outcome.restored).toBe(3);
    expect(outcome.lost).toBe(0);
  });

  it("removes several messages in one pass", async () => {
    const { broker, messages } = context;
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

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
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    broker.rejectPublishTo.add("orders");

    const outcome = await withConnection(broker, (open) =>
      messages.safeDeleteMessage({
        id: all[1]!.id,
        queueName: "orders",
        connection: open,
      }),
    );

    expect(outcome.lost).toBe(3);
    expect(outcome.unprocessedMessages).toHaveLength(3);
    expect(backups.getUnprocessedMessages(outcome.operationId)).toHaveLength(3);
  });
});

describe("moving a message to another queue", () => {
  it("publishes to the target and removes from the source", async () => {
    const { broker, messages } = build({ orders: ["a", "b", "c"], retry: [] });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

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
    const { broker, messages } = build({ orders: ["a", "b"], retry: [] });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );
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
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    const outcome = await withConnection(broker, (open) =>
      messages.safeReprocessMessage({
        message: all[0]!,
        fromQueue: "orders",
        connection: open,
      }),
    );

    expect(outcome.removed).toBe(1);

    expect(broker.payloads("orders")).toEqual(["b", "a"]);
  });
});

describe("searching for a message across queues", () => {
  const seed = {
    "order-processing": ['{"id":1,"ref":"AB-991"}', '{"id":2,"ref":"ZZ-100"}'],
    "order-failed": ['{"id":3,"ref":"AB-991"}'],
    "order-dlq": ['{"id":4,"ref":"QQ-777"}'],
  };

  it("returns every hit, tagged with the queue it came from", async () => {
    const { broker, messages } = build(seed);

    const outcome = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["order-processing", "order-failed", "order-dlq"],
        term: "AB-991",
        connection: open,
      }),
    );

    expect(outcome.hits.map((hit) => hit.queue)).toEqual([
      "order-processing",
      "order-failed",
    ]);
    expect(outcome.hits[0]!.message.payload).toContain("AB-991");
    expect(outcome.queuesScanned).toBe(3);
    expect(outcome.scanned).toBe(4);
  });

  it("leaves every queue it searched exactly as it found it", async () => {
    const { broker, messages } = build(seed);

    await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["order-processing", "order-failed", "order-dlq"],
        term: "AB-991",
        connection: open,
      }),
    );

    expect(broker.payloads("order-processing")).toEqual(
      seed["order-processing"],
    );
    expect(broker.payloads("order-failed")).toEqual(seed["order-failed"]);
    expect(broker.payloads("order-dlq")).toEqual(seed["order-dlq"]);
  });

  it("matches on message id as well as payload", async () => {
    const { broker, messages } = build({ orders: ["a", "b"] });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    const outcome = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["orders"],
        term: all[1]!.id,
        connection: open,
      }),
    );

    expect(outcome.hits).toHaveLength(1);
    expect(outcome.hits[0]!.message.id).toBe(all[1]!.id);
  });

  it("honours glob wildcards in the term", async () => {
    const { broker, messages } = build(seed);

    const outcome = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["order-processing", "order-dlq"],
        term: "ref*777",
        connection: open,
      }),
    );

    expect(outcome.hits).toHaveLength(1);
    expect(outcome.hits[0]!.queue).toBe("order-dlq");
  });

  it("names the queues that filled the per-queue cap", async () => {
    const { broker, messages } = build({ big: ["x", "x", "x"], small: ["x"] });

    const outcome = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["big", "small"],
        term: "x",
        limitPerQueue: 3,
        connection: open,
      }),
    );

    expect(outcome.truncated).toEqual(["big"]);
    expect(outcome.hits).toHaveLength(4);
  });

  it("records a queue it could not read and searches the rest anyway", async () => {
    const { broker, messages } = build(seed);
    broker.rejectReadsFrom.add("order-failed");

    const outcome = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["order-processing", "order-failed", "order-dlq"],
        term: "ref",
        connection: open,
      }),
    );

    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]!.queue).toBe("order-failed");

    expect(outcome.hits.map((hit) => hit.queue)).toEqual([
      "order-processing",
      "order-processing",
      "order-dlq",
    ]);
  });

  it("reports partial results as each queue is finished", async () => {
    const { broker, messages } = build(seed);
    const progress: number[] = [];

    await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["order-processing", "order-failed", "order-dlq"],
        term: "AB-991",
        connection: open,
        onProgress: (outcome) => progress.push(outcome.hits.length),
      }),
    );

    expect(progress).toEqual([1, 2, 2]);
  });

  it("stops where it is when cancelled, and says so", async () => {
    const { broker, messages } = build(seed);
    let visited = 0;

    const outcome = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["order-processing", "order-failed", "order-dlq"],
        term: "ref",
        connection: open,
        isCancelled: () => visited++ >= 1,
      }),
    );

    expect(outcome.cancelled).toBe(true);
    expect(outcome.queuesScanned).toBe(1);
    expect(outcome.hits.map((hit) => hit.queue)).toEqual([
      "order-processing",
      "order-processing",
    ]);
  });
});

describe("choosing how deep a search goes", () => {
  it("steps through the offered depths", () => {
    expect(stepSearchDepth(200, "deeper")).toBe(500);
    expect(stepSearchDepth(200, "shallower")).toBe(100);
  });

  it("clamps at both ends rather than wrapping", () => {
    const shallowest = SEARCH_DEPTHS[0]!;
    const deepest = SEARCH_DEPTHS[SEARCH_DEPTHS.length - 1]!;

    expect(stepSearchDepth(deepest, "deeper")).toBe(deepest);
    expect(stepSearchDepth(shallowest, "shallower")).toBe(shallowest);
  });

  it("falls back to the default for a depth it does not offer", () => {
    expect(stepSearchDepth(37, "deeper")).toBe(DEFAULT_SEARCH_LIMIT);
  });

  it("reaches messages a shallower run stopped short of", async () => {
    const payloads = Array.from({ length: 250 }, (_, i) =>
      i === 240 ? "needle" : "hay",
    );
    const { broker, messages } = build({ orders: payloads });

    const shallow = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["orders"],
        term: "needle",
        limitPerQueue: 200,
        connection: open,
      }),
    );
    expect(shallow.hits).toHaveLength(0);
    expect(shallow.truncated).toEqual(["orders"]);

    const deep = await withConnection(broker, (open) =>
      messages.searchMessages({
        queueNames: ["orders"],
        term: "needle",
        limitPerQueue: 500,
        connection: open,
      }),
    );
    expect(deep.hits).toHaveLength(1);
    expect(deep.truncated).toEqual([]);
  });
});

describe("publishing to a destination that cannot receive", () => {
  it("leaves the message in place when the destination does not exist", async () => {
    const { broker, messages } = build({ orders: ["a", "b"] });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    await expect(
      withConnection(broker, (open) =>
        messages.safeRequeueMessage({
          message: all[0]!,
          fromQueue: "orders",
          toQueue: "retry-qeuue",
          connection: open,
        }),
      ),
    ).rejects.toThrow(/Failed to publish/);

    expect(broker.payloads("orders")).toEqual(["a", "b"]);
  });

  it("keeps unroutable messages in the backup instead of reporting success", async () => {
    const { broker, messages, backups } = build({ orders: ["a", "b", "c"] });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    broker.rejectPublishTo.add("orders");

    const outcome = await withConnection(broker, (open) =>
      messages.safeDeleteMessage({
        id: all[0]!.id,
        queueName: "orders",
        connection: open,
      }),
    );

    expect(outcome.lost).toBe(2);
    expect(backups.getUnprocessedMessages(outcome.operationId)).toHaveLength(2);
  });
});

describe("moving a batch of messages", () => {
  it("removes the whole batch in a single pass over the source", async () => {
    const { broker, messages } = build({
      orders: ["a", "b", "c", "d"],
      retry: [],
    });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    const outcome = await withConnection(broker, (open) =>
      messages.safeMoveMessages({
        messages: [all[0]!, all[2]!],
        fromQueue: "orders",
        toQueue: "retry",
        connection: open,
      }),
    );

    expect(outcome.removed).toBe(2);

    expect(outcome.restored).toBe(2);
    expect(broker.payloads("orders")).toEqual(["b", "d"]);
    expect(broker.payloads("retry")).toEqual(["a", "c"]);
  });

  it("removes nothing when the destination refuses the batch", async () => {
    const { broker, messages } = build({ orders: ["a", "b"], retry: [] });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );
    broker.rejectPublishTo.add("retry");

    await expect(
      withConnection(broker, (open) =>
        messages.safeMoveMessages({
          messages: all,
          fromQueue: "orders",
          toQueue: "retry",
          connection: open,
        }),
      ),
    ).rejects.toThrow(/Nothing was moved/);

    expect(broker.payloads("orders")).toEqual(["a", "b"]);
  });

  it("says how many copies exist when it fails part way", async () => {
    const { broker, messages } = build({ orders: ["a", "b", "c"], retry: [] });
    const all = await withConnection(broker, (open) =>
      messages.getMessages("orders", 10, false, open),
    );

    let published = 0;
    const original = broker.publishMessage.bind(broker);
    broker.publishMessage = async (input: {
      routingKey: string;
      payload: string;
    }) => {
      if (input.routingKey === "retry" && published++ >= 2) return false;
      return original(input);
    };

    await expect(
      withConnection(broker, (open) =>
        messages.safeMoveMessages({
          messages: all,
          fromQueue: "orders",
          toQueue: "retry",
          connection: open,
        }),
      ),
    ).rejects.toThrow(/2 of 3 were already copied; none have been removed/);

    expect(broker.payloads("orders")).toEqual(["a", "b", "c"]);
  });
});
