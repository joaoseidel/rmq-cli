import { Text } from "ink";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { portSummary } from "../../../core/domain/connection.ts";
import { displayExchange, type Message } from "../../../core/domain/message.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import type { MessageSearchHit } from "../../../core/usecase/message-operations.ts";
import { truncateAroundPattern } from "../../../core/util/glob.ts";
import { Highlight } from "./highlight.tsx";
import { Table, fitCell, type Column } from "./table.tsx";

function queueColumns(pattern: string): Column<Queue>[] {
  return [
    {
      key: "name",
      header: "Name",
      value: (queue) => queue.name,
      flex: 3,
      minWidth: 12,
      render: (queue, width) => (
        <Highlight text={fitCell(queue.name, width)} pattern={pattern} />
      ),
    },
    {
      key: "vhost",
      header: "VHost",
      value: (queue) => queue.vhost,
      flex: 1,
      minWidth: 4,
    },
    {
      key: "ready",
      header: "Ready",
      value: (queue) => String(queue.messagesReady),
      align: "right",
    },
    {
      key: "unacked",
      header: "Unacked",
      value: (queue) => String(queue.messagesUnacknowledged),
      align: "right",
    },
  ];
}

export function QueueTable({
  queues,
  allQueues,
  width,
  pattern = "",
  selectedIndex,
  isMarked,
}: {
  readonly queues: readonly Queue[];
  readonly allQueues?: readonly Queue[];
  readonly width: number;
  readonly pattern?: string;
  readonly selectedIndex?: number;
  readonly isMarked?: (row: Queue) => boolean;
}) {
  return (
    <Table
      columns={queueColumns(pattern)}
      rows={queues}
      widthRows={allQueues ?? queues}
      {...(isMarked === undefined ? {} : { isMarked })}
      maxWidth={width}
      selectedIndex={selectedIndex}
      rowKey={(queue) => `${queue.vhost}/${queue.name}`}
    />
  );
}

function messageColumns(pattern: string): Column<Message>[] {
  return [
    {
      key: "id",
      header: "ID",
      value: (message) => message.id,
      flex: 1,
      minWidth: 8,
      render: (message, width) => (
        <Highlight text={fitCell(message.id, width)} pattern={pattern} />
      ),
    },
    {
      key: "exchange",
      header: "Exchange",
      value: displayExchange,
      flex: 1,
      minWidth: 6,
    },
    {
      key: "routingKey",
      header: "Routing key",
      value: (message) => message.routingKey,
      flex: 1,
      minWidth: 6,
    },
    {
      key: "payload",
      header: "Payload",

      value: (message) => truncateAroundPattern(message.payload, pattern, 24),
      flex: 4,
      minWidth: 10,
      render: (message, width) => (
        <Highlight
          text={fitCell(
            truncateAroundPattern(message.payload, pattern, 24),
            width,
          )}
          pattern={pattern}
        />
      ),
    },
  ];
}

export function MessageTable({
  messages,
  allMessages,
  width,
  pattern = "",
  selectedIndex,
  isMarked,
}: {
  readonly messages: readonly Message[];
  readonly allMessages?: readonly Message[];
  readonly width: number;
  readonly pattern?: string;
  readonly selectedIndex?: number;
  readonly isMarked?: (row: Message) => boolean;
}) {
  return (
    <Table
      columns={messageColumns(pattern)}
      rows={messages}
      widthRows={allMessages ?? messages}
      {...(isMarked === undefined ? {} : { isMarked })}
      maxWidth={width}
      selectedIndex={selectedIndex}
      rowKey={(message) => message.id}
    />
  );
}

function searchHitColumns(pattern: string): Column<MessageSearchHit>[] {
  return [
    {
      key: "queue",
      header: "Queue",

      value: (hit) => hit.queue,
      flex: 0,
    },
    {
      key: "payload",
      header: "Payload",

      value: (hit) => truncateAroundPattern(hit.message.payload, pattern, 40),
      flex: 4,
      minWidth: 10,
      render: (hit, width) => (
        <Highlight
          text={fitCell(
            truncateAroundPattern(hit.message.payload, pattern, 40),
            width,
          )}
          pattern={pattern}
        />
      ),
    },
  ];
}

export function SearchHitTable({
  hits,
  allHits,
  width,
  pattern = "",
  selectedIndex,
}: {
  readonly hits: readonly MessageSearchHit[];
  readonly allHits?: readonly MessageSearchHit[];
  readonly width: number;
  readonly pattern?: string;
  readonly selectedIndex?: number;
}) {
  return (
    <Table
      columns={searchHitColumns(pattern)}
      rows={hits}
      widthRows={allHits ?? hits}
      maxWidth={width}
      selectedIndex={selectedIndex}
      rowKey={(hit) => `${hit.queue}/${hit.message.id}`}
    />
  );
}

function connectionColumns(): Column<ConnectionInfo>[] {
  return [
    {
      key: "name",
      header: "Name",
      value: (connection) => connection.name,
      flex: 2,
      minWidth: 8,
      render: (connection, width) => (
        <Text color={connection.isDefault ? "cyan" : undefined}>
          {fitCell(connection.name, width)}
        </Text>
      ),
    },
    {
      key: "host",
      header: "Host",
      value: (connection) => connection.host,
      flex: 2,
      minWidth: 8,
    },
    {
      key: "type",
      header: "Type",
      value: (connection) => connection.type.toUpperCase(),
    },
    { key: "ports", header: "Port", value: portSummary, flex: 1, minWidth: 8 },
    {
      key: "vhost",
      header: "VHost",
      value: (connection) => connection.vHost.name,
      flex: 1,
      minWidth: 4,
    },
    {
      key: "default",
      header: "Default",
      value: (connection) => (connection.isDefault ? "Yes" : "No"),
    },
  ];
}

export function ConnectionTable({
  connections,
  allConnections,
  width,
  selectedIndex,
}: {
  readonly connections: readonly ConnectionInfo[];
  readonly allConnections?: readonly ConnectionInfo[];
  readonly width: number;
  readonly selectedIndex?: number;
}) {
  return (
    <Table
      columns={connectionColumns()}
      rows={connections}
      widthRows={allConnections ?? connections}
      maxWidth={width}
      selectedIndex={selectedIndex}
      rowKey={(connection) => connection.id}
    />
  );
}
