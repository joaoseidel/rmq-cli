import { Box, Text } from "ink";
import type { Message } from "../../../core/domain/message.ts";
import { searchableText } from "../../../core/usecase/message-operations.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import type { ActionId } from "../../actions.ts";
import { useAsync } from "../../hooks/use-async.ts";
import { useFilterableList } from "../../hooks/use-filterable-list.ts";
import type { ListMemory } from "../../hooks/use-list-memory.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { FilterBar } from "../parts/filter-bar.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";
import { MessageTable } from "../parts/tables.tsx";

export interface QueueScreenProps {
  readonly queue: Queue;
  readonly loadMessages: (queue: Queue) => Promise<Message[]>;
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
  loadMessages,
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
  const { state } = useAsync(
    () => loadMessages(queue),
    [loadMessages, queue.name],
  );
  const messages = state.status === "success" ? state.data : [];

  const list = useFilterableList<Message>({
    items: messages,
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
    },
  });

  if (state.status === "pending")
    return <Spinner label={`Loading messages from ${queue.name}…`} />;
  if (state.status === "failure")
    return (
      <StatusMessage tone="danger">{errorMessage(state.error)}</StatusMessage>
    );

  const [start, end] = list.visibleRange;

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
            {glyphs.bullet} previewed, not consumed
          </Text>
        </>
      )}
    </Box>
  );
}
