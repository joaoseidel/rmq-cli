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
import { JobManager } from "../src/core/usecase/jobs.ts";
import { MessageOperations } from "../src/core/usecase/message-operations.ts";
import { QueueOperations } from "../src/core/usecase/queue-operations.ts";
import { VHostOperations } from "../src/core/usecase/vhost-operations.ts";
import { App } from "../src/ui/components/app.tsx";
import { FakeBroker, testConnection } from "./fake-broker.ts";

function build(seed: Record<string, string[]>): Container {
  const broker = new FakeBroker(seed);
  const dir = mkdtempSync(join(tmpdir(), "rmq-app-"));

  const settings = new JsonSettingsStore({ configDir: dir });
  const configStore = new JsonConfigurationStore(
    settings,
    new FileKeySecretCipher(dir),
  );
  configStore.saveConnection(testConnection);

  const coordinator = new BackedUpOperationCoordinator(
    new JsonMessageBackupRepository(
      new JsonSettingsStore({ configDir: dir, fileName: "backups" }),
    ),
  );

  return {
    broker,
    connections: new ConnectionOperations(configStore, broker),
    queues: new QueueOperations(broker, coordinator),
    messages: new MessageOperations(broker, coordinator),
    vhosts: new VHostOperations(broker, configStore),
    jobs: new JobManager(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("App", () => {
  it("mounts and renders the queue browser", async () => {
    const { lastFrame, unmount } = render(
      <App container={build({ orders: ["a", "b"] })} />,
    );
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("rmq");
    expect(frame).toContain("Queues");
    unmount();
  });

  it("shows the footer hints derived from the keymap", async () => {
    const { lastFrame, unmount } = render(
      <App container={build({ orders: [] })} />,
    );
    await settle();

    const frame = lastFrame() ?? "";

    expect(frame).toContain("filter");
    expect(frame).toContain("purge");
    expect(frame).toContain("actions");
    unmount();
  });

  it("lists the queues the broker reports", async () => {
    const { lastFrame, unmount } = render(
      <App container={build({ orders: ["a"], retry: [] })} />,
    );
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("orders");
    expect(frame).toContain("retry");
    unmount();
  });
});

describe("searching across filtered queues", () => {
  const seed = {
    "order-processing": ['{"ref":"AB-991"}'],
    "order-dlq": ['{"ref":"AB-991"}'],
    "audit-log": ['{"ref":"AB-991"}'],
  };

  it("searches the queues the filter left, and no others", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("/");
    await settle();
    stdin.write("order");
    await settle();
    stdin.write("\r");
    await settle();

    stdin.write("s");
    await settle();
    stdin.write("AB-991");
    await settle();
    stdin.write("\r");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Search 2 queues");
    expect(frame).toContain("order-processing");
    expect(frame).toContain("order-dlq");

    expect(frame).not.toContain("audit-log");
    unmount();
  });

  it("says how much of the scope it covered", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("s");
    await settle();
    stdin.write("AB-991");
    await settle();
    stdin.write("\r");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("3 queues searched");
    expect(frame).toContain("3 messages peeked");
    expect(frame).toContain("3 messages matching");
    unmount();
  });
});

describe("adjusting how deep a search goes", () => {
  it("finds on + what the default depth stopped short of", async () => {
    const payloads = Array.from({ length: 250 }, (_, i) =>
      i === 240 ? "needle" : "hay",
    );
    const { lastFrame, stdin, unmount } = render(
      <App container={build({ orders: payloads })} />,
    );
    await settle();

    stdin.write("s");
    await settle();
    stdin.write("needle");
    await settle();
    stdin.write("\r");
    await settle();

    let frame = lastFrame() ?? "";
    expect(frame).toContain("up to 200 messages each");
    expect(frame).toContain("No messages matching 'needle'");
    expect(frame).toContain("hit the 200-message cap");
    expect(frame).toContain("press + to search deeper");

    stdin.write("+");
    await settle();

    frame = lastFrame() ?? "";
    expect(frame).toContain("up to 500 messages each");
    expect(frame).toContain("1 message matching");
    expect(frame).not.toContain("hit the 500-message cap");
    unmount();
  });
});
