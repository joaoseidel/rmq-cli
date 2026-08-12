import { Box, Text } from "ink";
import { useEffect } from "react";
import type { Queue } from "../../../core/domain/queue.ts";
import { totalMessages } from "../../../core/domain/queue.ts";
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
import { QueueTable } from "../parts/tables.tsx";

export interface QueuesScreenProps {
  readonly loadQueues: () => Promise<Queue[]>;
  readonly onOpen: (queue: Queue) => void;
  readonly onSelectionChange: (queue: Queue | null) => void;
  readonly onScopeChange: (queues: readonly Queue[], filter: string) => void;
  readonly onMarkedChange: (queues: readonly Queue[]) => void;
  readonly memory: ListMemory;
  readonly onAction: (id: ActionId) => void;
  readonly openFilter: boolean;
  readonly onFilterOpened: () => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

const searchableFields = (queue: Queue) => [queue.name];
const queueKey = (queue: Queue) => `${queue.vhost}/${queue.name}`;

export function QueuesScreen({
  loadQueues,
  onOpen,
  onSelectionChange,
  onScopeChange,
  onMarkedChange,
  memory,
  onAction,
  openFilter,
  onFilterOpened,
  width,
  height,
  isActive,
}: QueuesScreenProps) {
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
    onMarkedChange,
    memory,
    memoryKey: "queues",
    key: queueKey,
  });

  useEffect(() => {
    onScopeChange(list.visible, list.filter);
  }, [list.visible, list.filter, onScopeChange]);

  useScreenKeys("queues", onAction, {
    isActive: isActive && !list.filtering,
    local: {
      "/": list.startFiltering,
      " ": list.toggleMark,
      a: list.toggleMarkAll,
    },
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
            allQueues={list.visible}
            width={width}
            pattern={list.filter}
            selectedIndex={list.selectedIndex - start}
            isMarked={list.isMarked}
          />
          <Text color={theme.muted}>
            {list.selectedIndex + 1}/{list.visible.length}
            {list.marked.length === 0
              ? ""
              : ` ${glyphs.bullet} ${formatCount(list.marked.length, "queue")} marked`}
            {list.selected === null
              ? ""
              : ` ${glyphs.bullet} ${formatCount(totalMessages(list.selected), "message")} in ${list.selected.name}`}
          </Text>
        </>
      )}
    </Box>
  );
}
