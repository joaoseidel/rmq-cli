import { Box, Text } from "ink";
import { useMemo, useReducer } from "react";
import type { InterruptedOperation } from "../../../core/domain/operation.ts";
import type { MessageOperations } from "../../../core/usecase/message-operations.ts";
import { formatDuration } from "../../../core/util/progress.ts";
import { formatCount } from "../../../core/util/text.ts";
import { useListNavigation } from "../../hooks/use-list-navigation.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { StatusMessage } from "../parts/status-message.tsx";

export interface RecoveryScreenProps {
  readonly operations: MessageOperations;
  readonly scope: { readonly connectionId: string; readonly vhost: string };
  readonly onRecover: (operation: InterruptedOperation) => void;
  readonly onForget: (operation: InterruptedOperation) => void;
  readonly height: number;
  readonly isActive: boolean;
}

export function RecoveryScreen({
  operations,
  scope,
  onRecover,
  onForget,
  height,
  isActive,
}: RecoveryScreenProps) {
  const [version, reload] = useReducer((count: number) => count + 1, 0);

  const entries = useMemo(
    () => operations.listInterruptedOperations(scope),
    [operations, scope, version],
  );

  const navigation = useListNavigation({
    itemCount: entries.length,
    pageSize: Math.max(1, height - 4),
    isActive,
    onSelect: (index) => {
      const entry = entries[index];
      if (entry !== undefined && entry.recoverable) onRecover(entry);
    },
  });

  const selected = entries[navigation.selectedIndex];

  useScreenKeys("recovery", () => {}, {
    isActive,
    local: {
      x: () => {
        if (selected === undefined) return;
        onForget(selected);
        reload();
      },
    },
  });

  if (entries.length === 0) {
    return (
      <Box flexDirection="column">
        <StatusMessage tone="success">
          Nothing is waiting to be recovered.
        </StatusMessage>
        <Text color={theme.muted}>
          If rmq is interrupted while it is rewriting a queue, the messages it
          had taken off appear here so they can be put back.
        </Text>
      </Box>
    );
  }

  const now = Date.now();
  const [start, end] = navigation.visibleRange;

  return (
    <Box flexDirection="column">
      <StatusMessage tone="warning">
        {formatCount(entries.length, "operation")} on this broker did not
        finish. Press Enter to put the messages back.
      </StatusMessage>
      <Box height={1} />

      {entries.slice(start, end).map((entry, index) => {
        const isCursor = start + index === navigation.selectedIndex;

        return (
          <Text key={entry.id}>
            <Text color={isCursor ? theme.info : theme.muted}>
              {isCursor ? glyphs.cursor : " "}{" "}
            </Text>
            <Text bold={isCursor}>
              {formatCount(entry.remaining, "message")}
            </Text>
            <Text color={theme.muted}>
              {" "}
              to put back into{" "}
              {entry.recoverable ? entry.origin.queueName : "an unknown queue"}{" "}
              {glyphs.bullet} {entry.type} {glyphs.bullet}{" "}
              {formatDuration(now - entry.createdAt)} ago {glyphs.bullet}{" "}
              {entry.id.slice(0, 8)}
            </Text>
          </Text>
        );
      })}
    </Box>
  );
}
