import { describe, expect, it } from "vitest";
import { repositionedNote } from "../src/core/util/text.ts";

describe("explaining why other messages moved", () => {
  it("says nothing when nothing else was touched", () => {
    expect(repositionedNote(1, 0)).toBe("");
  });

  it("uses the singular for one bystander", () => {
    expect(repositionedNote(1, 1)).toBe(
      " 1 other message was re-queued to get at it.",
    );
  });

  it("uses the plural for several bystanders", () => {
    expect(repositionedNote(1, 4999)).toBe(
      " 4999 other messages were re-queued to get at it.",
    );
  });

  it("refers to several targets as 'them'", () => {
    expect(repositionedNote(3, 12)).toBe(
      " 12 other messages were re-queued to get at them.",
    );
  });

  it("reads as a whole sentence after the outcome", () => {
    expect(`Deleted 1 message from orders.${repositionedNote(1, 1)}`).toBe(
      "Deleted 1 message from orders. 1 other message was re-queued to get at it.",
    );
  });
});
