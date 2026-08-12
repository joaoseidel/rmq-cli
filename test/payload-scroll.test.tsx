import { render } from "ink-testing-library";
import stringWidth from "string-width";
import { describe, expect, it } from "vitest";
import type { Message } from "../src/core/domain/message.ts";
import { MessageScreen } from "../src/ui/components/screens/message-screen.tsx";
import { formatPayloadLines } from "../src/ui/components/parts/message-detail.tsx";
import { wrapToWidth } from "../src/ui/utils/width.ts";

const WIDTH = 40;

function message(payload: string): Message {
  return {
    id: "m-1",
    transport: "amqp",
    exchange: "",
    routingKey: "orders",
    payload,
    headers: {},
    properties: {},
  } as Message;
}

function payloadRows(output: string): string[] {
  const lines = output.split("\n");
  const rule = lines.findIndex((line) => line.startsWith("─"));
  return lines.slice(rule + 1, -1);
}

describe("wrapToWidth", () => {
  it("keeps a line that already fits", () => {
    expect(wrapToWidth("short", 10)).toEqual(["short"]);
  });

  it("keeps empty lines as one row", () => {
    expect(wrapToWidth("", 10)).toEqual([""]);
  });

  it("cuts a long line into rows no wider than the limit", () => {
    const rows = wrapToWidth("a".repeat(25), 10);

    expect(rows).toEqual(["aaaaaaaaaa", "aaaaaaaaaa", "aaaaa"]);
    for (const row of rows) expect(stringWidth(row)).toBeLessThanOrEqual(10);
  });

  it("never splits a wide glyph across rows", () => {
    const rows = wrapToWidth("あいうえお", 4);

    expect(rows).toEqual(["あい", "うえ", "お"]);
    for (const row of rows) expect(stringWidth(row)).toBeLessThanOrEqual(4);
  });
});

describe("payload lines", () => {
  it("counts wrapped rows, not logical lines", () => {
    const lines = formatPayloadLines(`${"x".repeat(90)}\nshort`, WIDTH);

    expect(lines).toHaveLength(4);
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(WIDTH);
  });
});

describe("MessageScreen scrolling", () => {
  const payload = Array.from(
    { length: 40 },
    (_, index) => `line-${index} ${"y".repeat(60)}`,
  ).join("\n");

  it("advances exactly one rendered row per keypress", async () => {
    const { stdin, lastFrame } = render(
      <MessageScreen
        message={message(payload)}
        onAction={() => {}}
        width={WIDTH}
        height={20}
        isActive
      />,
    );

    const before = payloadRows(lastFrame() ?? "");
    stdin.write("j");
    await Promise.resolve();
    const after = payloadRows(lastFrame() ?? "");

    expect(before).toHaveLength(12);
    expect(after).not.toEqual(before);
    expect(before.length).toBe(after.length);
    expect(after[0]).toBe(before[1]);
    expect(after.slice(0, -1)).toEqual(before.slice(1));
  });

  it("keeps the payload inside the height it was given", () => {
    const height = 20;
    const { lastFrame } = render(
      <MessageScreen
        message={message(payload)}
        onAction={() => {}}
        width={WIDTH}
        height={height}
        isActive
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame.split("\n").length).toBeLessThanOrEqual(height);
    for (const line of frame.split("\n"))
      expect(stringWidth(line)).toBeLessThanOrEqual(WIDTH);
  });
});
