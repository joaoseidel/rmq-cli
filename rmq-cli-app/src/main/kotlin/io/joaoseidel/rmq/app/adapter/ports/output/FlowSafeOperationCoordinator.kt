package io.joaoseidel.rmq.app.adapter.ports.output

import io.github.oshai.kotlinlogging.KotlinLogging
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.OperationSummary
import io.joaoseidel.rmq.core.domain.ProcessingResult
import io.joaoseidel.rmq.core.ports.output.MessageBackupRepository
import io.joaoseidel.rmq.core.ports.output.SafeOperationCoordinator
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.fold
import org.koin.core.annotation.Singleton
import org.koin.java.KoinJavaComponent.inject
import java.util.*

private val logger = KotlinLogging.logger {}

/**
 * Coordinates the safe execution of message processing operations, ensuring reliability
 * and consistency through message backups and controlled flow management.
 *
 * This class is responsible for executing operations involving message processing,
 * handling message backups, and processing results. It ensures that all messages
 * are either successfully processed or tracked as unprocessed, enabling recovery
 * and consistency in case of failures.
 *
 * Key responsibilities:
 * - Safely executing operations by backing up messages and ensuring processing results are captured.
 * - Managing failures during message processing and associating unprocessed messages with the operation.
 * - Providing a detailed `OperationSummary` after execution, highlighting successes, failures, and unprocessed messages.
 *
 * Dependencies:
 * - Requires an implementation of `MessageBackupRepository` to perform operations like backing up,
 *   marking messages as processed, and retrieving unprocessed messages.
 *
 * Implements:
 * - `SafeOperationCoordinator` to provide a contract for executing safe operations.
 *
 * This implementation leverages Kotlin coroutines and Flow to enable asynchronous processing of messages.
 */
@Singleton
class FlowSafeOperationCoordinator : SafeOperationCoordinator {
    private val messageBackupRepository by inject<MessageBackupRepository>(MessageBackupRepository::class.java)

    override suspend fun executeOperation(
        operationId: UUID,
        operationType: String,
        messagesProvider: () -> List<Message>,
        processor: suspend (Message) -> ProcessingResult,
    ): OperationSummary {
        logger.debug { "Starting operation: $operationId" }

        val messages = messagesProvider()
        if (messages.isEmpty()) {
            logger.debug { "No messages to process for operation $operationId" }
            return OperationSummary(operationId, 0, 0)
        }

        if (!messageBackupRepository.storeMessages(operationId, operationType, messages)) {
            logger.error { "Failed to backup messages for operation $operationId" }
            return OperationSummary(operationId, 0, 0, unprocessedMessages = messages)
        }

        data class ProcessingStats(
            val successes: Int = 0,
            val failures: Int = 0,
        )

        val stats =
            createMessageProcessingFlow(messages, processor, operationId)
                .catch { e ->
                    logger.error(e) { "Error in message processing flow" }
                }.fold(ProcessingStats()) { stats, result ->
                    when (result) {
                        is ProcessingResult.Success -> stats.copy(successes = stats.successes + 1)
                        is ProcessingResult.Failure -> stats.copy(failures = stats.failures + 1)
                    }
                }

        val processedMessage = messageBackupRepository.getProcessedMessages(operationId)
        val unprocessedMessages = messageBackupRepository.getUnprocessedMessages(operationId)
        messageBackupRepository.completeOperation(operationId)

        return OperationSummary(
            id = operationId,
            successful = stats.successes,
            failed = stats.failures,
            processedMessages = processedMessage,
            unprocessedMessages = unprocessedMessages,
        )
    }

    /**
     * Creates a Flow to process a list of messages using a provided processor function.
     *
     * Each message is processed sequentially, and the corresponding result is emitted
     * into the flow. If a message is successfully processed, it is marked as processed
     * in the message backup repository using the associated operation ID. In case of failure,
     * a warning is logged, and the failure result is emitted. If an exception occurs during
     * processing, it is caught, logged, and a failure result is emitted with the exception details.
     *
     * @param messages The list of messages to be processed.
     * @param processor A suspendable function that processes a single message and returns a [ProcessingResult].
     * @param operationId The unique identifier for the operation used in message backup and tracking.
     * @return A Flow emitting [ProcessingResult] objects for each processed message.
     */
    private fun createMessageProcessingFlow(
        messages: List<Message>,
        processor: suspend (Message) -> ProcessingResult,
        operationId: UUID,
    ): Flow<ProcessingResult> =
        flow {
            messages.forEach { message ->
                try {
                    val result = processor(message)

                    if (result is ProcessingResult.Success) {
                        messageBackupRepository.markMessageAsProcessed(operationId, message.id.value)
                    } else {
                        logger.warn { "Processing failed for message ${message.id.value}: ${(result as ProcessingResult.Failure).reason}" }
                    }

                    emit(result)
                } catch (e: Exception) {
                    logger.error(e) { "Error processing message ${message.id.value}" }
                    emit(ProcessingResult.Failure(message.id.value, "Exception: ${e.message}"))
                }
            }
        }
}
