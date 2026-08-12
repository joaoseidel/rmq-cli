import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { errorMessage } from "./text.ts";

const LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LEVELS)[number];

const configuredLevel = (
  process.env["RMQ_LOG_LEVEL"] ?? "info"
).toLowerCase() as LogLevel;
const threshold =
  LEVELS.indexOf(configuredLevel) === -1
    ? LEVELS.indexOf("info")
    : LEVELS.indexOf(configuredLevel);

const logDir = process.env["RMQ_HOME"] ?? join(homedir(), ".rmq-cli");
const logFile = join(logDir, "rmq-cli.log");

let ready = false;

function ensureLogDir(): boolean {
  if (ready) return true;
  try {
    mkdirSync(logDir, { recursive: true });
    ready = true;
  } catch {
    ready = false;
  }
  return ready;
}

function write(
  level: LogLevel,
  scope: string,
  message: string,
  error?: unknown,
): void {
  if (LEVELS.indexOf(level) < threshold) return;
  if (!ensureLogDir()) return;

  const detail = error === undefined ? "" : ` | ${errorMessage(error)}`;
  const stack =
    error instanceof Error && error.stack !== undefined
      ? `\n${error.stack}\n`
      : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${detail}\n${stack}`;

  try {
    appendFileSync(logFile, line, "utf8");
  } catch {}
}

export interface Logger {
  debug(message: string, error?: unknown): void;
  info(message: string, error?: unknown): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, error) => write("debug", scope, message, error),
    info: (message, error) => write("info", scope, message, error),
    warn: (message, error) => write("warn", scope, message, error),
    error: (message, error) => write("error", scope, message, error),
  };
}

export const logFilePath = logFile;
