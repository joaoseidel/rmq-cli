package io.joaoseidel.rmq.core.domain

import java.util.UUID

/**
 * Represents a summary of an operation's results, containing data on successful, failed, and unprocessed messages.
 *
 * @property id The unique identifier of the operation being summarized.
 * @property successful The number of successfully processed messages in the operation.
 * @property failed The number of messages that failed to process during the operation.
 * @property processedMessages A list of messages that were processed during the operation.
 * @property unprocessedMessages A list of messages that remained unprocessed after the operation.
 */
data class OperationSummary(
    val id: UUID,
    val successful: Int,
    val failed: Int,
    val processedMessages: List<Message> = emptyList(),
    val unprocessedMessages: List<Message> = emptyList(),
)
