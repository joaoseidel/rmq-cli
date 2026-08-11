import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FileKeySecretCipher } from "../src/adapters/storage/secret-cipher.ts";

describe("FileKeySecretCipher", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rmq-key-"));
  });

  it("round-trips a value", () => {
    const cipher = new FileKeySecretCipher(dir);
    const encrypted = cipher.encrypt("hunter2");

    expect(encrypted).not.toContain("hunter2");
    expect(cipher.decrypt(encrypted)).toBe("hunter2");
  });

  it("reuses the key file across instances", () => {
    const encrypted = new FileKeySecretCipher(dir).encrypt("hunter2");
    expect(new FileKeySecretCipher(dir).decrypt(encrypted)).toBe("hunter2");
  });

  it("writes the key with owner-only permissions", () => {
    new FileKeySecretCipher(dir);
    expect(statSync(join(dir, "key")).mode & 0o777).toBe(0o600);
  });

  it("produces a different ciphertext each time", () => {
    const cipher = new FileKeySecretCipher(dir);
    expect(cipher.encrypt("hunter2")).not.toBe(cipher.encrypt("hunter2"));
  });

  it("passes plaintext through untouched", () => {
    const cipher = new FileKeySecretCipher(dir);
    expect(cipher.isEncrypted("hunter2")).toBe(false);
    expect(cipher.decrypt("hunter2")).toBe("hunter2");
  });

  it("refuses a value another key produced", () => {
    const encrypted = new FileKeySecretCipher(dir).encrypt("hunter2");
    const other = mkdtempSync(join(tmpdir(), "rmq-key-"));

    expect(new FileKeySecretCipher(other).decrypt(encrypted)).toBeNull();
  });

  it("rejects a tampered ciphertext", () => {
    const cipher = new FileKeySecretCipher(dir);

    // "rmqenc.v1.<iv>.<tag>.<ciphertext>" — flip a bit in the payload.
    const parts = cipher.encrypt("hunter2").split(".");
    const payload = Buffer.from(parts[4] ?? "", "base64");
    payload.writeUInt8(payload.readUInt8(0) ^ 0xff, 0);
    parts[4] = payload.toString("base64");

    expect(cipher.decrypt(parts.join("."))).toBeNull();
  });

  it("rejects a malformed ciphertext", () => {
    expect(new FileKeySecretCipher(dir).decrypt("rmqenc.v1.nonsense")).toBeNull();
  });

  it("fails loudly rather than replacing a corrupt key", () => {
    writeFileSync(join(dir, "key"), "not-a-key\n");
    expect(() => new FileKeySecretCipher(dir)).toThrow(/encryption key/i);
    expect(readFileSync(join(dir, "key"), "utf8")).toBe("not-a-key\n");
  });
});
