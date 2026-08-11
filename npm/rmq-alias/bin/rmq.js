#!/usr/bin/env node
// `rmq` is taken on npm by an unrelated package, so the CLI ships as `rmq-cli`.
// This package exists only so `npx @joaoseidel/rmq` also works: it pins the
// exact matching rmq-cli version and hands straight over to its entry point,
// which resolves its own version and paths from rmq-cli's package root.
import "rmq-cli/dist/bin/rmq.js";
