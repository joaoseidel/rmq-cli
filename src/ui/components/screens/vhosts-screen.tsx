import { Box, Text } from "ink";
import type { ConnectionInfo } from "../../../core/domain/connection.ts";
import type { VHost } from "../../../core/domain/vhost.ts";
import type { BrokerClient } from "../../../core/ports/broker.ts";
import type { VHostOperations } from "../../../core/usecase/vhost-operations.ts";
import { errorMessage } from "../../../core/util/text.ts";
import { useAsync } from "../../hooks/use-async.ts";
import { theme } from "../../theme.ts";
import { Select, type SelectItem } from "../common/select.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

export interface VHostsScreenProps {
  readonly broker: BrokerClient;
  readonly vhosts: VHostOperations;
  readonly connection: ConnectionInfo;
  readonly onSelect: (vhost: VHost) => void;
  readonly onCancel: () => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

export function VHostsScreen({
  broker,
  vhosts,
  connection,
  onSelect,
  onCancel,
  width,
  height,
  isActive,
}: VHostsScreenProps) {
  const { state } = useAsync(
    () => broker.withConnection(connection, (open) => vhosts.list(open)),
    [connection.id, connection.vHost.name],
  );

  if (state.status === "pending")
    return <Spinner label="Loading virtual hosts…" />;
  if (state.status === "failure")
    return (
      <StatusMessage tone="danger">{errorMessage(state.error)}</StatusMessage>
    );

  const items: SelectItem<string>[] = state.data.map((vhost) => ({
    value: vhost.name,
    label: `${vhost.name === connection.vHost.name ? "* " : "  "}${vhost.name}`,
    detail: vhost.description,
  }));

  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        The current virtual host is marked with *. Selecting one updates the
        connection.
      </Text>
      <Box height={1} />
      <Select
        items={items}
        width={width}
        visibleCount={Math.max(3, height - 3)}
        isActive={isActive}
        onCancel={onCancel}
        onSubmit={(name) => {
          const target = state.data.find((vhost) => vhost.name === name);
          if (target !== undefined) onSelect(target);
        }}
        emptyLabel="No virtual hosts visible to this user."
      />
    </Box>
  );
}
