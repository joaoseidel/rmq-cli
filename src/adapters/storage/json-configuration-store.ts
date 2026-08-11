import {
  ConnectionInfoSchema,
  withIsDefault,
  type ConnectionInfo,
} from "../../core/domain/connection.ts";
import type {
  ConfigurationStore,
  SettingsStore,
} from "../../core/ports/stores.ts";
import { createLogger } from "../../core/util/logger.ts";
import type { SecretCipher } from "./secret-cipher.ts";

const logger = createLogger("configuration-store");

const COLLECTION = "connections";

export class JsonConfigurationStore implements ConfigurationStore {
  constructor(
    private readonly settings: SettingsStore,
    private readonly cipher: SecretCipher,
  ) {
    this.encryptStoredPasswords();
  }

  saveConnection(connection: ConnectionInfo): boolean {
    try {
      this.settings.save(
        COLLECTION,
        this.encrypted(connection),
        ConnectionInfoSchema,
      );
      if (connection.isDefault) this.clearOtherDefaults(connection.id);
      return true;
    } catch (error) {
      logger.error(`Failed to save connection '${connection.name}'`, error);
      return false;
    }
  }

  getConnection(id: string): ConnectionInfo | null {
    try {
      const stored = this.settings.findById(
        COLLECTION,
        id,
        ConnectionInfoSchema,
      );
      return stored === null ? null : this.decrypted(stored);
    } catch (error) {
      logger.error(`Failed to read connection '${id}'`, error);
      return null;
    }
  }

  listConnections(): ConnectionInfo[] {
    try {
      return this.settings
        .list(COLLECTION, ConnectionInfoSchema)
        .map((stored) => this.decrypted(stored));
    } catch (error) {
      logger.error("Failed to list connections", error);
      return [];
    }
  }

  removeConnection(id: string): boolean {
    try {
      const wasDefault = this.getConnection(id)?.isDefault === true;
      const removed = this.settings.delete(COLLECTION, id);

      if (removed && wasDefault) {
        const next = this.listConnections()[0];
        if (next !== undefined) this.setDefaultConnection(next.id);
      }

      return removed;
    } catch (error) {
      logger.error(`Failed to remove connection '${id}'`, error);
      return false;
    }
  }

  setDefaultConnection(id: string): boolean {
    try {
      const target = this.getConnection(id);
      if (target === null)
        throw new Error(`Connection not found with ID: ${id}`);

      this.settings.update(
        COLLECTION,
        this.encrypted(withIsDefault(target, true)),
      );
      this.clearOtherDefaults(id);
      return true;
    } catch (error) {
      logger.error(`Failed to set default connection '${id}'`, error);
      return false;
    }
  }

  getDefaultConnection(): ConnectionInfo | null {
    try {
      const connections = this.listConnections();
      return (
        connections.find((connection) => connection.isDefault) ??
        connections[0] ??
        null
      );
    } catch (error) {
      logger.error("Failed to resolve the default connection", error);
      return null;
    }
  }

  private clearOtherDefaults(defaultId: string): void {
    for (const connection of this.listConnections()) {
      if (connection.id !== defaultId && connection.isDefault) {
        this.settings.update(
          COLLECTION,
          this.encrypted(withIsDefault(connection, false)),
        );
      }
    }
  }

  private encrypted(connection: ConnectionInfo): ConnectionInfo {
    return {
      ...connection,
      password: this.cipher.encrypt(connection.password),
    };
  }

  private decrypted(stored: ConnectionInfo): ConnectionInfo {
    const password = this.cipher.decrypt(stored.password);
    if (password !== null) return { ...stored, password };

    logger.error(
      `Failed to decrypt the password for connection '${stored.name}'; re-enter it to restore access`,
    );
    return { ...stored, password: "" };
  }

  private encryptStoredPasswords(): void {
    try {
      for (const stored of this.settings.list(
        COLLECTION,
        ConnectionInfoSchema,
      )) {
        if (this.cipher.isEncrypted(stored.password)) continue;

        this.settings.update(COLLECTION, this.encrypted(stored));
        logger.info(`Encrypted the stored password for '${stored.name}'`);
      }
    } catch (error) {
      logger.error("Failed to encrypt previously stored passwords", error);
    }
  }
}
