import type { ConnectionInfo } from "../domain/connection.ts";
import type { BrokerClient } from "../ports/broker.ts";
import type { ConfigurationStore } from "../ports/stores.ts";

export class ConnectionOperations {
  constructor(
    private readonly configStore: ConfigurationStore,
    private readonly broker: BrokerClient,
  ) {}

  async addConnection(connection: ConnectionInfo): Promise<boolean> {
    if (!(await this.broker.testConnection(connection))) return false;
    if (!this.configStore.saveConnection(connection)) return false;

    this.configStore.setDefaultConnection(connection.id);
    return true;
  }

  removeConnection(id: string): boolean {
    const connection = this.configStore.getConnection(id);
    if (connection === null) return false;

    const wasDefault = this.configStore.getDefaultConnection()?.id === id;
    const removed = this.configStore.removeConnection(id);

    if (removed && wasDefault) {
      const remaining = this.configStore.listConnections();
      const next = remaining[0];
      if (next !== undefined) this.configStore.setDefaultConnection(next.id);
    }

    return removed;
  }

  listConnections(): ConnectionInfo[] {
    return this.configStore.listConnections();
  }

  getDefaultConnection(): ConnectionInfo | null {
    return this.configStore.getDefaultConnection();
  }

  setDefaultConnection(id: string): boolean {
    if (this.configStore.getConnection(id) === null) {
      throw new Error(`Connection not found with ID: ${id}`);
    }
    return this.configStore.setDefaultConnection(id);
  }
}
