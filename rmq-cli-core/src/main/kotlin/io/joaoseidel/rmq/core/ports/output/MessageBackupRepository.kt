package io.joaoseidel.rmq.core.ports.output

import io.joaoseidel.rmq.core.domain.Message
import java.util.UUID

/**
 * Provides an interface for managing the backup and processing of messages
 * associated with specific operations. This repository offers methods for
 * persisting messages, marking them as processed, fetching unprocessed messages,
 * and completing operations to ensure proper handling and consistency of
 * operation states.
 */
interface MessageBackupRepository {
    /**
     * Stores a list of messages associated with a specific operation.
     *
     * This function is used to persist messages related to an operation identified by its unique ID.
     * The operation type provides contextual information about the purpose or category of the operation.
     *
     * @param operationId The unique identifier of the operation to which the messages are associated.
     * @param operationType A string value describing the type of the operation.
     * @param messages The list of messages to be stored for the specified operation.
     * @return `true` if the messages were successfully stored, otherwise `false`.
     */
    fun storeMessages(
        operationId: UUID,
        operationType: String,
        messages: List<Message>,
    ): Boolean

    /**
     * Marks a specific message as processed for the given operation.
     *
     * This function identifies a message by its ID associated with the specified
     * operation and updates its status to indicate it has been processed.
     *
     * @param operationId The unique identifier of the operation associated with the message.
     * @param messageId The identifier of the message to be marked as processed.
     * @return `true` if the message was successfully marked as processed, otherwise `false`.
     */
    fun markMessageAsProcessed(
        operationId: UUID,
        messageId: String,
    ): Boolean

    /**
     * Retrieves a list of unprocessed messages associated with a specific operation.
     *
     * This function fetches all messages for the given operation that have not been marked as processed.
     * It is useful for identifying and handling pending messages within the operation's scope.
     *
     * @param operationId The unique identifier of the operation for which unprocessed messages are to be retrieved.
     * @return A list of messages that are unprocessed for the specified operation.
     */
    fun getUnprocessedMessages(operationId: UUID): List<Message>

    /**
     * Completes an operation identified by the provided operation ID.
     *
     * This function performs necessary finalization steps for the operation,
     * ensuring all associated tasks are resolved and marked as complete.
     *
     * @param operationId The unique identifier of the operation to be completed.
     * @return `true` if the operation was successfully completed, otherwise `false`.
     */
    fun completeOperation(operationId: UUID): Boolean
}
