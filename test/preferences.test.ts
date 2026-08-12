import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonPreferencesStore } from "../src/adapters/storage/json-preferences-store.ts";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { defaultPreferences } from "../src/core/domain/preferences.ts";

function store(dir = mkdtempSync(join(tmpdir(), "rmq-prefs-"))) {
  return {
    dir,
    preferences: new JsonPreferencesStore(new JsonSettingsStore({ configDir: dir })),
  };
}

describe("remembering how the user likes to work", () => {
  it("starts from the defaults", () => {
    expect(store().preferences.read()).toEqual(defaultPreferences());
  });

  it("keeps a changed search depth across restarts", () => {
    const first = store();
    first.preferences.write({ searchDepth: 5000 });

    const reopened = store(first.dir);
    expect(reopened.preferences.read().searchDepth).toBe(5000);
    expect(reopened.preferences.read().messagePageSize).toBe(
      defaultPreferences().messagePageSize,
    );
  });

  it("merges a partial change instead of dropping the rest", () => {
    const { preferences } = store();
    preferences.write({ searchDepth: 1000 });
    const after = preferences.write({ messagePageSize: 50 });

    expect(after.searchDepth).toBe(1000);
    expect(after.messagePageSize).toBe(50);
  });

  it("refuses a value outside the range it can honour", () => {
    const { preferences } = store();
    expect(() => preferences.write({ searchConcurrency: 0 })).toThrow();
    expect(() => preferences.write({ messagePageSize: 1_000_000 })).toThrow();
  });

  it("falls back to the defaults when the file holds nonsense", () => {
    const { dir, preferences } = store();
    preferences.write({ searchDepth: 500 });

    const settings = new JsonSettingsStore({ configDir: dir });
    settings.save(
      "preferences",
      { id: "preferences", searchDepth: "deep" } as never,
      { parse: (value: unknown) => value } as never,
    );

    expect(
      new JsonPreferencesStore(new JsonSettingsStore({ configDir: dir })).read(),
    ).toEqual(defaultPreferences());
  });
});
