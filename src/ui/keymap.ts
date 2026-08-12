import type { ActionId } from "./actions.ts";
import type { ScreenName } from "./screens.ts";

export interface KeyBinding {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly action?: ActionId;
  readonly primary?: boolean;
  readonly displayOnly?: boolean;
}

export const SCREEN_KEYS = {
  queues: [
    { key: "↑↓", label: "move", displayOnly: true },
    { key: "⏎", label: "open", displayOnly: true },
    {
      key: "/",
      label: "filter",
      description: "filter the list",
      primary: true,
    },
    {
      key: "space",
      label: "mark",
      description: "mark this row for a bulk action",
      displayOnly: true,
    },
    {
      key: "a",
      label: "mark all",
      description: "mark or unmark everything the filter leaves",
    },
    {
      key: "s",
      label: "search",
      description: "search across the filtered queues",
      action: "search-messages",
      primary: true,
    },
    {
      key: "r",
      label: "refresh",
      description: "re-read from the broker",
      action: "refresh",
      primary: true,
    },
    {
      key: "p",
      label: "purge",
      description: "purge the queue",
      action: "purge",
      primary: true,
    },
    {
      key: "t",
      label: "tail",
      description: "live tail (AMQP only)",
      action: "consume",
      primary: true,
    },
    {
      key: "e",
      label: "export",
      description: "export to JSON",
      action: "export",
    },
    {
      key: "i",
      label: "import",
      description: "import from JSON",
      action: "import",
    },
    {
      key: "w",
      label: "publish",
      description: "publish a message",
      action: "publish",
    },
    {
      key: "m",
      label: "move",
      description: "move messages out of the marked queues, or this one",
      action: "transfer",
    },
    {
      key: "R",
      label: "reprocess",
      description: "republish every message to the exchange it came from",
      action: "reprocess-queue",
    },
    {
      key: "c",
      label: "connections",
      description: "switch connection",
      action: "connections",
    },
    {
      key: "v",
      label: "vhosts",
      description: "switch virtual host",
      action: "vhosts",
    },
  ],
  queue: [
    { key: "↑↓", label: "move", displayOnly: true },
    { key: "⏎", label: "inspect", displayOnly: true },
    {
      key: "]",
      label: "more",
      description: "peek the next page of messages",
      primary: true,
    },
    {
      key: "/",
      label: "filter",
      description: "filter the list",
      primary: true,
    },
    {
      key: "space",
      label: "mark",
      description: "mark this row for a bulk action",
      displayOnly: true,
    },
    {
      key: "a",
      label: "mark all",
      description: "mark or unmark everything the filter leaves",
    },
    {
      key: "r",
      label: "refresh",
      description: "re-read from the broker",
      action: "refresh",
    },
    {
      key: "d",
      label: "delete",
      description: "delete the message",
      action: "delete-message",
      primary: true,
    },
    {
      key: "M",
      label: "move",
      description: "move it to another queue",
      action: "requeue-message",
      primary: true,
    },
    {
      key: "R",
      label: "reprocess",
      description: "republish to its exchange",
      action: "reprocess-message",
      primary: true,
    },
    {
      key: "t",
      label: "tail",
      description: "live tail (AMQP only)",
      action: "consume",
    },
    {
      key: "e",
      label: "export",
      description: "export to JSON",
      action: "export",
    },
    {
      key: "w",
      label: "publish",
      description: "publish a message",
      action: "publish",
    },
    {
      key: "p",
      label: "purge",
      description: "purge the queue",
      action: "purge",
    },
  ],
  search: [
    { key: "↑↓", label: "move", displayOnly: true },
    { key: "⏎", label: "open", displayOnly: true },
    {
      key: "/",
      label: "new search",
      description: "search for another term",
      primary: true,
    },
    {
      key: "+",
      label: "deeper",
      description: "peek further into each queue",
      primary: true,
    },
    {
      key: "-",
      label: "shallower",
      description: "peek less far into each queue",
    },
    {
      key: "r",
      label: "rerun",
      description: "run the same search again",
      primary: true,
    },
  ],
  connections: [
    {
      key: "⏎",
      label: "browse",
      description: "browse this broker",
      displayOnly: true,
    },
    {
      key: "a",
      label: "add",
      description: "add a connection",
      action: "add-connection",
      primary: true,
    },
    {
      key: "d",
      label: "default",
      description: "make this the default connection",
      primary: true,
    },
    {
      key: "x",
      label: "remove",
      description: "remove this connection",
      primary: true,
    },
  ],
  vhosts: [
    {
      key: "⏎",
      label: "switch",
      description: "browse this virtual host",
      displayOnly: true,
    },
  ],
  consume: [
    {
      key: "space",
      label: "pause",
      description: "pause and resume the tail",
      displayOnly: true,
    },
    {
      key: "x",
      label: "clear",
      description: "clear what is on screen",
      primary: true,
    },
  ],
  jobs: [
    { key: "↑↓", label: "move", displayOnly: true },
    {
      key: "x",
      label: "cancel",
      description: "stop the selected operation",
      primary: true,
    },
    {
      key: "d",
      label: "dismiss",
      description: "forget a finished operation",
      primary: true,
    },
    {
      key: "c",
      label: "clear",
      description: "forget every finished operation",
    },
  ],
  recovery: [
    { key: "↑↓", label: "move", displayOnly: true },
    { key: "⏎", label: "recover", displayOnly: true },
    {
      key: "x",
      label: "forget",
      description: "discard this backup without restoring it",
      primary: true,
    },
  ],
  message: [
    {
      key: "j/k",
      label: "scroll",
      description: "scroll the payload",
      displayOnly: true,
    },
    {
      key: "m",
      label: "metadata",
      description: "headers and properties",
      primary: true,
    },
    {
      key: "d",
      label: "delete",
      description: "delete the message",
      action: "delete-message",
      primary: true,
    },
    {
      key: "M",
      label: "move",
      description: "move it to another queue",
      action: "requeue-message",
      primary: true,
    },
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
  return (
    (SCREEN_KEYS as Partial<Record<ScreenName, readonly KeyBinding[]>>)[
      screen
    ] ?? []
  );
}

export function bindingForKey(
  screen: ScreenName,
  input: string,
): KeyBinding | undefined {
  return bindingsFor(screen).find(
    (binding) => binding.displayOnly !== true && binding.key === input,
  );
}
