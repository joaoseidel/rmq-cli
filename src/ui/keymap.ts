import type { ActionId } from "./actions.ts";
import type { ScreenName } from "./screens.ts";

/**
 * One key a screen responds to.
 *
 * Bindings carrying an `action` are dispatched by {@link useScreenKeys}; those
 * without one are handled by the screen itself and are listed here anyway, so
 * the footer and the help screen cannot describe a key the screen does not
 * actually bind.
 */
export interface KeyBinding {
  /** The literal character `useInput` reports, or a glyph for display-only rows. */
  readonly key: string;
  /** Short footer text. */
  readonly label: string;
  /** Help-screen text. Falls back to `label`. */
  readonly description?: string;
  /** Dispatched on press. Absent when the screen handles the key locally. */
  readonly action?: ActionId;
  /** Shown in the footer's condensed hint list. */
  readonly primary?: boolean;
  /** Never matched against input — cursor keys documented for the help screen. */
  readonly displayOnly?: boolean;
}

/**
 * Every key each screen binds.
 *
 * This is the single source of truth for three things that used to be written
 * out separately and had already drifted apart: the per-screen key dispatch, the
 * footer hints, and the help screen. Adding a key here wires it everywhere.
 */
export const SCREEN_KEYS = {
  queues: [
    { key: "↑↓", label: "move", displayOnly: true },
    { key: "⏎", label: "open", displayOnly: true },
    { key: "/", label: "filter", description: "filter the list", primary: true },
    {
      key: "s",
      label: "search",
      description: "search messages across the filtered queues",
      action: "search-messages",
      primary: true,
    },
    { key: "r", label: "refresh", description: "re-read from the broker", action: "refresh", primary: true },
    { key: "p", label: "purge", description: "purge the queue", action: "purge", primary: true },
    { key: "t", label: "tail", description: "live tail (AMQP only)", action: "consume", primary: true },
    { key: "e", label: "export", description: "export to JSON", action: "export" },
    { key: "i", label: "import", description: "import from JSON", action: "import" },
    { key: "w", label: "publish", description: "publish a message", action: "publish" },
    { key: "m", label: "move", description: "move messages between queues", action: "transfer" },
    { key: "c", label: "connections", description: "switch connection", action: "connections" },
    { key: "v", label: "vhosts", description: "switch virtual host", action: "vhosts" },
  ],
  queue: [
    { key: "↑↓", label: "move", displayOnly: true },
    { key: "⏎", label: "inspect", displayOnly: true },
    { key: "/", label: "filter", description: "filter the list", primary: true },
    { key: "r", label: "refresh", description: "re-read from the broker", action: "refresh" },
    { key: "d", label: "delete", description: "delete the message", action: "delete-message", primary: true },
    { key: "M", label: "move", description: "move it to another queue", action: "requeue-message", primary: true },
    {
      key: "R",
      label: "reprocess",
      description: "republish to its exchange",
      action: "reprocess-message",
      primary: true,
    },
    { key: "t", label: "tail", description: "live tail (AMQP only)", action: "consume" },
    { key: "e", label: "export", description: "export to JSON", action: "export" },
    { key: "w", label: "publish", description: "publish a message", action: "publish" },
    { key: "p", label: "purge", description: "purge the queue", action: "purge" },
  ],
  search: [
    { key: "↑↓", label: "move", displayOnly: true },
    { key: "⏎", label: "open", displayOnly: true },
    { key: "/", label: "new search", description: "search for another term", primary: true },
    { key: "+", label: "deeper", description: "peek further into each queue", primary: true },
    { key: "-", label: "shallower", description: "peek less far into each queue" },
    { key: "r", label: "rerun", description: "run the same search again", primary: true },
  ],
  message: [
    { key: "j/k", label: "scroll", description: "scroll the payload", displayOnly: true },
    { key: "m", label: "metadata", description: "headers and properties", primary: true },
    { key: "d", label: "delete", description: "delete the message", action: "delete-message", primary: true },
    { key: "M", label: "move", description: "move it to another queue", action: "requeue-message", primary: true },
    {
      key: "R",
      label: "reprocess",
      description: "republish to its exchange",
      action: "reprocess-message",
      primary: true,
    },
  ],
} as const satisfies Partial<Record<ScreenName, readonly KeyBinding[]>>;

export function bindingsFor(screen: ScreenName): readonly KeyBinding[] {
  return (SCREEN_KEYS as Partial<Record<ScreenName, readonly KeyBinding[]>>)[screen] ?? [];
}

/** The binding a keystroke triggers on a screen, if any. */
export function bindingForKey(screen: ScreenName, input: string): KeyBinding | undefined {
  return bindingsFor(screen).find((binding) => binding.displayOnly !== true && binding.key === input);
}
