import { Box, Text } from "ink";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import type { Message } from "../../../core/domain/message.ts";
import { totalMessages, type Queue } from "../../../core/domain/queue.ts";
import type { MessageOperations } from "../../../core/usecase/message-operations.ts";
import { searchableText } from "../../../core/usecase/message-query.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import type { ActionId } from "../../actions.ts";
import { useFilterableList } from "../../hooks/use-filterable-list.ts";
import type { ListMemory } from "../../hooks/use-list-memory.ts";
import { usePeekSession } from "../../hooks/use-peek-session.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { FilterBar } from "../parts/filter-bar.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";
import { MessageTable } from "../parts/tables.tsx";

export interface QueueScreenProps {
  readonly queue: Queue;
  readonly operations: MessageOperations;
  readonly connection: ConnectionInfo;
  readonly pageSize: number;
  readonly reloadToken: number;
  readonly onOpen: (message: Message) => void;
  readonly onSelectionChange: (message: Message | null) => void;
  readonly onAction: (id: ActionId) => void;
  readonly onMarkedChange: (messages: readonly Message[]) => void;
  readonly memory: ListMemory;
  readonly openFilter: boolean;
  readonly onFilterOpened: () => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

const searchableFields = searchableText;
const messageKey = (message: Message) => message.id;

export function QueueScreen({
  queue,
  operations,
  connection,
  pageSize,
  reloadToken,
  onOpen,
  onSelectionChange,
  onAction,
  onMarkedChange,
  memory,
  openFilter,
  onFilterOpened,
  width,
  height,
  isActive,
}: QueueScreenProps) {
  const peek = usePeekSession({
    operations,
    connection,
    queueName: queue.name,
    pageSize,
    reloadToken,
  });

  const list = useFilterableList<Message>({
    items: peek.messages,
    searchable: searchableFields,
    height,
    isActive,
    onOpen,
    onSelectionChange,
    openFilter,
    onFilterOpened,
    clearSelectionOnUnmount: true,
    onMarkedChange,
    memory,
    memoryKey: `queue:${queue.name}`,
    key: messageKey,
  });

  useScreenKeys("queue", onAction, {
    isActive: isActive && !list.filtering,
    local: {
      "/": list.startFiltering,
      " ": list.toggleMark,
      a: list.toggleMarkAll,
      "]": peek.loadMore,
    },
  });

  if (peek.loading && peek.messages.length === 0)
    return <Spinner label={`Loading messages from ${queue.name}…`} />;

  if (peek.error !== null && peek.messages.length === 0)
    return (
      <StatusMessage tone="danger">{errorMessage(peek.error)}</StatusMessage>
    );

  const [start, end] = list.visibleRange;
  const depth = totalMessages(queue);
  const held = peek.messages.length;

  const reach =
    peek.exhausted || held >= depth
      ? `all ${formatCount(held, "message")}`
      : `${held.toLocaleString()} of ${depth.toLocaleString()}`;

  return (
    <Box flexDirection="column">
      <FilterBar {...list.filterBarProps} />

      {list.visible.length === 0 ? (
        <Text color={theme.muted}>
          {list.filter === ""
            ? "This queue is empty."
            : `No messages matching '${list.filter}'.`}
        </Text>
      ) : (
        <>
          <MessageTable
            messages={list.visible.slice(start, end)}
            allMessages={list.visible}
            width={width}
            pattern={list.filter}
            selectedIndex={list.selectedIndex - start}
            isMarked={list.isMarked}
          />
          <Text color={theme.muted}>
            {list.selectedIndex + 1}/{list.visible.length}
            {list.marked.length === 0
              ? ""
              : ` ${glyphs.bullet} ${formatCount(list.marked.length, "message")} marked`}{" "}
            {glyphs.bullet} showing{" "}
            <Text color={peek.exhausted ? theme.muted : theme.info}>
              {reach}
            </Text>{" "}
            {glyphs.bullet}{" "}
            {peek.loading
              ? "loading more…"
              : peek.exhausted
                ? "previewed, not consumed"
                : "] for more"}
          </Text>
          {peek.error === null ? null : (
            <StatusMessage tone="danger">
              {errorMessage(peek.error)}
            </StatusMessage>
          )}
        </>
      )}
    </Box>
  );
}
