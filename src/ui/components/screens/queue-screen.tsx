import { Box, Text } from "ink";
import type { Message } from "../../../core/domain/message.ts";
import type { Queue } from "../../../core/domain/queue.ts";
import { errorMessage } from "../../../core/util/text.ts";
import type { ActionId } from "../../actions.ts";
import { useAsync } from "../../hooks/use-async.ts";
import { useFilterableList } from "../../hooks/use-filterable-list.ts";
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
  /**
   * Set by the palette's Filter action. The screen opens its filter field and
   * calls `onFilterOpened` to clear the request — a plain counter would not
   * survive the remount caused by the palette closing.
   */
  readonly openFilter: boolean;
  readonly onFilterOpened: () => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

const searchableFields = (message: Message) => [message.payload, message.id];

/**
 * Message browser for one queue.
 *
 * Messages are fetched without acknowledgement, so browsing never consumes:
 * everything shown here is still on the broker when the screen closes. That is
 * what makes it safe to page through a production queue.
 */
export function QueueScreen({
  queue,
  loadMessages,
  onOpen,
  onSelectionChange,
  onAction,
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
  });

  useScreenKeys("queue", onAction, {
    isActive: isActive && !list.filtering,
    local: { "/": list.startFiltering },
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
          />
          <Text color={theme.muted}>
            {list.selectedIndex + 1}/{list.visible.length} {glyphs.bullet}{" "}
            previewed, not consumed
          </Text>
        </>
      )}
    </Box>
  );
}
