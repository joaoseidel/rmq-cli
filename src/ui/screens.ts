import type { Message } from "../core/domain/message.ts";
import type { Queue } from "../core/domain/queue.ts";

/**
 * Every view the app can show, each carrying what it needs to render.
 *
 * Modelling parameters on the screen itself — rather than in shared state
 * alongside a screen name — means going back restores the previous view exactly,
 * with no ordering assumptions between the name and its data.
 */
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
      readonly message: Message;
      /** "reprocess" republishes to the original exchange instead of a queue. */
      readonly mode: "move" | "reprocess";
    }
  | { readonly name: "consume"; readonly queue: Queue }
  | { readonly name: "publish"; readonly queue?: Queue }
  | { readonly name: "transfer"; readonly from?: Queue }
  | { readonly name: "export"; readonly queue: Queue }
  | { readonly name: "import"; readonly queue: Queue }
  | { readonly name: "connections" }
  | { readonly name: "connection-form" }
  | { readonly name: "vhosts" }
  | { readonly name: "help" };

export type ScreenName = Screen["name"];

/** The row a list screen has published as highlighted. */
export interface PublishedSelection {
  readonly queue: Queue | null;
  readonly message: Message | null;
}

/**
 * What an action should act on, given where we are.
 *
 * A screen that carries a queue or message in its own parameters wins over the
 * published list selection: by the time an action runs, the list screen that
 * published it may already have unmounted. Both the palette (to decide what to
 * offer) and the action runner (to decide what to do) resolve it through here,
 * so the palette can never offer an action the runner then refuses.
 */
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
    case "move-message":
      return screen.mode === "move" ? "Move message" : "Reprocess message";
    case "consume":
      return `Consume ${screen.queue.name}`;
    case "publish":
      return "Publish";
    case "transfer":
      return "Move messages";
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
    case "help":
      return "Help";
  }
}
