import { randomUUID } from "node:crypto";
import type { Message } from "../../core/domain/message.ts";
import {
  emptySummary,
  type OperationSummary,
  type ProcessingResult,
} from "../../core/domain/operation.ts";
import type {
  MessageBackupRepository,
  SafeOperationCoordinator,
} from "../../core/ports/stores.ts";
import { createLogger } from "../../core/util/logger.ts";
import { errorMessage } from "../../core/util/text.ts";

const logger = createLogger("operation-coordinator");

export class BackedUpOperationCoordinator implements SafeOperationCoordinator {
  constructor(private readonly backups: MessageBackupRepository) {}

  async executeOperation(input: {
    operationId?: string;
    operationType: string;
    queueName: string;
    provideMessages: () => Promise<readonly Message[]>;
    process: (message: Message) => Promise<ProcessingResult>;
    onProgress?: (progress: { processed: number; total: number }) => void;
  }): Promise<OperationSummary> {
    const operationId = input.operationId ?? randomUUID();
    logger.debug(`Starting ${input.operationType} operation ${operationId}`);

    const messages = await input.provideMessages();
    if (messages.length === 0) return emptySummary(operationId);

    if (
      !this.backups.storeMessages(
        operationId,
        input.operationType,
        input.queueName,
        messages,
      )
    ) {
      logger.error(
        `Failed to back up ${messages.length} messages for operation ${operationId}`,
      );
      return emptySummary(operationId, messages);
    }

    let successful = 0;
    let failed = 0;

    for (const [index, message] of messages.entries()) {
      let result: ProcessingResult;

      try {
        result = await input.process(message);
      } catch (error) {
        logger.error(`Error processing message ${message.id}`, error);
        result = {
          status: "failure",
          messageId: message.id,
          reason: `Exception: ${errorMessage(error)}`,
        };
      }

      if (result.status === "success") {
        this.backups.markMessageAsProcessed(operationId, message.id);
        successful += 1;
      } else {
        logger.warn(
          `Processing failed for message ${message.id}: ${result.reason}`,
        );
        failed += 1;
      }

      input.onProgress?.({ processed: index + 1, total: messages.length });
    }

    const processedMessages = this.backups.getProcessedMessages(operationId);
    const unprocessedMessages =
      this.backups.getUnprocessedMessages(operationId);
    this.backups.completeOperation(operationId);

    return {
      id: operationId,
      successful,
      failed,
      processedMessages,
      unprocessedMessages,
    };
  }
}
