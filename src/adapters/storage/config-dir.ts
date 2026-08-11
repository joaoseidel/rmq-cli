import { homedir } from "node:os";
import { join } from "node:path";

/** Where connections, backups, the log, and the encryption key live. */
export function defaultConfigDir(): string {
  return process.env["RMQ_HOME"] ?? join(homedir(), ".rmq-cli");
}
