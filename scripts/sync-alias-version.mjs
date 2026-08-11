#!/usr/bin/env node
// Stamps the release version onto the @joaoseidel/rmq alias package, both as its
// own version and as the exact rmq-cli it depends on. semantic-release only ever
// bumps the root package.json, so without this the alias would drift and could
// resolve a different rmq-cli than the one just published.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];

if (version === undefined || version.length === 0) {
  process.stderr.write("usage: sync-alias-version.mjs <version>\n");
  process.exit(1);
}

const manifestPath = new URL("../npm/rmq-alias/package.json", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

manifest.version = version;
manifest.dependencies["rmq-cli"] = version;

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`@joaoseidel/rmq pinned to rmq-cli@${version}\n`);
