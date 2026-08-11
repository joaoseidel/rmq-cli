import { withVHost } from "../domain/connection.ts";
import type { VHost } from "../domain/vhost.ts";
import type { BrokerClient, BrokerConnection } from "../ports/broker.ts";
import type { ConfigurationStore } from "../ports/stores.ts";
import { createLogger } from "../util/logger.ts";

const logger = createLogger("vhost-operations");

export class VHostOperations {
  constructor(
    private readonly broker: BrokerClient,
    private readonly configStore: ConfigurationStore,
  ) {}

  list(connection: BrokerConnection): Promise<VHost[]> {
    return this.broker.listVHosts(connection);
  }

  async get(name: string, connection: BrokerConnection): Promise<VHost | null> {
    const all = await this.list(connection);
    return all.find((vhost) => vhost.name === name) ?? null;
  }

  async setDefault(
    name: string,
    connection: BrokerConnection,
  ): Promise<boolean> {
    try {
      const target = await this.get(name, connection);
      if (target === null) return false;

      return this.configStore.saveConnection(
        withVHost(connection.info, target),
      );
    } catch (error) {
      logger.error(`Failed to set default vhost '${name}'`, error);
      return false;
    }
  }
}
