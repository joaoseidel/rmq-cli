import { describe, expect, it } from "vitest";
import {
  globMatches,
  removeGlob,
  splitOnMatch,
  toGlobRegex,
  truncateAroundPattern,
} from "../src/core/util/glob.ts";

describe("toGlobRegex", () => {
  it("expands * to match any run of characters", () => {
    expect(toGlobRegex("order*").test("order-processing")).toBe(true);
  });

  it("expands ? to match exactly one character", () => {
    expect(toGlobRegex("user-?").test("user-1")).toBe(true);
    expect(toGlobRegex("user-?").test("user-")).toBe(false);
  });

  it("escapes literal dots", () => {
    expect(toGlobRegex("app.error").test("appXerror")).toBe(false);
    expect(toGlobRegex("app.error").test("app.error")).toBe(true);
  });
});

describe("globMatches", () => {
  it("matches anywhere in the value", () => {
    expect(globMatches("*event*", "new-event-handler")).toBe(true);
  });

  it("returns false for an invalid pattern instead of throwing", () => {
    expect(globMatches("[unterminated", "anything")).toBe(false);
  });
});

describe("removeGlob", () => {
  it("strips the metacharacters", () => {
    expect(removeGlob("*order.?")).toBe("order");
  });
});

describe("truncateAroundPattern", () => {
  const long = `${"a".repeat(200)}NEEDLE${"b".repeat(200)}`;

  it("keeps the match with surrounding context", () => {
    const result = truncateAroundPattern(long, "NEEDLE", 10);
    expect(result).toContain("NEEDLE");
    expect(result.length).toBeLessThan(long.length);
    expect(result.startsWith("...")).toBe(true);
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns the original when the pattern is absent", () => {
    expect(truncateAroundPattern(long, "MISSING", 10)).toBe(long);
  });

  it("returns the original for a blank pattern", () => {
    expect(truncateAroundPattern(long, "", 10)).toBe(long);
  });

  it("leaves short values alone", () => {
    expect(truncateAroundPattern("short", "or", 10)).toBe("short");
  });

  it("matches case-insensitively", () => {
    expect(truncateAroundPattern(long, "needle", 5)).toContain("NEEDLE");
  });
});

describe("splitOnMatch", () => {
  it("marks each occurrence", () => {
    expect(splitOnMatch("a-b-a", "a")).toEqual([
      { text: "a", match: true },
      { text: "-b-", match: false },
      { text: "a", match: true },
    ]);
  });

  it("returns a single unmatched segment for an empty needle", () => {
    expect(splitOnMatch("abc", "")).toEqual([{ text: "abc", match: false }]);
  });

  it("treats regex metacharacters literally", () => {
    expect(splitOnMatch("a.c", ".")).toEqual([
      { text: "a", match: false },
      { text: ".", match: true },
      { text: "c", match: false },
    ]);
  });
});
