import type { Container } from "../../container.ts";
import type { ConnectionInfo } from "../../core/domain/connection.ts";
import type { Message } from "../../core/domain/message.ts";
import type { Queue } from "../../core/domain/queue.ts";
import type { VHost } from "../../core/domain/vhost.ts";
import type { ActionId } from "../actions.ts";
import type { InterruptedOperation } from "../../core/domain/operation.ts";
import type { Job } from "../../core/usecase/jobs.ts";
import type { ListMemory } from "../hooks/use-list-memory.ts";
import type { Screen, ScreenName } from "../screens.ts";
import { ConnectionFormScreen } from "./screens/connection-form-screen.tsx";
import { ConnectionsScreen } from "./screens/connections-screen.tsx";
import { ConsumeScreen } from "./screens/consume-screen.tsx";
import { HelpScreen } from "./screens/help-screen.tsx";
import { JobsScreen } from "./screens/jobs-screen.tsx";
import { MessageScreen } from "./screens/message-screen.tsx";
import { MoveMessageScreen } from "./screens/move-message-screen.tsx";
import { PublishScreen } from "./screens/publish-screen.tsx";
import { QueueScreen } from "./screens/queue-screen.tsx";
import { QueuesScreen } from "./screens/queues-screen.tsx";
import { RecoveryScreen } from "./screens/recovery-screen.tsx";
import { SearchScreen } from "./screens/search-screen.tsx";
import { TransferFileScreen } from "./screens/transfer-file-screen.tsx";
import { TransferScreen } from "./screens/transfer-screen.tsx";
import { VHostsScreen } from "./screens/vhosts-screen.tsx";

export type Tone = "success" | "danger";

export interface ScreenContext {
  readonly container: Container;
  readonly connection: ConnectionInfo;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
  readonly loadQueues: () => Promise<Queue[]>;
  readonly messagePageSize: number;
  readonly reloadToken: number;
  readonly announce: (text: string, tone?: Tone) => void;
  readonly refresh: () => void;
  readonly runAction: (id: ActionId) => void;
  readonly push: (screen: Screen) => void;
  readonly back: () => void;
  readonly popUntil: (keep: (screen: Screen) => boolean) => void;
  readonly reset: () => void;
  readonly setConnection: (connection: ConnectionInfo) => void;
  readonly switchVHost: (vhost: VHost) => void;
  readonly onQueueSelectionChange: (queue: Queue | null) => void;
  readonly onMessageSelectionChange: (message: Message | null) => void;
  readonly onMarkedQueuesChange: (queues: readonly Queue[]) => void;
  readonly onMarkedMessagesChange: (messages: readonly Message[]) => void;
  readonly onQueueScopeChange: (
    queues: readonly Queue[],
    filter: string,
  ) => void;
  readonly listMemory: ListMemory;
  readonly jobs: readonly Job[];
  readonly scope: { readonly connectionId: string; readonly vhost: string };
  readonly onRecover: (operation: InterruptedOperation) => void;
  readonly onForget: (operation: InterruptedOperation) => void;
  readonly helpFrom: ScreenName;
  readonly filterRequested: boolean;
  readonly onFilterOpened: () => void;
}

export function ScreenRouter({
  screen,
  ctx,
}: {
  readonly screen: Screen;
  readonly ctx: ScreenContext;
}) {
  switch (screen.name) {
    case "queues":
      return (
        <QueuesScreen
          loadQueues={ctx.loadQueues}
          openFilter={ctx.filterRequested}
          onFilterOpened={ctx.onFilterOpened}
          onSelectionChange={ctx.onQueueSelectionChange}
          onScopeChange={ctx.onQueueScopeChange}
          onMarkedChange={ctx.onMarkedQueuesChange}
          memory={ctx.listMemory}
          onOpen={(queue) => ctx.push({ name: "queue", queue })}
          onAction={ctx.runAction}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
        />
      );

    case "queue":
      return (
        <QueueScreen
          queue={screen.queue}
          operations={ctx.container.messages}
          connection={ctx.connection}
          pageSize={ctx.messagePageSize}
          reloadToken={ctx.reloadToken}
          openFilter={ctx.filterRequested}
          onFilterOpened={ctx.onFilterOpened}
          onSelectionChange={ctx.onMessageSelectionChange}
          onMarkedChange={ctx.onMarkedMessagesChange}
          memory={ctx.listMemory}
          onOpen={(message) =>
            ctx.push({ name: "message", queue: screen.queue, message })
          }
          onAction={ctx.runAction}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
        />
      );

    case "search":
      return (
        <SearchScreen
          messages={ctx.container.messages}
          connection={ctx.connection}
          queues={screen.queues}
          scope={screen.scope}
          onOpen={(queue, message) =>
            ctx.push({ name: "message", queue, message })
          }
          onAction={ctx.runAction}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
        />
      );

    case "message":
      return (
        <MessageScreen
          message={screen.message}
          onAction={ctx.runAction}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
        />
      );

    case "move-message":
      return (
        <MoveMessageScreen
          mode={screen.mode}
          broker={ctx.container.broker}
          operations={ctx.container.messages}
          jobs={ctx.container.jobs}
          connection={ctx.connection}
          queue={screen.queue}
          messages={screen.messages}
          isActive={ctx.isActive}
          onCancel={ctx.back}
          onDone={(text, tone) => {
            ctx.announce(text, tone);
            ctx.refresh();

            ctx.popUntil(
              (open) => open.name !== "move-message" && open.name !== "message",
            );
          }}
        />
      );

    case "consume":
      return (
        <ConsumeScreen
          broker={ctx.container.broker}
          queues={ctx.container.queues}
          connection={ctx.connection}
          queue={screen.queue}
          acknowledge={false}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
        />
      );

    case "publish":
      return (
        <PublishScreen
          broker={ctx.container.broker}
          messages={ctx.container.messages}
          connection={ctx.connection}
          {...(screen.queue === undefined
            ? {}
            : { queueName: screen.queue.name })}
          isActive={ctx.isActive}
          onCancel={ctx.back}
          onDone={(text) => {
            ctx.announce(text);
            ctx.back();
          }}
        />
      );

    case "transfer":
      return (
        <TransferScreen
          broker={ctx.container.broker}
          queues={ctx.container.queues}
          jobs={ctx.container.jobs}
          connection={ctx.connection}
          {...(screen.from === undefined
            ? {}
            : { fromQueue: screen.from.name })}
          isActive={ctx.isActive}
          onCancel={ctx.back}
          onDone={(text) => {
            ctx.announce(text);
            ctx.refresh();
            ctx.back();
          }}
        />
      );

    case "export":
    case "import":
      return (
        <TransferFileScreen
          mode={screen.name}
          broker={ctx.container.broker}
          messages={ctx.container.messages}
          connection={ctx.connection}
          queue={screen.queue}
          isActive={ctx.isActive}
          onCancel={ctx.back}
          onDone={(text) => {
            ctx.announce(text);
            ctx.refresh();
            ctx.back();
          }}
        />
      );

    case "connections":
      return (
        <ConnectionsScreen
          connections={ctx.container.connections}
          activeId={ctx.connection.id}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
          onAdd={() => ctx.push({ name: "connection-form" })}
          onChanged={ctx.announce}
          onUse={(selected) => {
            ctx.setConnection(selected);
            ctx.announce(`Browsing ${selected.name}.`);
            ctx.reset();
          }}
        />
      );

    case "connection-form":
      return (
        <ConnectionFormScreen
          connections={ctx.container.connections}
          isActive={ctx.isActive}
          onCancel={ctx.back}
          onSaved={(saved) => {
            ctx.setConnection(saved);
            ctx.announce(`Added ${saved.name}.`);
            ctx.reset();
          }}
        />
      );

    case "vhosts":
      return (
        <VHostsScreen
          broker={ctx.container.broker}
          vhosts={ctx.container.vhosts}
          connection={ctx.connection}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
          onCancel={ctx.back}
          onSelect={ctx.switchVHost}
        />
      );

    case "jobs":
      return (
        <JobsScreen
          jobs={ctx.jobs}
          onCancel={(id) => ctx.container.jobs.cancel(id)}
          onDismiss={(id) => ctx.container.jobs.dismiss(id)}
          onClear={() => ctx.container.jobs.dismissFinished()}
          width={ctx.width}
          height={ctx.height}
          isActive={ctx.isActive}
        />
      );

    case "recovery":
      return (
        <RecoveryScreen
          operations={ctx.container.messages}
          scope={ctx.scope}
          onRecover={ctx.onRecover}
          onForget={ctx.onForget}
          height={ctx.height}
          isActive={ctx.isActive}
        />
      );

    case "help":
      return (
        <HelpScreen from={ctx.helpFrom} width={ctx.width} height={ctx.height} />
      );
  }
}
