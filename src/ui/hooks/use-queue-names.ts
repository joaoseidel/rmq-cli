import { useMemo } from "react";
import type { ConnectionInfo } from "../../core/domain/connection.ts";
import type { BrokerClient } from "../../core/ports/broker.ts";
import { useAsync } from "./use-async.ts";

export function useQueueNames(
  broker: BrokerClient,
  connection: ConnectionInfo,
): readonly string[] {
  const { state } = useAsync(
    () =>
      broker.withConnection(connection, (open) =>
        broker.listQueues(null, open),
      ),
    [broker, connection.id, connection.vHost.name],
  );

  return useMemo(
    () =>
      state.status === "success" ? state.data.map((queue) => queue.name) : [],
    [state],
  );
}
