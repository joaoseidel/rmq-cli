import { Box, Text } from "ink";
import { useMemo, useReducer, useState } from "react";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import { portSummary } from "../../../core/domain/connection.ts";
import type { ConnectionOperations } from "../../../core/usecase/connection-operations.ts";
import { useListNavigation } from "../../hooks/use-list-navigation.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
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
  const [version, reload] = useReducer((count: number) => count + 1, 0);
  const [confirmingRemoval, setConfirmingRemoval] =
    useState<ConnectionInfo | null>(null);

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

  useScreenKeys("connections", () => onAdd(), {
    isActive: isActive && confirmingRemoval === null,
    local: {
      d: () => {
        if (selected === undefined) return;
        connections.setDefaultConnection(selected.id);
        reload();
        onChanged(`${selected.name} is now the default connection.`);
      },
      x: () => {
        if (selected !== undefined) setConfirmingRemoval(selected);
      },
    },
  });

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
      <ConnectionTable
        connections={items.slice(start, end)}
        allConnections={items}
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
