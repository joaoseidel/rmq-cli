import { Box, Text, useApp } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Container } from "../../container.ts";
import { isAmqp, type ConnectionInfo } from "../../core/domain/connection.ts";
import { displayExchange, type Message } from "../../core/domain/message.ts";
import type { Queue } from "../../core/domain/queue.ts";
import { totalMessages } from "../../core/domain/queue.ts";
import { isActive as isJobActive, type Job } from "../../core/usecase/jobs.ts";
import { mapWithConcurrency } from "../../core/util/pool.ts";
import { errorMessage, formatCount } from "../../core/util/text.ts";
import { paletteActions, rowActions, type ActionId } from "../actions.ts";
import { useJobCompletions, useJobs } from "../hooks/use-jobs.ts";
import {
  InputCaptureProvider,
  useInputCaptured,
} from "../hooks/use-input-capture.tsx";
import { useKeyHandler } from "../hooks/use-key-handler.ts";
import { useListMemory } from "../hooks/use-list-memory.ts";
import { useScreenStack } from "../hooks/use-screen-stack.ts";
import { useTerminalSize } from "../hooks/use-terminal-size.ts";
import { bindingsFor } from "../keymap.ts";
import {
  effectiveSelection,
  screenTitle,
  type PublishedSelection,
  type Screen,
} from "../screens.ts";
import { glyphs, theme } from "../theme.ts";
import { Confirm } from "./common/confirm.tsx";
import { ErrorBoundary } from "./error-boundary.tsx";
import { CommandPalette } from "./parts/command-palette.tsx";
import { JobIndicator } from "./parts/job-progress.tsx";
import { RowMenu } from "./parts/row-menu.tsx";
import type { KeyHint } from "./parts/key-hints.tsx";
import { SCREEN_CHROME_LINES, ScreenFrame } from "./parts/screen-frame.tsx";
import { StatusMessage } from "./parts/status-message.tsx";
import { ScreenRouter, type ScreenContext } from "./screen-router.tsx";
import { ConnectionFormScreen } from "./screens/connection-form-screen.tsx";

const MESSAGE_PAGE_SIZE = 200;
const QUEUE_CONCURRENCY = 4;

const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const NOTICE_MS = 4000;
const DANGER_NOTICE_MS = 10_000;

type PendingAction =
  | { readonly kind: "purge"; readonly queues: readonly Queue[] }
  | {
      readonly kind: "delete";
      readonly queue: Queue;
      readonly messages: readonly Message[];
    }
  | { readonly kind: "quit"; readonly running: readonly Job[] };

interface Overlay {
  readonly kind: "palette" | "row";
  readonly selection: PublishedSelection;
  readonly marked: {
    readonly queues: readonly Queue[];
    readonly messages: readonly Message[];
  };
}

interface Notice {
  readonly tone: "success" | "danger";
  readonly text: string;
}

export interface AppProps {
  readonly container: Container;
}

const ROW_MENU_HINTS: KeyHint[] = [
  { keys: "↑↓", label: "move" },
  { keys: "⏎", label: "run" },
  { keys: "esc", label: "close", essential: true },
];

const PALETTE_HINTS: KeyHint[] = [
  { keys: "↑↓", label: "move" },
  { keys: "⏎", label: "run" },
  { keys: "type", label: "filter actions" },
  { keys: "esc", label: "close", essential: true },
];

const CONFIRM_HINTS: KeyHint[] = [
  { keys: "y", label: "confirm", essential: true },
  { keys: "n", label: "cancel", essential: true },
];

const TYPING_HINTS: KeyHint[] = [
  { keys: "⏎", label: "confirm", essential: true },
  { keys: "esc", label: "cancel", essential: true },
];

function hintsFor(
  screen: Screen["name"],
  options: { typing: boolean; canGoBack: boolean; running: number },
): KeyHint[] {
  if (options.typing) return TYPING_HINTS;

  const screenHints = bindingsFor(screen)
    .filter(
      (binding) => binding.displayOnly === true || binding.primary === true,
    )
    .map((binding) => ({ keys: binding.key, label: binding.label }));

  return [
    ...screenHints,
    { keys: ".", label: "row menu" },
    ...(options.running > 0 && screen !== "jobs"
      ? [{ keys: "J", label: `${options.running} running`, essential: true }]
      : [{ keys: "J", label: "jobs" }]),
    { keys: ":", label: "actions", essential: true },
    { keys: "?", label: "help", essential: true },
    options.canGoBack
      ? { keys: "esc/q", label: "back", essential: true }
      : { keys: "q", label: "quit", essential: true },
  ];
}

function rowMenuSubject(selection: PublishedSelection): {
  subject: string;
  detail?: string;
} {
  const { queue, message } = selection;

  if (message !== null) {
    return {
      subject: message.id,
      detail: `${displayExchange(message)} ${glyphs.arrowRight} ${message.routingKey}`,
    };
  }

  if (queue !== null) {
    return {
      subject: queue.name,
      detail: `${formatCount(totalMessages(queue), "message")} in ${queue.vhost}`,
    };
  }

  return { subject: "Nothing selected" };
}

function confirmationFor(pending: PendingAction): string {
  if (pending.kind === "quit") {
    const titles = pending.running
      .slice(0, 2)
      .map((job) => job.title)
      .join(", ");
    const rest =
      pending.running.length > 2 ? `, and ${pending.running.length - 2} more` : "";

    return (
      `${formatCount(pending.running.length, "operation")} still running (${titles}${rest}). ` +
      "Quit anyway? Anything half-done is left in a backup file."
    );
  }

  if (pending.kind === "purge") {
    const total = pending.queues.reduce(
      (sum, queue) => sum + totalMessages(queue),
      0,
    );

    if (pending.queues.length === 1) {
      const only = pending.queues[0];
      return `Purge '${only?.name}' (${formatCount(total, "message")})? This cannot be undone.`;
    }

    const names = pending.queues
      .slice(0, 3)
      .map((queue) => queue.name)
      .join(", ");
    const rest =
      pending.queues.length > 3
        ? `, and ${pending.queues.length - 3} more`
        : "";

    return `Purge ${formatCount(pending.queues.length, "queue")} (${names}${rest}), ${formatCount(total, "message")}? This cannot be undone.`;
  }

  return pending.messages.length === 1
    ? `Delete this message from '${pending.queue.name}'?`
    : `Delete ${formatCount(pending.messages.length, "message")} from '${pending.queue.name}'? The rest of the queue is put back.`;
}

function AppContent({ container }: AppProps) {
  const { columns, rows } = useTerminalSize();
  const { exit } = useApp();

  const [connection, setConnection] = useState<ConnectionInfo | null>(() =>
    container.connections.getDefaultConnection(),
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [filterRequested, setFilterRequested] = useState(false);

  const listMemory = useListMemory();
  const typing = useInputCaptured();
  const stack = useScreenStack<Screen>({ name: "queues" });
  const screen = stack.current;

  const jobs = useJobs(container.jobs);
  const runningJobs = useMemo(() => jobs.filter(isJobActive), [jobs]);

  const selectionRef = useRef<{ queue: Queue | null; message: Message | null }>(
    { queue: null, message: null },
  );

  const setQueueSelection = useCallback((queue: Queue | null) => {
    selectionRef.current = { ...selectionRef.current, queue };
  }, []);

  const setMessageSelection = useCallback((message: Message | null) => {
    selectionRef.current = { ...selectionRef.current, message };
  }, []);

  const queueScopeRef = useRef<{
    queues: readonly Queue[];
    filter: string;
  }>({ queues: [], filter: "" });

  const markedRef = useRef<{
    queues: readonly Queue[];
    messages: readonly Message[];
  }>({ queues: [], messages: [] });

  const setMarkedQueues = useCallback((queues: readonly Queue[]) => {
    markedRef.current = { ...markedRef.current, queues };
  }, []);

  const setMarkedMessages = useCallback((messages: readonly Message[]) => {
    markedRef.current = { ...markedRef.current, messages };
  }, []);

  const setQueueScope = useCallback(
    (queues: readonly Queue[], filter: string) => {
      queueScopeRef.current = { queues, filter };
    },
    [],
  );

  const snapshot = useCallback(
    (kind: Overlay["kind"]): Overlay => ({
      kind,
      selection: effectiveSelection(stack.current, selectionRef.current),
      marked: markedRef.current,
    }),
    [stack],
  );

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  const requestQuit = useCallback(() => {
    const running = container.jobs.active();
    if (running.length === 0) {
      exit();
      return;
    }
    setOverlay(null);
    setPending({ kind: "quit", running });
  }, [container, exit]);
  const clearFilterRequest = useCallback(() => setFilterRequested(false), []);

  const announce = useCallback(
    (text: string, tone: Notice["tone"] = "success") => {
      setNotice({ tone, text });
    },
    [],
  );

  useEffect(() => {
    container.messages.pruneOldBackups(BACKUP_MAX_AGE_MS);

    const interrupted = container.messages.listInterruptedOperations();
    if (interrupted.length === 0) return;

    const waiting = interrupted.reduce(
      (sum, entry) => sum + entry.remaining,
      0,
    );

    announce(
      `${formatCount(interrupted.length, "operation")} did not finish and ${formatCount(waiting, "message")} ` +
        "are waiting in a backup. Press ':' then 'recover'.",
      "danger",
    );
  }, [container, announce]);

  useJobCompletions(jobs, (job) => {
    if (job.state === "failed") announce(job.error ?? "Operation failed.", "danger");
    else if (job.state === "cancelled") announce(`${job.title}: stopped.`, "danger");
    else announce(job.result ?? `${job.title}: done.`);

    refresh();
  });

  useEffect(() => {
    if (notice === null) return;

    const timer = setTimeout(
      () => setNotice(null),
      notice.tone === "danger" ? DANGER_NOTICE_MS : NOTICE_MS,
    );

    return () => clearTimeout(timer);
  }, [notice]);

  const loadQueues = useCallback(async () => {
    if (connection === null) return [];
    return container.broker.withConnection(connection, (open) =>
      container.queues.listQueues(open, null),
    );
  }, [container, connection, reloadToken]);

  const loadMessages = useCallback(
    async (queue: Queue) => {
      if (connection === null) return [];
      return container.broker.withConnection(connection, (open) =>
        container.messages.getMessages(
          queue.name,
          MESSAGE_PAGE_SIZE,
          false,
          open,
        ),
      );
    },
    [container, connection, reloadToken],
  );

  const runPending = useCallback(
    (action: PendingAction) => {
      if (action.kind === "quit") {
        setPending(null);
        container.jobs.cancelAll();
        exit();
        return;
      }

      if (connection === null) return;
      const open = connection;

      if (action.kind === "purge") {
        container.jobs.start({
          kind: "purge",
          title:
            action.queues.length === 1
              ? `Purging ${action.queues[0]?.name}`
              : `Purging ${formatCount(action.queues.length, "queue")}`,
          run: async (job) => {
            let done = 0;
            const outcomes = await mapWithConcurrency(
              action.queues,
              QUEUE_CONCURRENCY,
              async (queue) =>
                container.broker.withConnection(open, async (channel) => {
                  job.throwIfCancelled();
                  const result = await container.queues.purgeQueue(
                    queue.name,
                    channel,
                  );
                  done += 1;
                  job.report({
                    phase: "Purging",
                    done,
                    total: action.queues.length,
                  });
                  return { queue, ...result };
                }),
            );

            const failed = outcomes.filter((entry) => !entry.ok);
            if (failed.length > 0) {
              throw new Error(
                `Failed to purge ${failed.map((entry) => entry.queue.name).join(", ")}.`,
              );
            }

            const removed = outcomes.reduce(
              (sum, entry) => sum + (entry.purged ?? 0),
              0,
            );

            if (outcomes.length === 1) {
              const only = outcomes[0];
              return only?.purged == null
                ? `Purged ${only?.queue.name}.`
                : `Purged ${only.queue.name}: ${formatCount(only.purged, "message")} removed.`;
            }

            return `Purged ${formatCount(outcomes.length, "queue")}: ${formatCount(removed, "message")} removed.`;
          },
        });
      } else {
        container.jobs.start({
          kind: "delete",
          title:
            action.messages.length === 1
              ? `Deleting 1 message from ${action.queue.name}`
              : `Deleting ${formatCount(action.messages.length, "message")} from ${action.queue.name}`,
          run: async (job) =>
            container.broker.withConnection(open, async (channel) => {
              const outcome = await container.messages.removeFromQueue({
                targets: action.messages.map((message) => message.id),
                queueName: action.queue.name,
                connection: channel,
                onProgress: job.report,
              });

              if (outcome.lost > 0) {
                throw new Error(
                  `Deleted, but ${formatCount(outcome.lost, "message")} could not be put back, ` +
                    `saved under operation ${outcome.operationId}.`,
                );
              }

              if (outcome.removed === 0) {
                return action.messages.length === 1
                  ? "That message was no longer in the queue."
                  : "None of those messages were still in the queue.";
              }

              return (
                `Deleted ${formatCount(outcome.removed, "message")} from ${action.queue.name}` +
                (outcome.restored > 0
                  ? `, ${formatCount(outcome.restored, "message")} put back.`
                  : ".")
              );
            }),
        });

        stack.popUntil((entry) => entry.name !== "message");
      }

      setPending(null);
      listMemory.clearMarks();
    },
    [container, connection, exit, stack, listMemory],
  );

  const runAction = useCallback(
    (id: ActionId, from?: Overlay) => {
      const { queue: currentQueue, message: currentMessage } =
        from?.selection ?? effectiveSelection(screen, selectionRef.current);
      const marks = from?.marked ?? markedRef.current;

      const targetQueues =
        marks.queues.length > 0
          ? marks.queues
          : currentQueue === null
            ? []
            : [currentQueue];

      const targetMessages =
        marks.messages.length > 0
          ? marks.messages
          : currentMessage === null
            ? []
            : [currentMessage];

      switch (id) {
        case "queues":
          stack.reset();
          break;
        case "refresh":
          refresh();
          announce("Reloaded from the broker.");
          break;
        case "open":
          if (screen.name === "queues" && currentQueue !== null)
            stack.push({ name: "queue", queue: currentQueue });
          else if (screen.name === "queue" && currentMessage !== null) {
            stack.push({
              name: "message",
              queue: screen.queue,
              message: currentMessage,
            });
          }
          break;
        case "purge":
          if (targetQueues.length > 0)
            setPending({ kind: "purge", queues: targetQueues });
          break;
        case "consume":
          if (currentQueue !== null)
            stack.push({ name: "consume", queue: currentQueue });
          break;
        case "publish":
          stack.push(
            currentQueue === null
              ? { name: "publish" }
              : { name: "publish", queue: currentQueue },
          );
          break;
        case "export":
          if (currentQueue !== null)
            stack.push({ name: "export", queue: currentQueue });
          break;
        case "import":
          if (currentQueue !== null)
            stack.push({ name: "import", queue: currentQueue });
          break;
        case "transfer":
          stack.push(
            currentQueue === null
              ? { name: "transfer" }
              : { name: "transfer", from: currentQueue },
          );
          break;
        case "requeue-message":
          if (currentQueue !== null && targetMessages.length > 0) {
            stack.push({
              name: "move-message",
              queue: currentQueue,
              messages: targetMessages,
              mode: "move",
            });
          } else {
            announce("Select a message first.", "danger");
          }
          break;
        case "reprocess-message":
          if (currentQueue !== null && targetMessages.length > 0) {
            stack.push({
              name: "move-message",
              queue: currentQueue,
              messages: targetMessages,
              mode: "reprocess",
            });
          } else {
            announce("Select a message first.", "danger");
          }
          break;
        case "delete-message":
          if (currentQueue !== null && targetMessages.length > 0) {
            setPending({
              kind: "delete",
              queue: currentQueue,
              messages: targetMessages,
            });
          } else {
            announce("Select a message first.", "danger");
          }
          break;
        case "connections":
          stack.push({ name: "connections" });
          break;
        case "add-connection":
          stack.push({ name: "connection-form" });
          break;
        case "vhosts":
          stack.push({ name: "vhosts" });
          break;
        case "help":
          stack.push({ name: "help" });
          break;
        case "jobs":
          stack.push({ name: "jobs" });
          break;
        case "recover":
          stack.push({ name: "recovery" });
          break;
        case "search-messages": {
          const { queues: scope, filter } = queueScopeRef.current;
          if (scope.length === 0) {
            announce("No queues to search.", "danger");
            break;
          }
          stack.push({ name: "search", queues: scope, scope: filter });
          break;
        }
        case "filter":
          if (screen.name === "queues" || screen.name === "queue")
            setFilterRequested(true);
          else announce("Nothing to filter on this screen.", "danger");
          break;
        case "quit":
          requestQuit();
          break;
      }
    },
    [screen, stack, refresh, exit, announce, requestQuit],
  );

  useKeyHandler(
    (input, key) => {
      if (key.ctrl && input === "c") requestQuit();
    },
    { isActive: true },
  );

  useKeyHandler(
    (input, key) => {
      if (key.ctrl && input === "c") return;

      if (input === "J") {
        if (screen.name !== "jobs") stack.push({ name: "jobs" });
        return;
      }

      if (input === ":") {
        setOverlay(snapshot("palette"));
        return;
      }

      if (input === ".") {
        const taken = snapshot("row");
        if (
          taken.selection.queue === null &&
          taken.selection.message === null
        ) {
          announce("Nothing selected.", "danger");
          return;
        }
        setOverlay(taken);
        return;
      }

      if (input === "?") {
        if (screen.name !== "help") stack.push({ name: "help" });
        return;
      }

      if (key.escape || input === "q") {
        if (stack.canGoBack) {
          setNotice(null);
          stack.back();
        } else if (input === "q") {
          requestQuit();
        }
      }
    },
    { isActive: pending === null && overlay === null && !typing },
  );

  const subtitle = useMemo(
    () =>
      connection === null
        ? "no connection"
        : `${connection.name} ${glyphs.bullet} ${connection.vHost.name}`,
    [connection],
  );

  const interactive = pending === null && overlay === null;

  const contentHeight = Math.max(3, rows - SCREEN_CHROME_LINES - 1);
  const status =
    notice === null ? (
      <Text> </Text>
    ) : (
      <StatusMessage tone={notice.tone}>{notice.text}</StatusMessage>
    );

  if (connection === null) {
    return (
      <ScreenFrame
        title="rmq"
        subtitle="no connection configured"
        hints={[
          { keys: "⏎", label: "save" },
          { keys: "esc", label: "quit" },
        ]}
        width={columns}
        height={rows}
      >
        <ConnectionFormScreen
          connections={container.connections}
          isActive
          onCancel={exit}
          onSaved={(saved) => {
            setConnection(saved);
            announce(`Connected to ${saved.name}.`);
          }}
        />
      </ScreenFrame>
    );
  }

  const active = connection;

  const contextFor = (open: Overlay) => ({
    screen: screen.name,
    selection: open.selection,
    row:
      screen.name === "queues" ? open.selection.queue : open.selection.message,
    isAmqp: isAmqp(active),
  });

  const screenContext: ScreenContext = {
    container,
    connection: active,
    width: columns,
    height: contentHeight,
    isActive: interactive,
    loadQueues,
    loadMessages,
    announce,
    refresh,
    runAction,
    push: stack.push,
    back: stack.back,
    popUntil: stack.popUntil,
    reset: stack.reset,

    setConnection: (next: ConnectionInfo) => {
      listMemory.clear();
      queueScopeRef.current = { queues: [], filter: "" };
      setConnection(next);
    },
    switchVHost: (vhost) => {
      void container.broker
        .withConnection(active, (open) =>
          container.vhosts.setDefault(vhost.name, open),
        )
        .then(() => {
          listMemory.clear();
          queueScopeRef.current = { queues: [], filter: "" };
          setConnection({ ...active, vHost: vhost });
          announce(`Switched to vhost ${vhost.name}.`);
          stack.reset();
        })
        .catch((error: unknown) => announce(errorMessage(error), "danger"));
    },
    onQueueSelectionChange: setQueueSelection,
    onMessageSelectionChange: setMessageSelection,
    onMarkedQueuesChange: setMarkedQueues,
    onMarkedMessagesChange: setMarkedMessages,
    onQueueScopeChange: setQueueScope,
    listMemory,

    jobs,
    onRecover: (operation) => {
      container.jobs.start({
        kind: "recover",
        title: `Restoring ${formatCount(operation.remaining, "message")} into ${operation.queueName}`,
        run: (job) =>
          container.broker.withConnection(active, async (channel) => {
            const outcome = await container.messages.recoverOperation({
              operationId: operation.id,
              queueName: operation.queueName,
              connection: channel,
              onProgress: job.report,
              isCancelled: job.isCancelled,
            });

            if (outcome.failed > 0) {
              throw new Error(
                `Restored ${outcome.restored}, but ${formatCount(outcome.failed, "message")} could not be put back. The backup is kept.`,
              );
            }

            return `Restored ${formatCount(outcome.restored, "message")} into ${operation.queueName}.`;
          }),
      });

      stack.back();
    },
    onForget: (operation) => {
      container.messages.forgetOperation(operation.id);
      announce(`Discarded the backup for operation ${operation.id.slice(0, 8)}.`);
    },
    helpFrom: stack.previous?.name ?? "queues",
    filterRequested,
    onFilterOpened: clearFilterRequest,
  };

  return (
    <ScreenFrame
      title={`rmq ${glyphs.bullet} ${screenTitle(screen)}`}
      subtitle={subtitle}
      badge={
        runningJobs.length > 0 ? (
          <JobIndicator jobs={runningJobs} />
        ) : (
          <Text color={theme.muted}>
            {stack.depth > 1 ? `${stack.depth - 1} deep` : ""}
          </Text>
        )
      }
      hints={
        overlay?.kind === "palette"
          ? PALETTE_HINTS
          : overlay?.kind === "row"
            ? ROW_MENU_HINTS
            : pending !== null
              ? CONFIRM_HINTS
              : hintsFor(screen.name, {
                  typing,
                  canGoBack: stack.canGoBack,
                  running: runningJobs.length,
                })
      }
      status={status}
      width={columns}
      height={rows}
    >
      {overlay?.kind === "row" ? (
        <RowMenu
          {...rowMenuSubject(overlay.selection)}
          actions={rowActions(contextFor(overlay))}
          width={columns}
          height={contentHeight}
          onCancel={() => setOverlay(null)}
          onRun={(id) => {
            setOverlay(null);
            runAction(id as ActionId, overlay);
          }}
        />
      ) : overlay?.kind === "palette" ? (
        <CommandPalette
          actions={paletteActions(contextFor(overlay))}
          width={columns}
          height={contentHeight}
          onCancel={() => setOverlay(null)}
          onRun={(id) => {
            setOverlay(null);
            runAction(id as ActionId, overlay);
          }}
        />
      ) : pending !== null ? (
        <Box flexDirection="column">
          <Confirm
            message={confirmationFor(pending)}
            onAnswer={(confirmed) => {
              if (confirmed) void runPending(pending);
              else setPending(null);
            }}
          />
        </Box>
      ) : (
        <ErrorBoundary onQuit={exit} onRecover={stack.reset}>
          <ScreenRouter screen={screen} ctx={screenContext} />
        </ErrorBoundary>
      )}
    </ScreenFrame>
  );
}

export function App(props: AppProps) {
  return (
    <InputCaptureProvider>
      <AppContent {...props} />
    </InputCaptureProvider>
  );
}
