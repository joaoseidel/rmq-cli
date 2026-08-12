import type { ZodType } from "zod";
import type { ConnectionInfo } from "../domain/connection.ts";
import type { Message } from "../domain/message.ts";
import type {
  BackupOrigin,
  InterruptedOperation,
  OperationSummary,
  ProcessingResult,
} from "../domain/operation.ts";

export interface SettingsStore {
  save<T extends { id: string }>(
    collection: string,
    item: T,
    schema: ZodType<T>,
  ): T;
  list<T>(collection: string, schema: ZodType<T>): T[];
  find<T>(
    collection: string,
    schema: ZodType<T>,
    predicate: (item: T) => boolean,
  ): T | null;
  findById<T>(collection: string, id: string, schema: ZodType<T>): T | null;
  update<T extends { id: string }>(collection: string, item: T): boolean;
  delete(collection: string, id: string): boolean;
}

export interface ConfigurationStore {
  saveConnection(connection: ConnectionInfo): boolean;
  getConnection(id: string): ConnectionInfo | null;
  listConnections(): ConnectionInfo[];
  removeConnection(id: string): boolean;
  setDefaultConnection(id: string): boolean;
  getDefaultConnection(): ConnectionInfo | null;
}

export interface MessageBackupRepository {
  storeMessages(
    operationId: string,
    operationType: string,
    origin: BackupOrigin,
    messages: readonly Message[],
  ): boolean;
  markMessageAsProcessed(operationId: string, messageId: string): boolean;
  getUnprocessedMessages(operationId: string): Message[];
  getProcessedMessages(operationId: string): Message[];
  completeOperation(operationId: string): boolean;
  listInterruptedOperations(scope?: {
    connectionId: string;
    vhost: string;
  }): InterruptedOperation[];
  forget(operationId: string): boolean;
  pruneOlderThan(cutoff: number): number;
}

export interface SafeOperationCoordinator {
  executeOperation(input: {
    operationId?: string;
    operationType: string;
    origin: BackupOrigin;
    provideMessages: () => Promise<readonly Message[]>;
    process: (message: Message) => Promise<ProcessingResult>;
    onProgress?: (progress: { processed: number; total: number }) => void;
  }): Promise<OperationSummary>;
}
