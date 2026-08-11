import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { messageId } from "../src/core/domain/message-id.ts";
import { failure, success } from "../src/core/domain/operation.ts";
import type { Message } from "../src/core/domain/message.ts";
import type { MessageBackupRepository } from "../src/core/ports/stores.ts";

function message(id: string): Message {
  return {
    transport: "amqp",
    id: messageId(id.padEnd(40, "0")),
    exchange: "events",
    routingKey: "order.created",
    payload: `payload-${id}`,
    headers: {},
    properties: {},
  };
}

function newRepository(): JsonMessageBackupRepository {
  const dir = mkdtempSync(join(tmpdir(), "rmq-ops-"));
  return new JsonMessageBackupRepository(new JsonSettingsStore({ configDir: dir, fileName: "backups" }));
}

describe("BackedUpOperationCoordinator", () => {
  let repository: JsonMessageBackupRepository;
  let coordinator: BackedUpOperationCoordinator;

  beforeEach(() => {
    repository = newRepository();
    coordinator = new BackedUpOperationCoordinator(repository);
  });

  it("reports every success", async () => {
    const summary = await coordinator.executeOperation({
      operationType: "test",
      provideMessages: async () => [message("a"), message("b")],
      process: async (item) => success(item.id),
    });

    expect(summary.successful).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.unprocessedMessages).toHaveLength(0);
  });

  it("keeps failed messages in the backup", async () => {
    const summary = await coordinator.executeOperation({
      operationType: "test",
      provideMessages: async () => [message("a"), message("b")],
      process: async (item) =>
        item.payload.endsWith("a") ? success(item.id) : failure(item.id, "nope"),
    });

    expect(summary.successful).toBe(1);
    expect(summary.failed).toBe(1);
    // The unrecovered message is the whole point of the backup.
    expect(summary.unprocessedMessages).toHaveLength(1);
    expect(repository.getUnprocessedMessages(summary.id)).toHaveLength(1);
  });

  it("treats a thrown error as a failure rather than propagating", async () => {
    const summary = await coordinator.executeOperation({
      operationType: "test",
      provideMessages: async () => [message("a")],
      process: async () => {
        throw new Error("broker exploded");
      },
    });

    expect(summary.failed).toBe(1);
    expect(summary.unprocessedMessages).toHaveLength(1);
  });

  it("does nothing when there is nothing to process", async () => {
    const summary = await coordinator.executeOperation({
      operationType: "test",
      provideMessages: async () => [],
      process: async () => success("unused"),
    });

    expect(summary.successful).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it("aborts without processing when the backup cannot be written", async () => {
    // Losing messages with no record of them is the one outcome to avoid.
    const brokenBackups: MessageBackupRepository = {
      storeMessages: () => false,
      markMessageAsProcessed: () => false,
      getUnprocessedMessages: () => [],
      getProcessedMessages: () => [],
      completeOperation: () => false,
    };

    let processed = 0;
    const summary = await new BackedUpOperationCoordinator(brokenBackups).executeOperation({
      operationType: "test",
      provideMessages: async () => [message("a")],
      process: async (item) => {
        processed += 1;
        return success(item.id);
      },
    });

    expect(processed).toBe(0);
    expect(summary.unprocessedMessages).toHaveLength(1);
  });

  it("reports progress for each message", async () => {
    const seen: number[] = [];

    await coordinator.executeOperation({
      operationType: "test",
      provideMessages: async () => [message("a"), message("b"), message("c")],
      process: async (item) => success(item.id),
      onProgress: ({ processed }) => seen.push(processed),
    });

    expect(seen).toEqual([1, 2, 3]);
  });

  it("clears the backup once everything succeeded", async () => {
    const summary = await coordinator.executeOperation({
      operationType: "test",
      provideMessages: async () => [message("a")],
      process: async (item) => success(item.id),
    });

    expect(repository.listPendingOperations().some((entry) => entry.id === summary.id)).toBe(false);
  });

  it("retains the backup when something failed", async () => {
    const summary = await coordinator.executeOperation({
      operationType: "test",
      provideMessages: async () => [message("a")],
      process: (item) => Promise.resolve(failure(item.id, "nope")),
    });

    expect(repository.listPendingOperations().some((entry) => entry.id === summary.id)).toBe(true);
  });
});
