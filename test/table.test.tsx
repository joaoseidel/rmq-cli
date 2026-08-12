import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import stringWidth from "string-width";
import {
  computeColumnWidths,
  type Column,
} from "../src/ui/components/parts/table.tsx";
import { QueueTable } from "../src/ui/components/parts/tables.tsx";
import type { Queue } from "../src/core/domain/queue.ts";

interface Row {
  name: string;
  count: string;
}

const columns: Column<Row>[] = [
  {
    key: "name",
    header: "Name",
    value: (row) => row.name,
    flex: 3,
    minWidth: 6,
  },
  { key: "count", header: "Count", value: (row) => row.count },
];

const rows: Row[] = [
  { name: "short", count: "1" },
  { name: "a-much-longer-queue-name", count: "1000" },
];

function totalWidth(widths: number[]): number {
  return widths.reduce((sum, width) => sum + width, 0) + widths.length * 3 + 1;
}

describe("computeColumnWidths", () => {
  it("never exceeds the available width", () => {
    for (const max of [40, 60, 80, 120, 200]) {
      expect(
        totalWidth(computeColumnWidths(columns, rows, max)),
      ).toBeLessThanOrEqual(max);
    }
  });

  it("fits the widest cell when there is room", () => {
    const widths = computeColumnWidths(columns, rows, 200);
    expect(widths[0]).toBeGreaterThanOrEqual("a-much-longer-queue-name".length);
  });

  it("shrinks the flexible column rather than the fixed one", () => {
    const widths = computeColumnWidths(columns, rows, 40);

    expect(widths[1]).toBeGreaterThanOrEqual("Count".length);
  });

  it("keeps a fixed column at its natural width when space allows", () => {
    const widths = computeColumnWidths(columns, rows, 120);
    expect(widths[1]).toBe("Count".length);
  });

  it("survives an absurdly narrow terminal", () => {
    const widths = computeColumnWidths(columns, rows, 10);
    expect(widths.every((width) => width >= 1)).toBe(true);
    expect(totalWidth(widths)).toBeLessThanOrEqual(10);
  });
});

describe("QueueTable", () => {
  const queues: Queue[] = [
    {
      name: "order-processing",
      vhost: "/",
      messagesReady: 22,
      messagesUnacknowledged: 0,
    },
    {
      name: "order-failed",
      vhost: "/",
      messagesReady: 3,
      messagesUnacknowledged: 1,
    },
  ];

  it("renders every row within the requested width", () => {
    const { lastFrame } = render(<QueueTable queues={queues} width={80} />);
    const lines = (lastFrame() ?? "")
      .split("\n")
      .filter((line) => line.trim() !== "");

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(stringWidth(line)).toBeLessThanOrEqual(80);
    }
  });

  it("renders all lines at the same width so borders line up", () => {
    const { lastFrame } = render(<QueueTable queues={queues} width={80} />);
    const widths = new Set(
      (lastFrame() ?? "")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => stringWidth(line)),
    );

    expect(widths.size).toBe(1);
  });

  it("shows the queue data", () => {
    const { lastFrame } = render(<QueueTable queues={queues} width={100} />);
    expect(lastFrame()).toContain("order-processing");
    expect(lastFrame()).toContain("22");
  });
});

describe("column widths while scrolling", () => {
  const rows = [
    { name: "short", vhost: "/", messagesReady: 1, messagesUnacknowledged: 0 },
    {
      name: "a-much-longer-queue-name-here",
      vhost: "/",
      messagesReady: 200000,
      messagesUnacknowledged: 0,
    },
    { name: "mid-length", vhost: "/", messagesReady: 42, messagesUnacknowledged: 0 },
  ];

  function widthsOf(frame: string): number[] {
    return (frame.split("\n")[0] ?? "").split(/[┬┼]/).map((cell) => cell.length);
  }

  it("stays put when only part of the list is on screen", () => {
    const first = render(
      <QueueTable queues={rows.slice(0, 1)} allQueues={rows} width={80} />,
    );
    const second = render(
      <QueueTable queues={rows.slice(1, 2)} allQueues={rows} width={80} />,
    );

    expect(widthsOf(first.lastFrame() ?? "")).toEqual(
      widthsOf(second.lastFrame() ?? ""),
    );

    first.unmount();
    second.unmount();
  });

  it("still fits the width it is given", () => {
    const { lastFrame, unmount } = render(
      <QueueTable queues={rows.slice(0, 1)} allQueues={rows} width={60} />,
    );

    for (const line of (lastFrame() ?? "").split("\n")) {
      expect(stringWidth(line)).toBeLessThanOrEqual(60);
    }
    unmount();
  });
});
