import { render } from "ink-testing-library";
import stringWidth from "string-width";
import { describe, expect, it } from "vitest";
import type { InterruptedOperation } from "../src/core/domain/operation.ts";
import type { Queue } from "../src/core/domain/queue.ts";
import type { MessageOperations } from "../src/core/usecase/message-operations.ts";
import type { Job } from "../src/core/usecase/jobs.ts";
import { Select } from "../src/ui/components/common/select.tsx";
import { QueueTable } from "../src/ui/components/parts/tables.tsx";
import { JobsScreen } from "../src/ui/components/screens/jobs-screen.tsx";
import { RecoveryScreen } from "../src/ui/components/screens/recovery-screen.tsx";

// ink-testing-library renders into a 100-column terminal.
const TERMINAL = 100;

function frameLines(frame: string | undefined): string[] {
  return (frame ?? "").split("\n");
}

function expectEveryLineFits(lines: readonly string[]) {
  for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(TERMINAL);
}

const long = "x".repeat(180);

describe("table rows", () => {
  const queues: Queue[] = Array.from({ length: 5 }, (_, index) => ({
    name: `${long}-${index}`,
    vhost: "/",
    messagesReady: 3,
    messagesUnacknowledged: 0,
    consumers: 0,
    durable: true,
  })) as Queue[];

  it("keeps one line per row when the table is wider than the terminal", () => {
    const { lastFrame } = render(
      <QueueTable queues={queues} width={200} selectedIndex={0} />,
    );

    const lines = frameLines(lastFrame());

    // top rule, header, middle rule, 5 rows, bottom rule
    expect(lines).toHaveLength(9);
    expectEveryLineFits(lines);
  });
});

describe("job rows", () => {
  const job = (index: number): Job => ({
    id: `job-${index}`,
    kind: "move",
    title: `Move messages from ${long} to ${long}`,
    state: "failed",
    progress: null,
    startedAt: 0,
    finishedAt: 1000,
    result: null,
    error: `boom\n${long}`,
    remainingMs: null,
  });

  it("keeps two lines per job however long the title and error are", () => {
    const jobs = [job(0), job(1), job(2)];
    const { lastFrame } = render(
      <JobsScreen
        jobs={jobs}
        onCancel={() => {}}
        onDismiss={() => {}}
        onClear={() => {}}
        width={TERMINAL}
        height={20}
        isActive
      />,
    );

    const lines = frameLines(lastFrame());

    expect(lines).toHaveLength(jobs.length * 2);
    expectEveryLineFits(lines);
  });
});

describe("recovery rows", () => {
  const entries: InterruptedOperation[] = Array.from(
    { length: 4 },
    (_, index) => ({
      id: `0123456789abcdef-${index}`,
      type: "move",
      origin: {
        connectionId: "c1",
        vhost: "/",
        queueName: `${long}-${index}`,
      },
      createdAt: Date.now() - 5000,
      total: 10,
      remaining: 10,
      recoverable: true,
    }),
  );

  const operations = {
    listInterruptedOperations: () => entries,
  } as unknown as MessageOperations;

  it("keeps one line per entry when the queue name is long", () => {
    const { lastFrame } = render(
      <RecoveryScreen
        operations={operations}
        scope={{ connectionId: "c1", vhost: "/" }}
        onRecover={() => {}}
        onForget={() => {}}
        height={20}
        isActive
      />,
    );

    const lines = frameLines(lastFrame());
    const firstRow = lines.findIndex((line) =>
      line.includes("to put back into"),
    );

    expect(firstRow).toBeGreaterThan(0);
    // every entry after the header takes exactly one line
    expect(lines).toHaveLength(firstRow + entries.length);
    expectEveryLineFits(lines);
  });
});

describe("select rows", () => {
  const items = Array.from({ length: 4 }, (_, index) => ({
    value: index,
    label: `${long}-${index}`,
    detail: long,
  }));

  it("keeps one line per item even when asked for more width than there is", () => {
    const { lastFrame } = render(
      <Select items={items} onSubmit={() => {}} width={TERMINAL * 2} />,
    );

    const lines = frameLines(lastFrame());

    expect(lines).toHaveLength(items.length);
    expectEveryLineFits(lines);
  });
});
