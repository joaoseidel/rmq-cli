import type { Message } from "../core/domain/message.ts";
import type { Queue } from "../core/domain/queue.ts";

export type Screen =
  | { readonly name: "queues" }
  | { readonly name: "queue"; readonly queue: Queue }
  | {
      readonly name: "message";
      readonly queue: Queue;
      readonly message: Message;
    }
  | {
      readonly name: "move-message";
      readonly queue: Queue;
      readonly messages: readonly Message[];
      readonly mode: "move" | "reprocess";
    }
  | {
      readonly name: "search";
      readonly queues: readonly Queue[];
      readonly scope: string;
    }
  | { readonly name: "consume"; readonly queue: Queue }
  | { readonly name: "publish"; readonly queue?: Queue }
  | { readonly name: "transfer"; readonly sources?: readonly Queue[] }
  | { readonly name: "export"; readonly queue: Queue }
  | { readonly name: "import"; readonly queue: Queue }
  | { readonly name: "connections" }
  | { readonly name: "connection-form" }
  | { readonly name: "vhosts" }
  | { readonly name: "jobs" }
  | { readonly name: "recovery" }
  | { readonly name: "help" };

export type ScreenName = Screen["name"];

export interface PublishedSelection {
  readonly queue: Queue | null;
  readonly message: Message | null;
}

export function effectiveSelection(
  screen: Screen,
  published: PublishedSelection,
): PublishedSelection {
  return {
    queue:
      "queue" in screen ? (screen.queue ?? published.queue) : published.queue,
    message: screen.name === "message" ? screen.message : published.message,
  };
}

export function screenTitle(screen: Screen): string {
  switch (screen.name) {
    case "queues":
      return "Queues";
    case "queue":
      return screen.queue.name;
    case "message":
      return "Message";
    case "move-message": {
      const what =
        screen.messages.length === 1
          ? "message"
          : `${screen.messages.length} messages`;
      return screen.mode === "move" ? `Move ${what}` : `Reprocess ${what}`;
    }
    case "search":
      return `Search ${screen.queues.length === 1 ? "1 queue" : `${screen.queues.length} queues`}`;
    case "consume":
      return `Consume ${screen.queue.name}`;
    case "publish":
      return "Publish";
    case "transfer": {
      const sources = screen.sources ?? [];
      return sources.length > 1
        ? `Move ${sources.length} queues`
        : "Move messages";
    }
    case "export":
      return `Export ${screen.queue.name}`;
    case "import":
      return `Import into ${screen.queue.name}`;
    case "connections":
      return "Connections";
    case "connection-form":
      return "Add connection";
    case "vhosts":
      return "Virtual hosts";
    case "jobs":
      return "Background jobs";
    case "recovery":
      return "Recover interrupted work";
    case "help":
      return "Help";
  }
}
