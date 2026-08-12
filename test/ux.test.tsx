import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { BackedUpOperationCoordinator } from "../src/adapters/storage/backed-up-operation-coordinator.ts";
import { JsonConfigurationStore } from "../src/adapters/storage/json-configuration-store.ts";
import { JsonMessageBackupRepository } from "../src/adapters/storage/json-message-backup-repository.ts";
import { JsonPreferencesStore } from "../src/adapters/storage/json-preferences-store.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { FileKeySecretCipher } from "../src/adapters/storage/secret-cipher.ts";
import type { Container } from "../src/container.ts";
import { globMatches } from "../src/core/util/glob.ts";
import { ConnectionOperations } from "../src/core/usecase/connection-operations.ts";
import { JobManager } from "../src/core/usecase/jobs.ts";
import { MessageOperations } from "../src/core/usecase/message-operations.ts";
import { QueueOperations } from "../src/core/usecase/queue-operations.ts";
import { VHostOperations } from "../src/core/usecase/vhost-operations.ts";
import { paletteActions } from "../src/ui/actions.ts";
import { App } from "../src/ui/components/app.tsx";
import { KeyHints } from "../src/ui/components/parts/key-hints.tsx";
import { sectionsFor } from "../src/ui/components/screens/help-screen.tsx";
import type { Screen } from "../src/ui/screens.ts";
import { FakeBroker, testConnection } from "./fake-broker.ts";

const ESC = "\u001B";

function build(seed: Record<string, string[]>): Container {
  const broker = new FakeBroker(seed);
  const dir = mkdtempSync(join(tmpdir(), "rmq-ux-"));
  const settings = new JsonSettingsStore({ configDir: dir });
  const configStore = new JsonConfigurationStore(
    settings,
    new FileKeySecretCipher(dir),
  );
  configStore.saveConnection(testConnection);
  const backups = new JsonMessageBackupRepository(
    new JsonSettingsStore({ configDir: dir, fileName: "backups" }),
  );
  const coordinator = new BackedUpOperationCoordinator(backups);

  return {
    broker,
    connections: new ConnectionOperations(configStore, broker),
    queues: new QueueOperations(broker, coordinator),
    messages: new MessageOperations(broker, coordinator, backups),
    vhosts: new VHostOperations(broker, configStore),
    jobs: new JobManager(),
    preferences: new JsonPreferencesStore(settings),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

const seed = {
  "order-processing": ['{"ref":"AB-991"}'],
  "order-failed": ['{"ref":"ZZ-100"}'],
  "order-dlq": ['{"ref":"QQ-777"}'],
  "audit-log": ['{"ref":"MM-222"}'],
  "billing-events": ['{"ref":"NN-333"}'],
};

describe("the footer legend", () => {
  const hints = [
    { keys: "↑↓", label: "move" },
    { keys: "/", label: "filter" },
    { keys: "p", label: "purge" },
    { keys: "t", label: "tail" },
    { keys: ":", label: "actions", essential: true },
    { keys: "q", label: "quit", essential: true },
  ];

  function footerAt(width: number): string {
    const { lastFrame, unmount } = render(
      <Box width={width}>
        <KeyHints hints={hints} maxWidth={width} />
      </Box>,
    );
    const frame = lastFrame() ?? "";
    unmount();
    return frame;
  }

  it("keeps the ways out when there is not room for everything", () => {
    const narrow = footerAt(30);

    expect(narrow).toContain("q quit");
    expect(narrow).toContain(": actions");
    expect(narrow).not.toContain("p purge");
  });

  it("shows everything when there is room", () => {
    const wide = footerAt(120);
    expect(wide).toContain("p purge");
    expect(wide).toContain("q quit");
  });

  it("never exceeds the width it is given", () => {
    for (const width of [20, 30, 45, 60, 80, 120]) {
      for (const line of footerAt(width).split("\n")) {
        expect(line.length).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("the action list", () => {
  const screens: Screen["name"][] = [
    "queues",
    "queue",
    "message",
    "search",
    "consume",
    "publish",
    "transfer",
    "export",
    "import",
    "move-message",
    "connections",
    "connection-form",
    "vhosts",
    "help",
  ];

  it("offers something on every screen that advertises it", () => {
    for (const screen of screens) {
      const actions = paletteActions({
        screen,
        selection: { queue: null, message: null },
        row: null,
        isAmqp: true,
      });

      expect(
        actions.length,
        `no actions offered from '${screen}'`,
      ).toBeGreaterThan(0);
    }
  });

  it("always offers a way home and a way out", () => {
    for (const screen of screens) {
      const ids = paletteActions({
        screen,
        selection: { queue: null, message: null },
        row: null,
        isAmqp: true,
      }).map((action) => action.id);

      expect(ids).toContain("quit");
      if (screen !== "queues") expect(ids).toContain("queues");
    }
  });
});

describe("filtering is case-insensitive", () => {
  it("matches regardless of the case typed", () => {
    expect(globMatches("*ab-991*", '{"ref":"AB-991"}')).toBe(true);
    expect(globMatches("*ORDER*", "order-dlq")).toBe(true);
  });
});

describe("the drill-down loop", () => {
  it("comes back to the filter and the row you left", async () => {
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
    stdin.write("j");
    await settle();

    expect(lastFrame() ?? "").toContain("filter: order");
    expect(lastFrame() ?? "").toContain("2/3");

    stdin.write("\r");
    await settle();
    stdin.write(ESC);
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("filter: order");
    expect(frame).toContain("2/3");
    expect(frame).not.toContain("audit-log");
    unmount();
  });
});

describe("the help screen", () => {
  it("does not stack on top of itself", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("?");
    await settle();
    stdin.write("?");
    await settle();
    stdin.write("?");
    await settle();

    stdin.write(ESC);
    await settle();

    expect(lastFrame() ?? "").toContain("Queues");
    unmount();
  });
});

describe("destination queues", () => {
  it("refuses a name the broker does not have", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("m");
    await settle();
    stdin.write("");
    await settle();
    stdin.write("order-processing");
    await settle();
    stdin.write("\t");
    await settle();
    stdin.write("retry-qeuue");
    await settle();
    stdin.write("\r");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("No queue named 'retry-qeuue'");

    expect(frame).toContain("To queue");
    unmount();
  });

  it("completes a real queue name from a prefix", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("m");
    await settle();
    stdin.write("");
    await settle();
    stdin.write("order-f");
    await settle();

    expect(lastFrame() ?? "").toContain("1 of 5 match: order-failed");

    stdin.write("[C");
    await settle();

    expect(lastFrame() ?? "").toContain("order-failed");
    unmount();
  });
});

describe("the help page", () => {
  it("leads with the keys of the screen it was opened from", () => {
    const [first] = sectionsFor("message");

    expect(first?.title).toBe("Message view");
    expect(first?.here).toBe(true);
    expect(first?.bindings.map((b) => b.keys)).toContain("R");
  });

  it("does not list keys that do nothing where the user is", () => {
    const keys = sectionsFor("message")
      .flatMap((section) => section.bindings)
      .map((binding) => binding.keys);

    expect(keys).not.toContain("p");
    expect(keys).not.toContain("t");
  });

  it("offers the shared list keys only on screens that are lists", () => {
    const titles = (screen: Parameters<typeof sectionsFor>[0]) =>
      sectionsFor(screen).map((section) => section.title);

    expect(titles("queues")).toContain("Lists");
    expect(titles("message")).not.toContain("Lists");
  });

  it("always includes the keys that work anywhere", () => {
    for (const screen of [
      "queues",
      "queue",
      "message",
      "search",
      "consume",
      "connections",
    ] as const) {
      expect(sectionsFor(screen).map((s) => s.title)).toContain("Anywhere");
    }
  });
});

describe("help in the running app", () => {
  it("shows the message view's keys when opened from a message", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write("\r");
    await settle();
    stdin.write("?");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Message view (you are here)");
    expect(frame).toContain("scroll the payload");

    expect(frame).not.toContain("switch virtual host");
    unmount();
  });

  it("shows the queue list's keys when opened from the queue list", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("?");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Queue list (you are here)");
    expect(frame).toContain("switch virtual host");
    expect(frame).not.toContain("scroll the payload");
    unmount();
  });
});

describe("marking rows for a bulk action", () => {
  it("purges every marked queue in one confirmation", async () => {
    const container = build({ a: ["1", "2"], b: ["3"], c: ["4"] });
    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write(" ");
    await settle();
    stdin.write(" ");
    await settle();
    expect(lastFrame() ?? "").toContain("2 queues marked");

    stdin.write("p");
    await settle();

    expect(lastFrame() ?? "").toContain("Purge 2 queues (a, b), 3 messages?");

    stdin.write("y");
    await settle();

    const broker = container.broker as FakeBroker;
    expect(broker.payloads("a")).toEqual([]);
    expect(broker.payloads("b")).toEqual([]);
    expect(broker.payloads("c")).toEqual(["4"]);
    unmount();
  });

  it("drops the marks once the action has run", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build({ a: ["1"], b: ["2"] })} />,
    );
    await settle();

    stdin.write(" ");
    await settle();
    stdin.write("p");
    await settle();
    stdin.write("y");
    await settle();

    expect(lastFrame() ?? "").not.toContain("marked");
    unmount();
  });

  it("deletes marked messages in a single pass over the queue", async () => {
    const container = build({ orders: ["m1", "m2", "m3", "m4"] });
    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write(" ");
    await settle();
    stdin.write(" ");
    await settle();
    expect(lastFrame() ?? "").toContain("2 messages marked");

    stdin.write("d");
    await settle();
    expect(lastFrame() ?? "").toContain("Delete 2 messages from 'orders'?");

    stdin.write("y");
    await settle();

    expect((container.broker as FakeBroker).payloads("orders")).toEqual([
      "m3",
      "m4",
    ]);
    unmount();
  });

  it("acts on the cursor when nothing is marked", async () => {
    const container = build({ orders: ["m1", "m2"] });
    const { stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write("d");
    await settle();
    stdin.write("y");
    await settle();

    expect((container.broker as FakeBroker).payloads("orders")).toEqual(["m2"]);
    unmount();
  });
});

describe("navigation after an action", () => {
  it("leaves a message view when the message is deleted", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build({ orders: ["m1", "m2"] })} />,
    );
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write("\r");
    await settle();
    expect(lastFrame() ?? "").toContain("Message");

    stdin.write("d");
    await settle();
    stdin.write("y");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("orders");
    expect(frame).not.toContain("Transport");
    unmount();
  });
});

describe("marks and navigation", () => {
  it("forgets marks when the list is left", async () => {
    const container = build({ orders: ["m1", "m2", "m3"] });
    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write(" ");
    await settle();
    stdin.write(" ");
    await settle();
    expect(lastFrame() ?? "").toContain("2 messages marked");

    stdin.write(ESC);
    await settle();
    stdin.write("\r");
    await settle();

    expect(lastFrame() ?? "").not.toContain("marked");
    unmount();
  });

  it("deletes the message being viewed, not marks left behind on the list", async () => {
    const container = build({ orders: ["m1", "m2", "m3"] });
    const { stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write(" ");
    await settle();
    stdin.write(" ");
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write("d");
    await settle();
    stdin.write("y");
    await settle();

    expect((container.broker as FakeBroker).payloads("orders")).toEqual([
      "m1",
      "m2",
    ]);
    unmount();
  });
});

describe("the row menu", () => {
  it("offers the actions for the row under the cursor", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write(".");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("order-processing");
    expect(frame).toContain("Purge queue");
    expect(frame).toContain("Export to file");
    unmount();
  });

  it("offers message actions, not queue ones, when the row is a message", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build(seed)} />,
    );
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write(".");
    await settle();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Delete message");
    expect(frame).toContain("Reprocess message");
    expect(frame).not.toContain("Purge queue");
    unmount();
  });

  it("says so when there is no row to act on", async () => {
    const { lastFrame, stdin, unmount } = render(<App container={build({})} />);
    await settle();

    stdin.write(".");
    await settle();

    expect(lastFrame() ?? "").toContain("Nothing selected.");
    unmount();
  });
});

describe("the action list", () => {
  it("ranks a label match above an action that merely mentions the word", async () => {
    const { lastFrame, stdin, unmount } = render(
      <App container={build({ orders: ["m1", "m2"] })} />,
    );
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write(":");
    await settle();
    stdin.write("Delete");
    await settle();

    const frame = lastFrame() ?? "";
    const deleteAt = frame.indexOf("Delete message");
    const purgeAt = frame.indexOf("Purge queue");

    expect(deleteAt).toBeGreaterThan(-1);
    expect(purgeAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeLessThan(purgeAt);
    unmount();
  });

  it("keeps marks made before it was opened", async () => {
    const container = build({ orders: ["m1", "m2", "m3", "m4"] });
    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write(" ");
    await settle();
    stdin.write(" ");
    await settle();

    stdin.write(":");
    await settle();
    stdin.write("Delete");
    await settle();
    stdin.write("\r");
    await settle();

    expect(lastFrame() ?? "").toContain("Delete 2 messages");

    stdin.write("y");
    await settle();
    expect((container.broker as FakeBroker).payloads("orders")).toEqual([
      "m3",
      "m4",
    ]);
    unmount();
  });
});

describe("running operations in the background", () => {
  it("keeps the app navigable while a job runs and shows its progress", async () => {
    const container = build(seed);
    const release = { resolve: () => {} };
    const gate = new Promise<void>((resolve) => {
      release.resolve = resolve;
    });

    container.jobs.start({
      kind: "move",
      title: "Moving 3 messages to retry",
      run: async (job) => {
        job.report({ phase: "Repositioning", done: 412, total: 1204 });
        await gate;
        return "Moved 3 messages.";
      },
    });

    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    expect(lastFrame()).toContain("Moving 3 messages to retry");
    expect(lastFrame()).toContain("repositioning 412/1,204");
    expect(lastFrame()).toContain("1 running");

    stdin.write("/");
    await settle();
    stdin.write("order");
    await settle();
    stdin.write("\r");
    await settle();
    expect(lastFrame()).toContain("order-processing");

    release.resolve();
    await settle();
    expect(lastFrame()).toContain("Moved 3 messages.");

    unmount();
  });

  it("asks before quitting while an operation is still running", async () => {
    const container = build(seed);
    const release = { resolve: () => {} };
    const gate = new Promise<void>((resolve) => {
      release.resolve = resolve;
    });

    container.jobs.start({
      kind: "move",
      title: "Moving 3 messages to retry",
      run: async () => {
        await gate;
        return "done";
      },
    });

    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("q");
    await settle();

    expect(lastFrame()).toContain("1 operation still running");
    expect(lastFrame()).toContain("Quit anyway?");

    stdin.write("n");
    await settle();
    expect(lastFrame()).not.toContain("Quit anyway?");

    release.resolve();
    await settle();
    unmount();
  });

  it("quits without asking when nothing is running", async () => {
    const container = build(seed);
    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("q");
    await settle();

    expect(lastFrame()).not.toContain("Quit anyway?");
    unmount();
  });

  it("lists jobs and lets one be cancelled", async () => {
    const container = build(seed);
    const gate = new Promise<void>(() => {});

    container.jobs.start({
      kind: "move",
      title: "Moving 3 messages to retry",
      run: async (job) => {
        await gate;
        job.throwIfCancelled();
        return "done";
      },
    });

    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("J");
    await settle();
    expect(lastFrame()).toContain("Background jobs");
    expect(lastFrame()).toContain("Moving 3 messages to retry");

    stdin.write("x");
    await settle();
    expect(lastFrame()).toContain("stopping…");

    unmount();
  });

  it("says so when there is nothing running", async () => {
    const container = build(seed);
    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("J");
    await settle();

    expect(lastFrame()).toContain("Nothing is running.");
    unmount();
  });

  it("hands a bulk delete to a job and reports it when it lands", async () => {
    const container = build({ orders: ["a", "b", "c"] });
    const broker = container.broker as FakeBroker;
    const { lastFrame, stdin, unmount } = render(<App container={container} />);
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write(" ");
    await settle();
    stdin.write("d");
    await settle();

    expect(lastFrame()).toContain("Delete this message");
    stdin.write("y");
    await settle();
    await settle();

    expect(broker.payloads("orders")).toEqual(["b", "c"]);
    expect(lastFrame()).toContain("Deleted 1 message from orders");

    unmount();
  });
});

describe("paging through a deep queue", () => {
  const deep = Array.from({ length: 25 }, (_, index) => `m${index}`);

  it("says how much of the queue it is showing and pages on demand", async () => {
    const container = build({ orders: deep });
    const { lastFrame, stdin, unmount } = render(
      <App container={container} pageSize={10} />,
    );
    await settle();

    stdin.write("\r");
    await settle();

    expect(lastFrame()).toContain("showing 10 of 25");
    expect(lastFrame()).toContain("] for more");

    stdin.write("]");
    await settle();
    expect(lastFrame()).toContain("showing 20 of 25");

    stdin.write("]");
    await settle();
    expect(lastFrame()).toContain("all 25 messages");
    expect(lastFrame()).not.toContain("] for more");

    unmount();
  });

  it("leaves the queue untouched after browsing it", async () => {
    const container = build({ orders: deep });
    const broker = container.broker as FakeBroker;
    const { stdin, unmount } = render(
      <App container={container} pageSize={10} />,
    );
    await settle();

    stdin.write("\r");
    await settle();
    stdin.write("]");
    await settle();
    stdin.write(ESC);
    await settle();

    expect(broker.payloads("orders")).toEqual(deep);
    unmount();
  });
});
