import { Box, Text } from "ink";
import { useEffect } from "react";
import type { Queue } from "../../../core/domain/queue.ts";
import { totalMessages } from "../../../core/domain/queue.ts";
import { errorMessage, formatCount } from "../../../core/util/text.ts";
import type { ActionId } from "../../actions.ts";
import { useAsync } from "../../hooks/use-async.ts";
import { useFilterableList } from "../../hooks/use-filterable-list.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { FilterBar } from "../parts/filter-bar.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";
import { QueueTable } from "../parts/tables.tsx";

export interface QueuesScreenProps {
  readonly loadQueues: () => Promise<Queue[]>;
  readonly onOpen: (queue: Queue) => void;
  /** Publishes the highlighted row so the app can act on it. */
  readonly onSelectionChange: (queue: Queue | null) => void;
  /**
   * Publishes the filtered set, which is what a cross-queue search runs over.
   * Separate from the selection: the search acts on every row the filter left,
   * not on the one under the cursor.
   */
  readonly onScopeChange: (queues: readonly Queue[], filter: string) => void;
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

const searchableFields = (queue: Queue) => [queue.name];

/**
 * The queue browser: the app's home screen.
 *
 * Filtering is client-side over the already-loaded list, which keeps typing
 * instant and avoids a management API round trip per keystroke. `r` re-reads
 * when the broker has moved on.
 *
 * Rows are windowed to the visible height rather than rendered in full — a
 * broker with thousands of queues would otherwise rebuild the entire table on
 * every cursor move.
 */
export function QueuesScreen({
  loadQueues,
  onOpen,
  onSelectionChange,
  onScopeChange,
  onAction,
  openFilter,
  onFilterOpened,
  width,
  height,
  isActive,
}: QueuesScreenProps) {
  // `loadQueues` is rebuilt by the app whenever the connection changes or a
  // refresh is requested, so its identity is the reload trigger.
  const { state } = useAsync(loadQueues, [loadQueues]);
  const queues = state.status === "success" ? state.data : [];

  const list = useFilterableList<Queue>({
    items: queues,
    searchable: searchableFields,
    height,
    isActive,
    onOpen,
    onSelectionChange,
    openFilter,
    onFilterOpened,
  });

  useEffect(() => {
    onScopeChange(list.visible, list.filter);
  }, [list.visible, list.filter, onScopeChange]);

  useScreenKeys("queues", onAction, {
    isActive: isActive && !list.filtering,
    local: { "/": list.startFiltering },
  });

  if (state.status === "pending") return <Spinner label="Loading queues…" />;
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
            ? "No queues in this virtual host."
            : `No queues matching '${list.filter}'.`}
        </Text>
      ) : (
        <>
          <QueueTable
            queues={list.visible.slice(start, end)}
            width={width}
            pattern={list.filter}
            selectedIndex={list.selectedIndex - start}
          />
          <Text color={theme.muted}>
            {list.selectedIndex + 1}/{list.visible.length}
            {list.selected === null
              ? ""
              : ` ${glyphs.bullet} ${formatCount(totalMessages(list.selected), "message")} in ${list.selected.name}`}
          </Text>
        </>
      )}
    </Box>
  );
}
