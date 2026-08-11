import { Box, Text, useApp } from "ink";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Container } from "../../container.ts";
import { isAmqp, type ConnectionInfo } from "../../core/domain/connection.ts";
import type { Message } from "../../core/domain/message.ts";
import type { Queue } from "../../core/domain/queue.ts";
import { totalMessages } from "../../core/domain/queue.ts";
import { errorMessage, formatCount } from "../../core/util/text.ts";
import { paletteActions, type ActionId } from "../actions.ts";
import {
  InputCaptureProvider,
  useInputCaptured,
} from "../hooks/use-input-capture.tsx";
import { useKeyHandler } from "../hooks/use-key-handler.ts";
import { useScreenStack } from "../hooks/use-screen-stack.ts";
import { useTerminalSize } from "../hooks/use-terminal-size.ts";
import { bindingsFor } from "../keymap.ts";
import { effectiveSelection, screenTitle, type Screen } from "../screens.ts";
import { glyphs, theme } from "../theme.ts";
import { Confirm } from "./common/confirm.tsx";
import { CommandPalette } from "./parts/command-palette.tsx";
import type { KeyHint } from "./parts/key-hints.tsx";
import { SCREEN_CHROME_LINES, ScreenFrame } from "./parts/screen-frame.tsx";
import { StatusMessage } from "./parts/status-message.tsx";
import { ScreenRouter, type ScreenContext } from "./screen-router.tsx";
import { ConnectionFormScreen } from "./screens/connection-form-screen.tsx";

/** Messages fetched per queue in the browser. Enough to explore, bounded. */
const MESSAGE_PAGE_SIZE = 200;

/** A destructive action awaiting confirmation. */
type PendingAction =
  | { readonly kind: "purge"; readonly queue: Queue }
  | {
      readonly kind: "delete";
      readonly queue: Queue;
      readonly message: Message;
    };

interface Notice {
  readonly tone: "success" | "danger";
  readonly text: string;
}

export interface AppProps {
  readonly container: Container;
}

const BASE_HINTS: KeyHint[] = [
  { keys: ":", label: "actions" },
  { keys: "?", label: "help" },
  { keys: "esc", label: "back" },
  { keys: "q", label: "quit" },
];

const PALETTE_HINTS: KeyHint[] = [
  { keys: "↑↓", label: "move" },
  { keys: "⏎", label: "run" },
  { keys: "type", label: "filter actions" },
  { keys: "esc", label: "close" },
];

const CONFIRM_HINTS: KeyHint[] = [
  { keys: "y", label: "confirm" },
  { keys: "n", label: "cancel" },
  { keys: "esc", label: "cancel" },
];

/** Footer legend, derived from the one table that also drives key dispatch. */
function hintsFor(screen: Screen["name"]): KeyHint[] {
  const screenHints = bindingsFor(screen)
    .filter(
      (binding) => binding.displayOnly === true || binding.primary === true,
    )
    .map((binding) => ({ keys: binding.key, label: binding.label }));

  return [...screenHints, ...BASE_HINTS];
}

/**
 * Root of the application.
 *
 * Owns the state that outlives any single screen: the navigation stack, the
 * active connection, the pending destructive action, and the last status
 * message. Confirmation lives here rather than in the screen that raised it, so
 * there is exactly one place in the app that can destroy data.
 *
 * Screens open short-lived broker connections per fetch instead of holding one
 * open. A browser can sit idle for a long time and a parked AMQP channel would
 * be dropped by the broker's heartbeat; the live tail is the deliberate
 * exception and manages its own.
 */
function AppContent({ container }: AppProps) {
  const { columns, rows } = useTerminalSize();
  const { exit } = useApp();

  const [connection, setConnection] = useState<ConnectionInfo | null>(() =>
    container.connections.getDefaultConnection(),
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Set by the palette's Filter action and cleared by whichever list screen
  // picks it up. Not a counter: the palette unmounts the screen underneath it,
  // so the screen cannot remember a previous value to compare against.
  const [filterRequested, setFilterRequested] = useState(false);

  const typing = useInputCaptured();
  const stack = useScreenStack<Screen>({ name: "queues" });
  const screen = stack.current;

  // Screens report their current selection so the palette and shortcuts can act
  // on it without the app duplicating each screen's list state. A ref, not
  // state: the selection changes on every cursor move and re-rendering the whole
  // app for that would make scrolling visibly slow.
  const selectionRef = useRef<{ queue: Queue | null; message: Message | null }>(
    { queue: null, message: null },
  );

  const setQueueSelection = useCallback((queue: Queue | null) => {
    selectionRef.current = { ...selectionRef.current, queue };
  }, []);

  const setMessageSelection = useCallback((message: Message | null) => {
    selectionRef.current = { ...selectionRef.current, message };
  }, []);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);
  const clearFilterRequest = useCallback(() => setFilterRequested(false), []);

  const announce = useCallback(
    (text: string, tone: Notice["tone"] = "success") => {
      setNotice({ tone, text });
    },
    [],
  );

  const loadQueues = useCallback(async () => {
    if (connection === null) return [];
    return container.broker.withConnection(connection, (open) =>
      container.queues.listQueues(open, null),
    );
    // reloadToken re-runs the fetch without changing the connection identity.
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
    async (action: PendingAction) => {
      if (connection === null) return;

      try {
        if (action.kind === "purge") {
          const { ok, purged } = await container.broker.withConnection(
            connection,
            (open) => container.queues.purgeQueue(action.queue.name, open),
          );

          if (!ok) announce(`Failed to purge ${action.queue.name}.`, "danger");
          else if (purged === null) announce(`Purged ${action.queue.name}.`);
          else
            announce(
              `Purged ${action.queue.name} — ${formatCount(purged, "message")} removed.`,
            );
        } else {
          const outcome = await container.broker.withConnection(
            connection,
            (open) =>
              container.messages.safeDeleteMessage({
                id: action.message.id,
                queueName: action.queue.name,
                connection: open,
              }),
          );

          // The count of restored bystanders is worth showing: it is the
          // evidence that the drain-and-restore put the queue back.
          if (outcome.lost > 0) {
            announce(
              `Deleted, but ${formatCount(outcome.lost, "message")} could not be put back — ` +
                `saved under operation ${outcome.operationId}.`,
              "danger",
            );
          } else if (outcome.removed === 0) {
            announce("That message was no longer in the queue.", "danger");
          } else {
            announce(
              `Deleted 1 message from ${action.queue.name}` +
                (outcome.restored > 0
                  ? `, ${formatCount(outcome.restored, "message")} left untouched.`
                  : "."),
            );
          }
        }
      } catch (error) {
        announce(errorMessage(error), "danger");
      } finally {
        setPending(null);
        refresh();
      }
    },
    [container, connection, announce, refresh],
  );

  /** Executes a palette entry or its keyboard equivalent. */
  const runAction = useCallback(
    (id: ActionId) => {
      const { queue: currentQueue, message: currentMessage } =
        effectiveSelection(screen, selectionRef.current);
      const { queue, message } = selectionRef.current;

      switch (id) {
        case "queues":
          stack.reset();
          break;
        case "refresh":
          refresh();
          announce("Reloaded from the broker.");
          break;
        case "open":
          if (screen.name === "queues" && queue !== null)
            stack.push({ name: "queue", queue });
          else if (screen.name === "queue" && message !== null) {
            stack.push({ name: "message", queue: screen.queue, message });
          }
          break;
        case "purge":
          if (currentQueue !== null)
            setPending({ kind: "purge", queue: currentQueue });
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
          if (currentQueue !== null && currentMessage !== null) {
            stack.push({
              name: "move-message",
              queue: currentQueue,
              message: currentMessage,
              mode: "move",
            });
          } else {
            announce("Select a message first.", "danger");
          }
          break;
        case "reprocess-message":
          if (currentQueue !== null && currentMessage !== null) {
            stack.push({
              name: "move-message",
              queue: currentQueue,
              message: currentMessage,
              mode: "reprocess",
            });
          } else {
            announce("Select a message first.", "danger");
          }
          break;
        case "delete-message":
          if (currentQueue !== null && currentMessage !== null) {
            setPending({
              kind: "delete",
              queue: currentQueue,
              message: currentMessage,
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
        case "filter":
          // The list screens own their filter field; bump a token they watch.
          if (screen.name === "queues" || screen.name === "queue")
            setFilterRequested(true);
          else announce("Nothing to filter on this screen.", "danger");
          break;
        case "quit":
          exit();
          break;
      }
    },
    [screen, stack, refresh, exit, announce],
  );

  // Global keys stand down while a prompt is open, the palette is showing, or a
  // text field owns the keyboard — otherwise typing a 'q' would quit mid-word.
  useKeyHandler(
    (input, key) => {
      if (key.ctrl && input === "c") {
        exit();
        return;
      }

      if (input === ":") {
        setPaletteOpen(true);
        return;
      }

      if (input === "?") {
        stack.push({ name: "help" });
        return;
      }

      if (key.escape || input === "q") {
        if (stack.canGoBack) {
          setNotice(null);
          stack.back();
        } else if (input === "q") {
          exit();
        }
      }
    },
    { isActive: pending === null && !paletteOpen && !typing },
  );

  const subtitle = useMemo(
    () =>
      connection === null
        ? "no connection"
        : `${connection.name} ${glyphs.bullet} ${connection.vHost.name}`,
    [connection],
  );

  const interactive = pending === null && !paletteOpen;
  const contentHeight = Math.max(
    3,
    rows - SCREEN_CHROME_LINES - (notice === null ? 0 : 1),
  );
  const status =
    notice === null ? undefined : (
      <StatusMessage tone={notice.tone}>{notice.text}</StatusMessage>
    );

  // Nothing else is reachable without a broker, so a first run opens straight on
  // the connection form rather than an empty queue list.
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
    reset: stack.reset,
    setConnection,
    switchVHost: (vhost) => {
      // Persisted through the store so the choice survives a restart.
      void container.broker
        .withConnection(active, (open) =>
          container.vhosts.setDefault(vhost.name, open),
        )
        .then(() => {
          setConnection({ ...active, vHost: vhost });
          announce(`Switched to vhost ${vhost.name}.`);
          stack.reset();
        })
        .catch((error: unknown) => announce(errorMessage(error), "danger"));
    },
    onQueueSelectionChange: setQueueSelection,
    onMessageSelectionChange: setMessageSelection,
    filterRequested,
    onFilterOpened: clearFilterRequest,
  };

  return (
    <ScreenFrame
      title={`rmq ${glyphs.bullet} ${screenTitle(screen)}`}
      subtitle={subtitle}
      badge={
        <Text color={theme.muted}>
          {stack.depth > 1 ? `${stack.depth - 1} deep` : ""}
        </Text>
      }
      hints={
        paletteOpen
          ? PALETTE_HINTS
          : pending !== null
            ? CONFIRM_HINTS
            : hintsFor(screen.name)
      }
      status={status}
      width={columns}
      height={rows}
    >
      {paletteOpen ? (
        <CommandPalette
          actions={paletteActions({
            screen: screen.name,
            selection: effectiveSelection(screen, selectionRef.current),
            row:
              screen.name === "queues"
                ? selectionRef.current.queue
                : selectionRef.current.message,
            isAmqp: isAmqp(active),
          })}
          width={columns}
          height={contentHeight}
          onCancel={() => setPaletteOpen(false)}
          onRun={(id) => {
            setPaletteOpen(false);
            runAction(id as ActionId);
          }}
        />
      ) : pending !== null ? (
        <Box flexDirection="column">
          <Confirm
            message={
              pending.kind === "purge"
                ? `Purge '${pending.queue.name}' (${formatCount(totalMessages(pending.queue), "message")})? This cannot be undone.`
                : `Delete this message from '${pending.queue.name}'?`
            }
            onAnswer={(confirmed) => {
              if (confirmed) void runPending(pending);
              else setPending(null);
            }}
          />
        </Box>
      ) : (
        <ScreenRouter screen={screen} ctx={screenContext} />
      )}
    </ScreenFrame>
  );
}

/** Wraps the app in the input-capture provider it reads from. */
export function App(props: AppProps) {
  return (
    <InputCaptureProvider>
      <AppContent {...props} />
    </InputCaptureProvider>
  );
}
