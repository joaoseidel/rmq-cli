# rmq

[![npm version](https://img.shields.io/npm/v/rmq-cli?color=blue&label=rmq-cli)](https://www.npmjs.com/package/rmq-cli)
[![CI](https://github.com/joaoseidel/rmq-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/joaoseidel/rmq-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/rmq-cli)](LICENSE)
[![node](https://img.shields.io/node/v/rmq-cli)](package.json)

A full-screen terminal browser for RabbitMQ, built with [Ink](https://github.com/vadimdemedes/ink).

![rmq-cli demo](assets/demo.gif)

## Features

- **Queue browser** - filter by glob, inspect depths, purge, and tail live
- **Message inspection** - page through without consuming, pretty-printed JSON, filter by payload/headers/id
- **Cross-queue search** - literal text, nested JSON fragments, `field:value` paths, or `re:` regexes, searched across many queues at once with results streaming in
- **Background operations** - moves, transfers, purges and deletes run in the background with a progress bar and time remaining while you keep browsing
- **Crash recovery** - work interrupted mid-flight is replayed from a write-ahead backup instead of being lost
- **Publishing** - send to a queue or exchange with routing key, body inline or from file
- **Export / import** - dump a queue to JSON, import back into any queue
- **Bulk actions** - mark rows with `space`, then act on all of them at once
- **Multi-connection** - add, remove, and switch between brokers and virtual hosts
- **Safe by default** - browsing never consumes; destructive operations ask first and log to a write-ahead backup

## Install

Requires [Node.js](https://nodejs.org/) >= 22.

```bash
npx rmq-cli
```

Permanent install:

```bash
npm install -g rmq-cli
```

From a [release tarball](https://github.com/joaoseidel/rmq-cli/releases):

```bash
npm install -g rmq-cli-<version>.tgz
```

## Getting started

On first run, `rmq` opens on the connection form. Fill it in and press **Enter** - the connection is tested before it is saved. From then on it opens on the queue list for your default connection.

## Key bindings

Press `?` for context-sensitive help. The footer always shows available keys for the current screen.

| Key            | Action                                      |
| -------------- | ------------------------------------------- |
| `:`            | open the action list                        |
| `.`            | actions for the row under the cursor        |
| `?`            | key reference                               |
| `↑` `↓` `j` `k` | move the cursor                          |
| `Enter`        | open selected queue or message              |
| `/`            | filter list (`Enter` applies, `Esc` clears) |
| `s`            | search messages across filtered queues      |
| `r`            | re-read from broker                         |
| `Space`        | mark row, step to next                      |
| `a`            | mark/unmark all filtered rows               |
| `Esc`          | back one screen                             |
| `q`            | back or quit                                |

**Queue list:** `p` purge, `t` tail, `e` export, `i` import, `w` publish, `m` move, `R` reprocess, `c` connections, `v` virtual hosts.

**Queue or message:** `d` delete, `M` move, `R` reprocess to original exchange.

**Search results:** `+` / `-` adjust depth (remembered between runs), `r` re-run, `/` new search.

### Whole-queue moves

`m` on the queue list moves messages out of the queues you marked with `space`, or the one under the cursor if you marked none. Pick one destination and either a per-queue limit or everything; each source is drained and backed up on its own, so a queue that fails leaves the ones already moved alone. The destination cannot be one of the sources, and a destination that does not exist is refused before anything is taken.

`R` reprocesses whole queues: every message is republished to the exchange and routing key it originally arrived on, then taken off the queue. This is how a dead-letter queue is drained back into normal flow. Messages whose exchange still routes back to the same queue land there again - the confirmation says so before you commit.

**Background jobs:** `J` opens the job list from anywhere; `x` cancels one, `d` dismisses a finished one, `c` clears them all. Quitting while work is running asks first.

### Searching a payload

The search box takes three kinds of term:

| Term | Matches |
| ---- | ------- |
| `AB-991` | that text anywhere in the payload, id, routing key, exchange, headers or properties |
| `{"status":"failed"}` | that JSON fragment wherever it is nested, ignoring whitespace |
| `order.items.sku:AB-991` | a value at that path inside the payload; `*` and array indexes work too |
| `re:AB-\d{3}` | an explicit regular expression |

Terms are literal by default, so braces, brackets and pipes in a payload are safe to paste. A term that cannot be parsed is reported as an error rather than quietly matching nothing.

## Safety

- Browsing reads without acknowledgement - nothing is consumed.
- Only purge, delete, move, reprocess, and export-with-removal change anything, and each asks first.
- Single-message delete/move/reprocess drains and republishes the queue; the app warns before doing it.
- All destructive operations run behind a write-ahead log at `~/.rmq-cli/message_backup_operations.json`.
- Moves publish the copy before removing the original - interruption duplicates, never loses.
- Moves and deletes carry headers, properties and routing through unchanged.
- If rmq is interrupted mid-operation, the next run offers to put the drained messages back. Recovery only ever republishes into the broker and vhost the messages came from.
- Publishes are confirmed by the broker; unroutable destinations are reported as failures.

### Connection types

| Type | Capabilities                                         |
| ---- | ---------------------------------------------------- |
| AMQP | Full support including live tail                     |
| HTTP | Management API only; live tail greyed out            |

## Configuration

Settings live in `~/.rmq-cli/settings.json` (mode `0600`). Set `RMQ_HOME` to relocate.

Broker passwords are AES-256-GCM encrypted. The key is generated on first run at `~/.rmq-cli/key`. Back up `key` alongside `settings.json`.

Logs go to `~/.rmq-cli/rmq-cli.log`. Set `RMQ_LOG_LEVEL` to `debug`, `info`, `warn`, or `error`.

Preferences (message page size, search depth, and the concurrency used for search, publishing and per-queue fan-out) are stored alongside your connections and updated as you adjust them in the app.

## Development

```bash
git clone https://github.com/joaoseidel/rmq-cli.git && cd rmq-cli
pnpm install
pnpm run dev          # run from source
pnpm test             # unit and component tests
pnpm run typecheck    # tsc --noEmit
pnpm run build        # compile to dist/
```

A local RabbitMQ instance with sample data:

```bash
docker compose -f .docker-compose/dev-stack.yml up -d
```

Listens on 5672 (AMQP) and 15672 (management), credentials `rabbitmq` / `rabbitmq`.

The seed populates the default vhost with 19 queues of realistic e-commerce data: orders, payments, shipping, notifications, inventory, audit, analytics, and users. Dead-letter queues with DLX exchanges catch failed messages.

### Project structure

```
src/
├── bin/rmq.tsx        entry point
├── container.ts       dependency wiring
├── core/              broker-agnostic domain logic
│   ├── domain/        value objects and types
│   ├── ports/         adapter interfaces
│   ├── usecase/       application operations
│   └── util/          helpers
├── adapters/
│   ├── rabbitmq/      AMQP and management API clients
│   └── storage/       settings, connection registry, backup log
└── ui/
    ├── components/
    │   ├── common/    input primitives
    │   ├── parts/     reusable pieces (table, spinner, frame)
    │   └── screens/   one file per full-screen view
    ├── hooks/         terminal size, async state, key input
    ├── actions.ts     action list definitions
    ├── screens.ts     screen union and parameters
    └── theme.ts       colours and glyphs
```

Dependency rule: `ui` and `adapters` depend on `core`; `core` depends on neither.

## License

[Apache 2.0](LICENSE)

## Contributing

Pull requests welcome. Keep `pnpm run typecheck` and `pnpm test` green.
