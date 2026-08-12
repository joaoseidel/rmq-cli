import { z } from "zod";
import { MessageSchema, type Message } from "../../core/domain/message.ts";
import type { InterruptedOperation } from "../../core/domain/operation.ts";
import type {
  MessageBackupRepository,
  SettingsStore,
} from "../../core/ports/stores.ts";
import { createLogger } from "../../core/util/logger.ts";

const logger = createLogger("message-backup");

const BACKUP_COLLECTION = "message_backup_operations";

const BackupEntitySchema = z.object({
  id: z.string(),
  type: z.string(),
  queueName: z.string().default(""),
  messages: z.array(MessageSchema),
  processedMessageIds: z.array(z.string()).default([]),
  createdAt: z.number().default(() => Date.now()),
});

type BackupEntity = z.infer<typeof BackupEntitySchema>;

export class JsonMessageBackupRepository implements MessageBackupRepository {
  constructor(private readonly settings: SettingsStore) {}

  storeMessages(
    operationId: string,
    operationType: string,
    queueName: string,
    messages: readonly Message[],
  ): boolean {
    if (messages.length === 0) return true;

    try {
      this.settings.save(
        BACKUP_COLLECTION,
        {
          id: operationId,
          type: operationType,
          queueName,
          messages: [...messages],
          processedMessageIds: [],
          createdAt: Date.now(),
        },
        BackupEntitySchema,
      );

      logger.debug(
        `Stored ${messages.length} messages for operation ${operationId}`,
      );
      return true;
    } catch (error) {
      logger.error(
        `Failed to store messages for operation ${operationId}`,
        error,
      );
      return false;
    }
  }

  markMessageAsProcessed(operationId: string, messageId: string): boolean {
    try {
      const entity = this.findEntity(operationId);
      if (entity === null) return false;
      if (entity.processedMessageIds.includes(messageId)) return true;

      return this.settings.update(BACKUP_COLLECTION, {
        ...entity,
        processedMessageIds: [...entity.processedMessageIds, messageId],
      });
    } catch (error) {
      logger.error(
        `Failed to mark message ${messageId} processed for operation ${operationId}`,
        error,
      );
      return false;
    }
  }

  getUnprocessedMessages(operationId: string): Message[] {
    return this.partition(operationId, false);
  }

  getProcessedMessages(operationId: string): Message[] {
    return this.partition(operationId, true);
  }

  completeOperation(operationId: string): boolean {
    const entity = this.findEntity(operationId);
    if (entity === null) return false;

    if (entity.messages.length !== entity.processedMessageIds.length)
      return true;

    return this.settings.delete(BACKUP_COLLECTION, operationId);
  }

  listInterruptedOperations(): InterruptedOperation[] {
    return this.settings
      .list(BACKUP_COLLECTION, BackupEntitySchema)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((entity) => {
        const done = new Set(entity.processedMessageIds);
        return {
          id: entity.id,
          type: entity.type,
          queueName: entity.queueName,
          createdAt: entity.createdAt,
          total: entity.messages.length,
          remaining: entity.messages.filter(
            (message) => !done.has(message.id),
          ).length,
        };
      })
      .filter((entry) => entry.remaining > 0);
  }

  forget(operationId: string): boolean {
    return this.settings.delete(BACKUP_COLLECTION, operationId);
  }

  pruneOlderThan(cutoff: number): number {
    const stale = this.settings
      .list(BACKUP_COLLECTION, BackupEntitySchema)
      .filter(
        (entity) =>
          entity.createdAt < cutoff &&
          entity.messages.length === entity.processedMessageIds.length,
      );

    for (const entity of stale) this.settings.delete(BACKUP_COLLECTION, entity.id);
    return stale.length;
  }

  private partition(operationId: string, processed: boolean): Message[] {
    const entity = this.findEntity(operationId);
    if (entity === null) return [];

    const done = new Set(entity.processedMessageIds);
    return entity.messages.filter(
      (message) => done.has(message.id) === processed,
    );
  }

  private findEntity(operationId: string): BackupEntity | null {
    return this.settings.findById(
      BACKUP_COLLECTION,
      operationId,
      BackupEntitySchema,
    );
  }
}
