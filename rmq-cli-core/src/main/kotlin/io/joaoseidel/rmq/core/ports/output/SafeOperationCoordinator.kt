package io.joaoseidel.rmq.core.ports.output

import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.OperationSummary
import io.joaoseidel.rmq.core.domain.ProcessingResult
import java.util.UUID

/**
 * Interface for coordinating safe operations with transactional guarantees.
 *
 * Implementations of this interface are responsible for ensuring that operations
 * are executed in a safe and consistent manner while processing messages and
 * generating an overall operation summary.
 */
interface SafeOperationCoordinator {
    /**
     * Executes an operation based on the specified type and processes a collection of messages.
     *
     * @param operationId The ID of the operation.
     * @param operationType The type of operation to be executed.
     * @param messagesProvider A function that returns a list of messages to be processed.
     * @param processor A suspending function that processes a single message and returns a result.
     * @return A summary of the operation after processing all messages.
     */
    suspend fun executeOperation(
        operationId: UUID = UUID.randomUUID(),
        operationType: String,
        messagesProvider: () -> List<Message>,
        processor: suspend (Message) -> ProcessingResult,
    ): OperationSummary
}
