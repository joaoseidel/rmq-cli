import type { PaletteAction } from "./components/parts/command-palette.tsx";
import type { PublishedSelection, Screen } from "./screens.ts";

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
  "jobs",
  "help",
  "quit",
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

type Requirement = "row" | "queue" | "message";

const EVERYWHERE: readonly Screen["name"][] = [
  "queues",
  "queue",
  "message",
  "search",
  "consume",
  "publish",
  "transfer",
  "export",
  "import",
  "move-message",
  "connections",
  "connection-form",
  "vhosts",
  "jobs",
  "help",
];

const EVERYWHERE_BUT_QUEUES = EVERYWHERE.filter((name) => name !== "queues");

interface ActionSpec {
  readonly label: string;
  readonly hint: string;
  readonly from: readonly Screen["name"][];
  readonly needs?: Requirement;
  readonly needsAmqp?: boolean;
}

const SPECS: Record<ActionId, ActionSpec> = {
  queues: {
    label: "Go to queues",
    hint: "back to the queue list",
    from: EVERYWHERE_BUT_QUEUES,
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
    from: EVERYWHERE.filter((name) => name !== "connections"),
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
  jobs: {
    label: "Background jobs",
    hint: "watch, cancel, or clear running operations",
    from: EVERYWHERE.filter((name) => name !== "jobs"),
  },
  help: {
    label: "Help",
    hint: "key reference",
    from: EVERYWHERE.filter((name) => name !== "help"),
  },
  quit: {
    label: "Quit",
    hint: "leave rmq",
    from: EVERYWHERE,
  },
};

export interface ActionContext {
  readonly screen: Screen["name"];
  readonly selection: PublishedSelection;
  readonly row: unknown;
  readonly isAmqp: boolean;
}

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

export function rowActions(context: ActionContext): PaletteAction[] {
  const subject: Requirement =
    context.selection.message === null ? "queue" : "message";

  return paletteActions(context).filter((action) => {
    const needs = SPECS[action.id as ActionId].needs;
    return needs === subject || needs === "row";
  });
}

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
