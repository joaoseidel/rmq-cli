import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { JsonSettingsStore } from "../src/adapters/storage/json-settings-store.ts";
import { JsonConfigurationStore } from "../src/adapters/storage/json-configuration-store.ts";
import { FileKeySecretCipher } from "../src/adapters/storage/secret-cipher.ts";
import {
  ConnectionInfoSchema,
  type ConnectionInfo,
} from "../src/core/domain/connection.ts";
import { vHost } from "../src/core/domain/vhost.ts";

const ItemSchema = z.object({ id: z.string(), label: z.string() });

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "rmq-test-"));
}

function connection(name: string, isDefault = false): ConnectionInfo {
  return ConnectionInfoSchema.parse({
    id: name,
    type: "amqp",
    name,
    host: "localhost",
    username: "guest",
    password: "guest",
    vHost: vHost("/"),
    isDefault,
  });
}

describe("JsonSettingsStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = tempDir();
  });

  it("round-trips an item", () => {
    const store = new JsonSettingsStore({ configDir: dir });
    store.save("things", { id: "a", label: "first" }, ItemSchema);

    expect(store.findById("things", "a", ItemSchema)).toEqual({
      id: "a",
      label: "first",
    });
  });

  it("persists across instances", () => {
    new JsonSettingsStore({ configDir: dir }).save(
      "things",
      { id: "a", label: "first" },
      ItemSchema,
    );

    const reopened = new JsonSettingsStore({ configDir: dir });
    expect(reopened.list("things", ItemSchema)).toHaveLength(1);
  });

  it("overwrites an existing id rather than duplicating it", () => {
    const store = new JsonSettingsStore({ configDir: dir });
    store.save("things", { id: "a", label: "first" }, ItemSchema);
    store.save("things", { id: "a", label: "second" }, ItemSchema);

    expect(store.list("things", ItemSchema)).toEqual([
      { id: "a", label: "second" },
    ]);
  });

  it("reports deletion of a missing item", () => {
    const store = new JsonSettingsStore({ configDir: dir });
    expect(store.delete("things", "ghost")).toBe(false);
  });

  it("skips items that no longer match the schema", () => {
    const store = new JsonSettingsStore({ configDir: dir });
    store.save("things", { id: "good", label: "fine" }, ItemSchema);

    const file = join(dir, "settings.json");
    const document = JSON.parse(readFileSync(file, "utf8"));
    document["things"]["broken"] = { id: "broken" };
    writeFileSync(file, JSON.stringify(document));

    const reopened = new JsonSettingsStore({ configDir: dir });
    expect(reopened.list("things", ItemSchema)).toEqual([
      { id: "good", label: "fine" },
    ]);
  });

  it("starts empty when the file is corrupt", () => {
    writeFileSync(join(dir, "settings.json"), "{ not json");
    expect(
      new JsonSettingsStore({ configDir: dir }).list("things", ItemSchema),
    ).toEqual([]);
  });

  it("adopts a collection stored as an array", () => {
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ things: [{ id: "a", label: "first" }] }),
    );

    const store = new JsonSettingsStore({ configDir: dir });
    expect(store.findById("things", "a", ItemSchema)).toEqual({
      id: "a",
      label: "first",
    });
  });
});

describe("JsonConfigurationStore", () => {
  let dir: string;
  let store: JsonConfigurationStore;

  beforeEach(() => {
    dir = tempDir();
    store = new JsonConfigurationStore(
      new JsonSettingsStore({ configDir: dir }),
      new FileKeySecretCipher(dir),
    );
  });

  it("keeps exactly one default", () => {
    store.saveConnection(connection("first", true));
    store.saveConnection(connection("second", true));

    const defaults = store.listConnections().filter((item) => item.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.name).toBe("second");
  });

  it("moves the default when the current one is removed", () => {
    store.saveConnection(connection("first", true));
    store.saveConnection(connection("second"));

    store.removeConnection("first");

    expect(store.getDefaultConnection()?.name).toBe("second");
  });

  it("falls back to the first connection when none is flagged", () => {
    store.saveConnection(connection("only"));
    expect(store.getDefaultConnection()?.name).toBe("only");
  });

  it("returns null when there are no connections", () => {
    expect(store.getDefaultConnection()).toBeNull();
  });

  it("refuses to make a missing connection the default", () => {
    expect(store.setDefaultConnection("ghost")).toBe(false);
  });

  it("encrypts the password on disk and returns it decrypted", () => {
    store.saveConnection(connection("prod"));

    const document = JSON.parse(
      readFileSync(join(dir, "settings.json"), "utf8"),
    );
    const stored = document["connections"]["prod"] as ConnectionInfo;
    expect(stored.password).not.toBe("guest");
    expect(stored.password).toMatch(/^rmqenc\.v1\./);
    expect(stored.username).toBe("guest");

    expect(store.getConnection("prod")?.password).toBe("guest");
    expect(store.listConnections()[0]?.password).toBe("guest");
  });

  it("keeps the password encrypted when the default flag is rewritten", () => {
    store.saveConnection(connection("first", true));
    store.saveConnection(connection("second"));

    store.setDefaultConnection("second");

    const document = JSON.parse(
      readFileSync(join(dir, "settings.json"), "utf8"),
    );
    for (const stored of Object.values(document["connections"])) {
      expect((stored as ConnectionInfo).password).toMatch(/^rmqenc\.v1\./);
    }
    expect(store.getConnection("first")?.password).toBe("guest");
  });

  it("encrypts passwords left in plaintext by an older version", () => {
    const settings = new JsonSettingsStore({ configDir: dir });
    settings.save("connections", connection("legacy"), ConnectionInfoSchema);

    const upgraded = new JsonConfigurationStore(
      new JsonSettingsStore({ configDir: dir }),
      new FileKeySecretCipher(dir),
    );

    expect(readFileSync(join(dir, "settings.json"), "utf8")).toContain(
      "rmqenc.v1.",
    );
    expect(upgraded.getConnection("legacy")?.password).toBe("guest");
  });

  it("keeps a connection listed when its password cannot be decrypted", () => {
    store.saveConnection(connection("orphan"));

    rmSync(join(dir, "key"));
    const reopened = new JsonConfigurationStore(
      new JsonSettingsStore({ configDir: dir }),
      new FileKeySecretCipher(dir),
    );

    const found = reopened.getConnection("orphan");
    expect(found?.name).toBe("orphan");
    expect(found?.password).toBe("");
  });
});
