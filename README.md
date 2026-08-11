# rmq

A full-screen terminal application for working with RabbitMQ, built with
[Ink](https://github.com/vadimdemedes/ink).

Run `rmq` and you get an interactive browser: queues on the left, messages one
keystroke away, and every operation — publishing, purging, moving messages,
exporting to disk, live tailing — driven from inside the app. There are no
subcommands and no flags to memorise.

```
rmq • Queues • local-dev • /
────────────────────────────────────────────────────────────────────────────────
filter: order (3 matching)
┌──────────────────────────────┬───────┬───────┬─────────┐
│ Name                         │ VHost │ Ready │ Unacked │
├──────────────────────────────┼───────┼───────┼─────────┤
│ order-processing             │ /     │  1042 │       3 │
│ order-failed                 │ /     │    17 │       0 │
│ order-dlq                    │ /     │     4 │       0 │
└──────────────────────────────┴───────┴───────┴─────────┘
1/3 • 1042 messages in order-processing
────────────────────────────────────────────────────────────────────────────────
↑↓ move  ⏎ open  / filter  r refresh  p purge  t tail  : actions  ? help  q quit
```

## Why

The official RabbitMQ tooling is good at administration and weak at the things
you actually do when something is broken at 2am: finding the one message with
the bad payload, moving a batch off a dead-letter queue, replaying a failure,
taking a copy of a queue before you touch it.

Those are exploratory tasks. You do not know the queue name in advance, you page
through messages until you find the interesting one, and each step depends on
what the last one showed. That is a browsing problem, not a scripting problem —
so `rmq` is a browser.

> **Version 2 is a rewrite.** Up to 1.5 `rmq` was a Kotlin/Gradle CLI with
> subcommands and flags, distributed as a GraalVM native binary. It is now a
> Node application and a browser rather than a command set. The old
> implementation remains in the git history; message ids are unchanged, so ids
> in existing exports still resolve.

## Install

Requires Node.js 22 or newer. Nothing to install — run it:

```bash
npx rmq-cli
```

`npx @joaoseidel/rmq` runs the same thing; that package is a thin alias, since
the bare name `rmq` was already taken on npm by an unrelated project.

For a permanent `rmq` on your PATH:

```bash
npm install -g rmq-cli
```

Prebuilt packages are also attached to each
[release](https://github.com/joaoseidel/rmq-cli/releases) as a `.tgz`:

```bash
npm install -g rmq-cli-<version>.tgz
```

From source, for development:

```bash
git clone https://github.com/joaoseidel/rmq-cli.git
cd rmq-cli
pnpm install
pnpm run dev       # run straight from the source tree

pnpm run build
npm link           # or build and put `rmq` on your PATH
```

## Getting started

On first run — with no connection configured — `rmq` opens on the connection
form. Fill it in, press Enter, and the connection is tested against the broker
before it is saved. A connection that cannot connect is never stored.

From then on `rmq` opens on the queue list for your default connection.

## Keys

Press `?` inside the app for the full reference, or `:` to open the action list,
which is searchable and shows everything available from the current screen.

| Key           | Does                                                     |
| ------------- | -------------------------------------------------------- |
| `:`           | open the action list — the reliable way to find anything |
| `?`           | key reference                                            |
| `↑ ↓` / `j k` | move the cursor                                          |
| `⏎`           | open the selected queue or message                       |
| `/`           | filter the current list; `⏎` applies, `esc` clears       |
| `r`           | re-read from the broker                                  |
| `esc`         | back one screen                                          |
| `q`           | back, or quit from the queue list                        |

On the queue list: `p` purge, `t` live tail, `e` export, `i` import, `w`
publish, `m` move messages, `c` connections, `v` virtual hosts.

On a queue or an open message: `d` delete, `M` move it to another queue, `R`
reprocess it to its original exchange.

## What it does

**Queues** — browse, filter by glob, inspect depths, purge, and tail live.

**Messages** — page through a queue without consuming anything, read payloads
with JSON pretty-printed, filter by content, delete, move to another queue, or
reprocess to the original exchange.

**Publishing** — send to a queue or to an exchange with a routing key, with the
body typed inline or read from a file.

**Files** — export a queue to JSON (leaving it untouched by default) and import
that file back into any queue.

**Connections** — add, remove, and switch between brokers and virtual hosts, all
without leaving the app.

### Safety

Browsing never consumes. Messages are read without acknowledgement, so anything
you look at — including a live tail — is still on the broker when you close the
screen.

Only purge, delete, move, and export-with-removal change anything, and each asks
first, quoting the number of messages at stake.

**Removing one message rewrites the queue.** AMQP has no delete-by-id: a message
can only be taken off the queue it is being read from. So deleting, moving, or
reprocessing a single message drains the whole queue and republishes everything
that was _not_ targeted. The app says so before it does it, and reports how many
messages it put back.

That is also why every destructive operation runs behind a write-ahead log.
Before anything is taken off a queue it is written to
`~/.rmq-cli/message_backup_operations.json`, and each message is cleared from
that file only once the broker has taken it back. If an operation dies half-way,
whatever it was holding is still on disk under the operation id the app reports,
and the app tells you when that has happened rather than reporting success.

Moves publish the copy before removing the original, so an interruption
duplicates a message rather than losing it.

### Connection types

**AMQP** is the default and supports everything.

**HTTP** talks to the management API only. Queue and message operations work,
but live tailing does not — the management API cannot stream. The action list
greys out anything unavailable and says why, rather than hiding it.

## Configuration

Connections live in `~/.rmq-cli/settings.json`, written with `0600` permissions.
Set `RMQ_HOME` to relocate it.

Broker passwords are encrypted with AES-256-GCM before they are written. The key
is generated on first run and kept in `~/.rmq-cli/key`, also at `0600`; settings
carrying a plaintext password from an older version are re-encrypted the next
time `rmq` starts. This guards against casual disclosure — a synced dotfile
directory, a home backup, a `cat settings.json` over someone's shoulder. It is
not a defence against an attacker who can already read your home directory,
since the key sits beside the data.

Back up `key` alongside `settings.json`: without it the stored passwords cannot
be recovered. A connection whose password fails to decrypt still appears in the
list, with an empty password to re-enter.

Diagnostics go to `~/.rmq-cli/rmq-cli.log`; `RMQ_LOG_LEVEL` accepts `debug`,
`info`, `warn`, or `error`. Nothing is ever logged to stdout — Ink owns the
screen, and a stray write corrupts the frame.

## Development

```bash
pnpm run dev        # run from source
pnpm test           # unit and component tests
pnpm run typecheck  # tsc --noEmit
pnpm run build      # compile to dist/
```

CI runs the same three checks on Node 20 and current LTS for every push and pull
request. Releases are cut manually with the **Create Semantic Release** workflow,
which derives the version from the commit history, updates `CHANGELOG.md` and
`package.json`, and attaches a packed tarball to the GitHub release. It does not
publish to the npm registry — flip `npmPublish` in `.releaserc.json` and add an
`NPM_TOKEN` if you want that.

A RabbitMQ instance with sample data is available for local work:

```bash
docker compose -f .docker-compose/dev-stack.yml up -d
```

It listens on 5672 (AMQP) and 15672 (management), with `rabbitmq`/`rabbitmq` as
the credentials.

### Layout

```
src/
├── bin/rmq.tsx        entry point: alternate screen buffer, render, restore
├── container.ts       dependency wiring, and the seam for test doubles
├── core/              broker-agnostic domain logic
│   ├── domain/        message ids, connections, queues, operation results
│   ├── ports/         interfaces the adapters implement
│   ├── usecase/       what the app can do, independent of transport and UI
│   └── util/          glob matching, text helpers, file logger
├── adapters/
│   ├── rabbitmq/      AMQP and management-API clients behind one interface
│   └── storage/       JSON-backed settings, connection registry, backup log
└── ui/
    ├── components/
    │   ├── common/    input primitives: select, text field, form, confirm
    │   ├── parts/     reusable pieces: table, spinner, frame, palette
    │   └── screens/   one file per full-screen view
    ├── hooks/         terminal size, async state, list navigation, key input
    ├── actions.ts     what the action list offers, and when
    ├── screens.ts     the screen union and its parameters
    └── theme.ts       colour roles and glyphs
```

The dependency rule is one-directional: `ui` and `adapters` both depend on
`core`, and `core` depends on neither. Swapping the broker client or the storage
backend means implementing a port in `src/core/ports/` and changing one line in
`container.ts`.

### A note on `useKeyHandler`

Use `src/ui/hooks/use-key-handler.ts` rather than Ink's `useInput` directly.

Ink subscribes its keypress listener in an effect keyed only on `isActive`, so
the callback it retains is the one from the render where the subscription
happened — every later closure, and every piece of state it reads, is ignored.
In practice a text field reads back its initial empty value on each keystroke and
a list acts on whichever row was selected when the screen first appeared.
`useKeyHandler` routes through a ref, so handlers always see the current render's
values. `test/text-input.test.tsx` covers the regression.

## License

Apache 2.0 — see `LICENSE`.

## Contributing

Pull requests welcome. Please keep `npm run typecheck` and `npm test` green.
