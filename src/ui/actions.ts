import type { PaletteAction } from "./components/parts/command-palette.tsx";
import type { PublishedSelection, Screen } from "./screens.ts";

/** Every action the palette can offer, keyed by id. */
export const ACTION_IDS = [
  "queues",
  "refresh",
  "filter",
  "search-messages",
  "open",
  "purge",
  "consume",
  "publish",
  "export",
  "import",
  "transfer",
  "delete-message",
  "requeue-message",
  "reprocess-message",
  "connections",
  "add-connection",
  "vhosts",
  "help",
  "quit",
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

/**
 * What an action must have before it can run.
 *
 * `row` is the highlighted entry of whatever list is on screen; `queue` and
 * `message` are the resolved subjects, which a screen may carry in its own
 * parameters even after the list that published them has unmounted.
 */
type Requirement = "row" | "queue" | "message";

interface ActionSpec {
  readonly label: string;
  readonly hint: string;
  /** Screens the action can be invoked from. */
  readonly from: readonly Screen["name"][];
  /** What must be selected for the action to be runnable. */
  readonly needs?: Requirement;
  /** Requires an AMQP connection. */
  readonly needsAmqp?: boolean;
}

const SPECS: Record<ActionId, ActionSpec> = {
  queues: {
    label: "Go to queues",
    hint: "back to the queue list",
    from: ["queue", "message", "search", "connections", "vhosts", "help"],
  },
  refresh: {
    label: "Refresh",
    hint: "re-read from the broker",
    from: ["queues", "queue"],
  },
  filter: {
    label: "Filter",
    hint: "narrow the list by name or payload",
    from: ["queues", "queue"],
  },
  "search-messages": {
    label: "Search messages",
    hint: "find a payload across every queue the filter leaves",
    from: ["queues"],
  },
  open: {
    label: "Open",
    hint: "inspect the selected row",
    from: ["queues", "queue"],
    needs: "row",
  },
  purge: {
    label: "Purge queue",
    hint: "delete every message in it",
    from: ["queues", "queue"],
    needs: "queue",
  },
  consume: {
    label: "Consume (live tail)",
    hint: "watch messages arrive in real time",
    from: ["queues", "queue"],
    needs: "queue",
    needsAmqp: true,
  },
  publish: {
    label: "Publish message",
    hint: "send a message to a queue or exchange",
    from: ["queues", "queue"],
  },
  export: {
    label: "Export to file",
    hint: "write messages to JSON",
    from: ["queues", "queue"],
    needs: "queue",
  },
  import: {
    label: "Import from file",
    hint: "publish messages from JSON",
    from: ["queues", "queue"],
    needs: "queue",
  },
  transfer: {
    label: "Move messages",
    hint: "requeue from one queue to another",
    from: ["queues", "queue"],
  },
  "delete-message": {
    label: "Delete message",
    hint: "remove it, putting the rest of the queue back",
    from: ["queue", "message"],
    needs: "message",
  },
  "requeue-message": {
    label: "Move this message",
    hint: "send it to another queue",
    from: ["queue", "message"],
    needs: "message",
  },
  "reprocess-message": {
    label: "Reprocess message",
    hint: "republish to its original exchange",
    from: ["queue", "message"],
    needs: "message",
  },
  connections: {
    label: "Connections",
    hint: "switch, add, or remove brokers",
    from: ["queues", "queue", "message", "search", "vhosts", "help"],
  },
  "add-connection": {
    label: "Add connection",
    hint: "configure a new broker",
    from: ["queues", "connections"],
  },
  vhosts: {
    label: "Virtual hosts",
    hint: "switch the active vhost",
    from: ["queues", "connections"],
  },
  help: {
    label: "Help",
    hint: "key reference",
    from: ["queues", "queue", "message", "search", "connections", "vhosts"],
  },
  quit: {
    label: "Quit",
    hint: "leave rmq",
    from: [
      "queues",
      "queue",
      "message",
      "search",
      "connections",
      "vhosts",
      "help",
    ],
  },
};

export interface ActionContext {
  readonly screen: Screen["name"];
  /** The subjects an action would act on, resolved for the current screen. */
  readonly selection: PublishedSelection;
  /** The highlighted entry of the list on screen, if any. */
  readonly row: unknown;
  readonly isAmqp: boolean;
}

/** The reason an action cannot run right now, or undefined when it can. */
function blockedBecause(
  spec: ActionSpec,
  context: ActionContext,
): string | undefined {
  if (spec.needs === "row" && context.row === null) return "nothing selected";
  if (spec.needs === "queue" && context.selection.queue === null)
    return "no queue selected";
  if (spec.needs === "message" && context.selection.message === null)
    return "no message selected";
  if (spec.needsAmqp === true && !context.isAmqp)
    return "needs an AMQP connection";
  return undefined;
}

/**
 * Builds the palette listing for the current context.
 *
 * Actions that do not apply here are omitted; actions that apply but cannot run
 * right now are listed with the reason, so a greyed-out "Consume" tells the user
 * their connection is HTTP rather than leaving them to wonder where the feature
 * went.
 */
export function paletteActions(context: ActionContext): PaletteAction[] {
  const actions: PaletteAction[] = [];

  for (const id of ACTION_IDS) {
    const spec = SPECS[id];
    if (!spec.from.includes(context.screen)) continue;

    const unavailable = blockedBecause(spec, context);
    actions.push({
      id,
      label: spec.label,
      hint: spec.hint,
      ...(unavailable === undefined ? {} : { unavailable }),
    });
  }

  return actions;
}
