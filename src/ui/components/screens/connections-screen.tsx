import { Box, Text } from "ink";
import { useMemo, useReducer, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { portSummary } from "../../../core/domain/connection.ts";
import type { ConnectionOperations } from "../../../core/usecase/connection-operations.ts";
import { useKeyHandler } from "../../hooks/use-key-handler.ts";
import { useListNavigation } from "../../hooks/use-list-navigation.ts";
import { glyphs, theme } from "../../theme.ts";
import { Confirm } from "../common/confirm.tsx";
import { StatusMessage } from "../parts/status-message.tsx";
import { ConnectionTable } from "../parts/tables.tsx";

export interface ConnectionsScreenProps {
  readonly connections: ConnectionOperations;
  readonly activeId: string | null;
  readonly onUse: (connection: ConnectionInfo) => void;
  readonly onAdd: () => void;
  readonly onChanged: (message: string) => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

/**
 * Connection manager.
 *
 * Pick one to browse, mark one as the default, remove one, or add another. The
 * list is re-read from the store only after a mutation, since every read
 * re-validates the whole file.
 */
export function ConnectionsScreen({
  connections,
  activeId,
  onUse,
  onAdd,
  onChanged,
  width,
  height,
  isActive,
}: ConnectionsScreenProps) {
  // Bumped after a mutation to re-read the store. Reading it through a reducer
  // rather than a counter avoids a state value the render has to deliberately
  // ignore.
  const [version, reload] = useReducer((count: number) => count + 1, 0);
  const [confirmingRemoval, setConfirmingRemoval] =
    useState<ConnectionInfo | null>(null);

  // Every read re-validates the whole file, so it is held across renders and
  // repeated only when something has actually changed it.
  const items = useMemo(
    () => connections.listConnections(),
    [connections, version],
  );

  const navigation = useListNavigation({
    itemCount: items.length,
    pageSize: Math.max(1, height - 6),
    isActive: isActive && confirmingRemoval === null,
    onSelect: (index) => {
      const connection = items[index];
      if (connection !== undefined) onUse(connection);
    },
  });

  const selected = items[navigation.selectedIndex];

  useKeyHandler(
    (input) => {
      if (input === "a") {
        onAdd();
        return;
      }
      if (selected === undefined) return;

      if (input === "d") {
        connections.setDefaultConnection(selected.id);
        reload();
        onChanged(`${selected.name} is now the default connection.`);
      } else if (input === "x") {
        setConfirmingRemoval(selected);
      }
    },
    { isActive: isActive && confirmingRemoval === null },
  );

  if (confirmingRemoval !== null) {
    return (
      <Confirm
        message={`Remove connection '${confirmingRemoval.name}'?`}
        isActive={isActive}
        onAnswer={(confirmed) => {
          if (confirmed) {
            const removed = connections.removeConnection(confirmingRemoval.id);
            reload();
            onChanged(
              removed
                ? `Removed ${confirmingRemoval.name}.`
                : `Failed to remove ${confirmingRemoval.name}.`,
            );
          }
          setConfirmingRemoval(null);
        }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <StatusMessage tone="warning">
          No connections configured yet.
        </StatusMessage>
        <Text color={theme.muted}>Press a to add one.</Text>
      </Box>
    );
  }

  const [start, end] = navigation.visibleRange;

  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        ⏎ browse {glyphs.bullet} d make default {glyphs.bullet} a add{" "}
        {glyphs.bullet} x remove
      </Text>
      <Box height={1} />

      <ConnectionTable
        connections={items.slice(start, end)}
        width={width}
        selectedIndex={navigation.selectedIndex - start}
      />

      {selected === undefined ? null : (
        <Text color={theme.muted}>
          {selected.username}@{selected.host} {glyphs.bullet}{" "}
          {portSummary(selected)}
          {selected.id === activeId
            ? ` ${glyphs.bullet} currently browsing`
            : ""}
        </Text>
      )}
    </Box>
  );
}
