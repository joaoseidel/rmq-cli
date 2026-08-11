import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ZodType } from "zod";
import type { SettingsStore } from "../../core/ports/stores.ts";
import { createLogger } from "../../core/util/logger.ts";
import { defaultConfigDir } from "./config-dir.ts";

const logger = createLogger("settings-store");

type Document = Record<string, Record<string, unknown>>;

export class JsonSettingsStore implements SettingsStore {
  private readonly filePath: string;
  private document: Document = {};

  constructor(options: { configDir?: string; fileName?: string } = {}) {
    const configDir = options.configDir ?? defaultConfigDir();
    this.filePath = join(configDir, `${options.fileName ?? "settings"}.json`);

    try {
      mkdirSync(configDir, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create config directory '${configDir}'`, error);
    }

    this.load();
  }

  private load(): void {
    let content: string;
    try {
      content = readFileSync(this.filePath, "utf8");
    } catch {
      return; // First run: no file yet.
    }

    if (content.trim() === "") return;

    try {
      const parsed: unknown = JSON.parse(content);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        this.document = normalize(parsed as Record<string, unknown>);
      }
    } catch (error) {
      logger.error(
        `Failed to parse '${this.filePath}'; starting from an empty document`,
        error,
      );
    }
  }

  private persist(): void {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(this.document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temporary, this.filePath);
    } catch (error) {
      logger.error(`Failed to write '${this.filePath}'`, error);
      throw new Error(`Unable to save settings to ${this.filePath}`);
    }
  }

  private collection(name: string): Record<string, unknown> {
    return this.document[name] ?? {};
  }

  private decode<T>(
    value: unknown,
    schema: ZodType<T>,
    context: string,
  ): T | null {
    const result = schema.safeParse(value);
    if (result.success) return result.data;

    logger.error(
      `Failed to decode item in '${context}': ${result.error.message}`,
    );
    return null;
  }

  save<T extends { id: string }>(
    collection: string,
    item: T,
    schema: ZodType<T>,
  ): T {
    const id = item.id === "" ? randomUUID() : item.id;
    const stored = { ...item, id };

    this.document = {
      ...this.document,
      [collection]: { ...this.collection(collection), [id]: stored },
    };
    this.persist();

    return schema.parse(stored);
  }

  list<T>(collection: string, schema: ZodType<T>): T[] {
    const items: T[] = [];
    for (const value of Object.values(this.collection(collection))) {
      const decoded = this.decode(value, schema, collection);
      if (decoded !== null) items.push(decoded);
    }
    return items;
  }

  find<T>(
    collection: string,
    schema: ZodType<T>,
    predicate: (item: T) => boolean,
  ): T | null {
    return this.list(collection, schema).find(predicate) ?? null;
  }

  findById<T>(collection: string, id: string, schema: ZodType<T>): T | null {
    const value = this.collection(collection)[id];
    if (value === undefined) return null;
    return this.decode(value, schema, collection);
  }

  update<T extends { id: string }>(collection: string, item: T): boolean {
    const current = this.collection(collection);
    if (!(item.id in current)) return false;

    this.document = {
      ...this.document,
      [collection]: { ...current, [item.id]: item },
    };
    this.persist();
    return true;
  }

  delete(collection: string, id: string): boolean {
    const current = this.collection(collection);
    if (!(id in current)) return false;

    const { [id]: _removed, ...rest } = current;
    this.document = { ...this.document, [collection]: rest };
    this.persist();
    return true;
  }
}

function normalize(raw: Record<string, unknown>): Document {
  const document: Document = {};

  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const entries: Record<string, unknown> = {};
      value.forEach((item, index) => {
        if (typeof item !== "object" || item === null) return;
        const id = (item as { id?: unknown }).id;
        entries[typeof id === "string" ? id : String(index)] = item;
      });
      document[name] = entries;
    } else if (typeof value === "object" && value !== null) {
      document[name] = value as Record<string, unknown>;
    }
  }

  return document;
}
