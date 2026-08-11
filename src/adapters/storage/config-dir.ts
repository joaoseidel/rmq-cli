import { homedir } from "node:os";
import { join } from "node:path";

export function defaultConfigDir(): string {
  return process.env["RMQ_HOME"] ?? join(homedir(), ".rmq-cli");
}
