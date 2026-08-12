import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { MessageOperations } from "../src/core/usecase/message-operations.ts";
import { FakeBroker, testConnection } from "./fake-broker.ts";

const ORIGIN = {
  queueName: "orders",
  connectionId: testConnection.id,
  vhost: testConnection.vHost.name,
};

function build(seed: Record<string, string[]>) {
  const broker = new FakeBroker(seed);
  const backups = new JsonMessageBackupRepository(
    new JsonSettingsStore({
      configDir: mkdtempSync(join(tmpdir(), "rmq-recover-")),
      fileName: "backups",
    }),
  );
  const messages = new MessageOperations(
    broker,
    new BackedUpOperationCoordinator(backups),
    backups,
  );
  return { broker, messages, backups };
}

async function interrupt(context: ReturnType<typeof build>) {
  const { broker, messages } = context;

  const all = await broker.withConnection(testConnection, (open) =>
    messages.getMessages("orders", 10, false, open),
  );

  broker.rejectPublishTo.add("orders");

  const outcome = await broker.withConnection(testConnection, (open) =>
    messages.safeDeleteMessage({
      id: all[0]!.id,
      queueName: "orders",
      connection: open,
    }),
  );

  broker.rejectPublishTo.delete("orders");
  return outcome;
}

describe("recovering an operation that was cut short", () => {
  it("lists what is waiting, with its queue and how much is left", async () => {
    const context = build({ orders: ["a", "b", "c", "d"] });
    const outcome = await interrupt(context);

    const pending = context.messages.listInterruptedOperations();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(outcome.operationId);
    expect(pending[0]?.origin.queueName).toBe("orders");
    expect(pending[0]?.recoverable).toBe(true);
    expect(pending[0]?.type).toBe("remove-messages");
    expect(pending[0]?.remaining).toBe(3);
  });

  it("puts exactly the unprocessed messages back into their queue", async () => {
    const context = build({ orders: ["a", "b", "c", "d"] });
    const outcome = await interrupt(context);

    expect(context.broker.payloads("orders")).toEqual([]);

    const recovered = await context.broker.withConnection(
      testConnection,
      (open) =>
        context.messages.recoverOperation({
          operationId: outcome.operationId,
          origin: ORIGIN,
          connection: open,
        }),
    );

    expect(recovered).toEqual({ restored: 3, failed: 0 });
    expect(context.broker.payloads("orders")).toEqual(["b", "c", "d"]);
    expect(context.messages.listInterruptedOperations()).toHaveLength(0);
  });

  it("restores headers and properties, not just the payload", async () => {
    const context = build({ orders: [] });
    context.broker.seedMessage("orders", {
      payload: "target",
      headers: {},
      properties: {},
      exchange: "",
      routingKey: "orders",
    });
    context.broker.seedMessage("orders", {
      payload: '{"ref":"AB-991"}',
      headers: { "x-origin": "checkout" },
      properties: { correlationId: "c-1" },
      exchange: "events",
      routingKey: "orders",
    });

    const outcome = await interrupt(context);

    await context.broker.withConnection(testConnection, (open) =>
      context.messages.recoverOperation({
        operationId: outcome.operationId,
        origin: ORIGIN,
        connection: open,
      }),
    );

    const restored = context.broker.stored("orders");
    expect(restored).toHaveLength(1);
    expect(restored[0]?.headers).toEqual({ "x-origin": "checkout" });
    expect(restored[0]?.properties).toEqual({ correlationId: "c-1" });
  });

  it("keeps the backup when some messages still cannot be put back", async () => {
    const context = build({ orders: ["a", "b", "c"] });
    const outcome = await interrupt(context);

    context.broker.rejectPublishTo.add("orders");

    const recovered = await context.broker.withConnection(
      testConnection,
      (open) =>
        context.messages.recoverOperation({
          operationId: outcome.operationId,
          origin: ORIGIN,
          connection: open,
        }),
    );

    expect(recovered.restored).toBe(0);
    expect(recovered.failed).toBe(2);
    expect(context.messages.listInterruptedOperations()).toHaveLength(1);
  });

  it("resumes from where a cancelled recovery stopped", async () => {
    const context = build({ orders: ["a", "b", "c", "d"] });
    const outcome = await interrupt(context);

    let seen = 0;
    await context.broker.withConnection(testConnection, (open) =>
      context.messages.recoverOperation({
        operationId: outcome.operationId,
        origin: ORIGIN,
        connection: open,
        isCancelled: () => seen++ >= 1,
      }),
    );

    expect(context.broker.payloads("orders")).toEqual(["b"]);
    expect(context.messages.listInterruptedOperations()[0]?.remaining).toBe(2);

    await context.broker.withConnection(testConnection, (open) =>
      context.messages.recoverOperation({
        operationId: outcome.operationId,
        origin: ORIGIN,
        connection: open,
      }),
    );

    expect(context.broker.payloads("orders")).toEqual(["b", "c", "d"]);
    expect(context.messages.listInterruptedOperations()).toHaveLength(0);
  });

  it("lets a backup be discarded without restoring it", async () => {
    const context = build({ orders: ["a", "b"] });
    const outcome = await interrupt(context);

    expect(context.messages.forgetOperation(outcome.operationId)).toBe(true);
    expect(context.messages.listInterruptedOperations()).toHaveLength(0);
  });

  it("never prunes a backup that still has messages waiting", async () => {
    const context = build({ orders: ["a", "b"] });
    await interrupt(context);

    expect(context.messages.pruneOldBackups(0)).toBe(0);
    expect(context.messages.listInterruptedOperations()).toHaveLength(1);
  });
});

describe("keeping a recovery inside the broker it came from", () => {
  const otherBroker = {
    ...testConnection,
    id: "elsewhere",
    name: "elsewhere",
  };

  it("only lists backups belonging to the connection being browsed", async () => {
    const context = build({ orders: ["a", "b", "c"] });
    await interrupt(context);

    expect(
      context.messages.listInterruptedOperations({
        connectionId: testConnection.id,
        vhost: testConnection.vHost.name,
      }),
    ).toHaveLength(1);

    expect(
      context.messages.listInterruptedOperations({
        connectionId: "elsewhere",
        vhost: testConnection.vHost.name,
      }),
    ).toHaveLength(0);

    expect(
      context.messages.listInterruptedOperations({
        connectionId: testConnection.id,
        vhost: "/other",
      }),
    ).toHaveLength(0);
  });

  it("refuses to publish the messages into a different broker", async () => {
    const context = build({ orders: ["a", "b", "c"] });
    const outcome = await interrupt(context);

    await expect(
      context.broker.withConnection(otherBroker, (open) =>
        context.messages.recoverOperation({
          operationId: outcome.operationId,
          origin: ORIGIN,
          connection: open,
        }),
      ),
    ).rejects.toThrow(/different broker or vhost/);

    expect(context.broker.payloads("orders")).toEqual([]);
    expect(context.messages.listInterruptedOperations()).toHaveLength(1);
  });

  it("refuses to publish the messages into a different vhost", async () => {
    const context = build({ orders: ["a", "b", "c"] });
    const outcome = await interrupt(context);

    const otherVHost = {
      ...testConnection,
      vHost: { ...testConnection.vHost, name: "/staging" },
    };

    await expect(
      context.broker.withConnection(otherVHost, (open) =>
        context.messages.recoverOperation({
          operationId: outcome.operationId,
          origin: ORIGIN,
          connection: open,
        }),
      ),
    ).rejects.toThrow(/different broker or vhost/);
  });

  it("refuses a backup that does not record where it came from", async () => {
    const context = build({ orders: ["a", "b", "c"] });
    const outcome = await interrupt(context);

    await expect(
      context.broker.withConnection(testConnection, (open) =>
        context.messages.recoverOperation({
          operationId: outcome.operationId,
          origin: { queueName: "", connectionId: "", vhost: "" },
          connection: open,
        }),
      ),
    ).rejects.toThrow(/does not record where its messages came from/);

    expect(context.broker.payloads("orders")).toEqual([]);
  });
});
