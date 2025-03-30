package io.joaoseidel.rmq.core.domain

/**
 * Represents the result of a processing operation.
 *
 * This sealed class is used to denote whether an operation was successful or failed,
 * encapsulating the relevant information for either case.
 */
sealed class ProcessingResult {
    /**
     * Represents the successful processing result of a message.
     *
     * @property messageId The unique identifier of the processed message.
     */
    data class Success(
        val messageId: String,
    ) : ProcessingResult()

    /**
     * Represents the failure result of a message processing operation.
     *
     * @property messageId The unique identifier of the message that failed to process.
     * @property reason The reason describing why the message processing failed.
     */
    data class Failure(
        val messageId: String,
        val reason: String,
    ) : ProcessingResult()
}
