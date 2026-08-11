import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonConfigurationStore } from "../src/adapters/storage/json-configuration-store.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { FileKeySecretCipher } from "../src/adapters/storage/secret-cipher.ts";
import type { Container } from "../src/container.ts";
import { ConnectionOperations } from "../src/core/usecase/connection-operations.ts";
import { MessageOperations } from "../src/core/usecase/message-operations.ts";
import { QueueOperations } from "../src/core/usecase/queue-operations.ts";
import { VHostOperations } from "../src/core/usecase/vhost-operations.ts";
import { App } from "../src/ui/components/app.tsx";
import { FakeBroker, testConnection } from "./fake-broker.ts";

/** A container wired to an in-memory broker and a throwaway config directory. */
function build(seed: Record<string, string[]>): Container {
  const broker = new FakeBroker(seed);
  const dir = mkdtempSync(join(tmpdir(), "rmq-app-"));

  const settings = new JsonSettingsStore({ configDir: dir });
  const configStore = new JsonConfigurationStore(settings, new FileKeySecretCipher(dir));
  configStore.saveConnection(testConnection);

  const coordinator = new BackedUpOperationCoordinator(
    new JsonMessageBackupRepository(new JsonSettingsStore({ configDir: dir, fileName: "backups" })),
  );

  return {
    broker,
    connections: new ConnectionOperations(configStore, broker),
    queues: new QueueOperations(broker, coordinator),
    messages: new MessageOperations(broker, coordinator),
    vhosts: new VHostOperations(broker, configStore),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("App", () => {
  it("mounts and renders the queue browser", async () => {
    const { lastFrame, unmount } = render(<App container={build({ orders: ["a", "b"] })} />);
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("rmq");
    expect(frame).toContain("Queues");
    unmount();
  });

  it("shows the footer hints derived from the keymap", async () => {
    const { lastFrame, unmount } = render(<App container={build({ orders: [] })} />);
    await settle();

    const frame = lastFrame() ?? "";
    // Sourced from SCREEN_KEYS.queues via hintsFor, not a second hand-written list.
    expect(frame).toContain("filter");
    expect(frame).toContain("purge");
    expect(frame).toContain("actions");
    unmount();
  });

  it("lists the queues the broker reports", async () => {
    const { lastFrame, unmount } = render(<App container={build({ orders: ["a"], retry: [] })} />);
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("orders");
    expect(frame).toContain("retry");
    unmount();
  });
});
