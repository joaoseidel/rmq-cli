#!/usr/bin/env node
import { render } from "ink";
import { readFileSync } from "node:fs";
import { createContainer } from "../container.ts";
import { createLogger, logFilePath } from "../core/util/logger.ts";
import { errorMessage } from "../core/util/text.ts";
import { App } from "../ui/components/app.tsx";
import { enterFullscreen } from "../ui/hooks/use-fullscreen.ts";

const logger = createLogger("main");

function readVersion(): string {
  try {
    const manifest = readFileSync(
      new URL("../../package.json", import.meta.url),
      "utf8",
    );
    return (JSON.parse(manifest) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const VERSION = readVersion();

const USAGE = `rmq ${VERSION}: a full-screen browser for RabbitMQ

Usage:
  rmq              open the browser
  rmq --help       show this message
  rmq --version    show the version

Everything else (connections, queues, messages, publishing, exports) is done
inside the app. Press ':' for the action list or '?' for help once it opens.

Environment:
  RMQ_HOME         config directory (default ~/.rmq-cli)
  RMQ_LOG_LEVEL    debug | info | warn | error (default info)
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }

  if (argv.includes("--version") || argv.includes("-V")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (process.stdout.isTTY !== true || process.stdin.isTTY !== true) {
    process.stderr.write(
      "rmq is a full-screen terminal application and needs an interactive terminal.\n",
    );
    process.exitCode = 1;
    return;
  }

  const container = createContainer();
  const restore = enterFullscreen();

  try {
    const instance = render(<App container={container} />, {
      exitOnCtrlC: false,
    });
    await instance.waitUntilExit();
  } finally {
    restore();
  }
}

main().catch((error: unknown) => {
  logger.error("Unhandled error", error);
  process.stderr.write(`Error: ${errorMessage(error)}\n`);
  process.stderr.write(`Details were written to ${logFilePath}\n`);
  process.exitCode = 1;
});
