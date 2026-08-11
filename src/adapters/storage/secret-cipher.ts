import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../core/util/logger.ts";
import { defaultConfigDir } from "./config-dir.ts";

const logger = createLogger("secret-cipher");

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Marks a value as ciphertext and pins the format, so the layout can change
 * later without guessing how an old value was encoded. Base64 never contains a
 * `.`, which makes it a safe separator for the three parts that follow.
 */
const PREFIX = "rmqenc.v1.";

export interface SecretCipher {
  encrypt(plaintext: string): string;
  /** Returns null when the value is ciphertext this key cannot open. */
  decrypt(value: string): string | null;
  isEncrypted(value: string): boolean;
}

/**
 * AES-256-GCM with a random key kept in `<configDir>/key` at `0600`.
 *
 * This protects passwords against casual disclosure — a synced dotfile
 * directory, a home backup, a shoulder-surfed `cat settings.json`. It is not a
 * defence against an attacker who can already read your home directory, since
 * the key sits beside the data; an OS keychain would be needed for that.
 */
export class FileKeySecretCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(configDir: string = defaultConfigDir()) {
    this.key = loadOrCreateKey(configDir);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const parts = [iv, cipher.getAuthTag(), ciphertext].map((part) =>
      part.toString("base64"),
    );
    return PREFIX + parts.join(".");
  }

  decrypt(value: string): string | null {
    // Settings written before encryption existed hold the password verbatim.
    if (!this.isEncrypted(value)) return value;

    const [iv, tag, ciphertext] = value
      .slice(PREFIX.length)
      .split(".")
      .map((part) => Buffer.from(part, "base64"));

    if (iv === undefined || tag === undefined || ciphertext === undefined) {
      logger.error("Encrypted value is malformed");
      return null;
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      logger.error("Failed to decrypt a value with the current key", error);
      return null;
    }
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }
}

function loadOrCreateKey(configDir: string): Buffer {
  const keyPath = join(configDir, "key");

  const existing = readKey(keyPath);
  if (existing !== null) return existing;

  try {
    mkdirSync(configDir, { recursive: true });
    const key = randomBytes(KEY_BYTES);
    // `wx` fails rather than clobbering a key another process just wrote —
    // overwriting one would strand every password already encrypted with it.
    writeFileSync(keyPath, `${key.toString("base64")}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    logger.info(`Created the encryption key at '${keyPath}'`);
    return key;
  } catch (error) {
    const raced = readKey(keyPath);
    if (raced !== null) return raced;

    logger.error(`Failed to create the encryption key at '${keyPath}'`, error);
    throw new Error(
      `Unable to read or create the encryption key at ${keyPath}. ` +
        "If the file is corrupt, delete it and re-enter your connection passwords.",
    );
  }
}

function readKey(keyPath: string): Buffer | null {
  let content: string;
  try {
    content = readFileSync(keyPath, "utf8");
  } catch {
    return null; // First run: no key yet.
  }

  const key = Buffer.from(content.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    logger.error(`Encryption key at '${keyPath}' is not ${KEY_BYTES} bytes`);
    return null;
  }
  return key;
}
