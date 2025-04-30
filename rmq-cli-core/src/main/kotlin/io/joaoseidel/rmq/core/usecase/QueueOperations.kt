package io.joaoseidel.rmq.core.usecase

import io.joaoseidel.rmq.core.domain.CancellationCallback
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.domain.MessageCallback
import io.joaoseidel.rmq.core.domain.OperationSummary
import io.joaoseidel.rmq.core.domain.ProcessingResult
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.ports.input.RabbitMQClient
import io.joaoseidel.rmq.core.ports.output.SafeOperationCoordinator
import org.koin.core.annotation.Singleton
import org.koin.java.KoinJavaComponent.inject

/**
 * Use case that manages operations related to RabbitMQ queues.
 *
 * This class implements the business logic for listing, searching, and managing
 * queues in RabbitMQ brokers.
 *
 * @property rabbitClient RabbitMQ client for queue operations
 */
@Singleton
class QueueOperations {
    private val rabbitClient: RabbitMQClient by inject(RabbitMQClient::class.java)
    private val safeOperationCoordinator: SafeOperationCoordinator by inject(SafeOperationCoordinator::class.java)

    /**
     * Lists all queues in a specific Virtual Host.
     *
     * @param connection The connection to use
     * @param pattern Optional filter pattern (glob syntax: * and ?)
     * @return List of queues matching the pattern or all queues if no pattern provided
     */
    fun listQueues(
        connection: RabbitMQConnection,
        pattern: String? = null
    ) = rabbitClient.listQueues(pattern, connection)

    /**
     * Searches for queues that match a name pattern.
     *
     * @param pattern Pattern to filter queue names (supports glob: *, ?)
     * @param connection The connection to use
     * @return List of queues that match the pattern
     */
    fun searchQueues(
        pattern: String,
        connection: RabbitMQConnection
    ) = rabbitClient.listQueuesByPattern(pattern, connection)

    /**
     * Gets detailed information about a specific queue.
     *
     * @param queueName The queue name
     * @param connection The connection to use
     * @return The queue or null if it doesn't exist or an error occurs
     */
    fun getQueue(
        queueName: String,
        connection: RabbitMQConnection
    ) = rabbitClient.listQueues(connection).find { it.name == queueName }

    /**
     * Purges a queue, removing all messages.
     *
     * @param queueName The queue name
     * @param connection The connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun purgeQueue(
        queueName: String,
        connection: RabbitMQConnection
    ) = rabbitClient.purgeQueue(queueName, connection)

    /**
     * Consumes messages from a queue in real-time.
     *
     * @param queueName Queue name to consume from
     * @param autoAck Whether messages should be automatically acknowledged
     * @param prefetchCount Number of messages to be prefetched by the consumer
     * @param messageCallback Domain callback to process received messages
     * @param cancellationCallback Domain callback called when the consumer is canceled
     * @param connection Connection to use
     * @return Consumer tag, which can be used to cancel the consumer
     */
    fun consumeMessages(
        queueName: String,
        autoAck: Boolean,
        prefetchCount: Int,
        messageCallback: MessageCallback,
        cancellationCallback: CancellationCallback,
        connection: RabbitMQConnection
    ): String {
        return rabbitClient.consumeMessages(
            queueName = queueName,
            autoAck = autoAck,
            prefetchCount = prefetchCount,
            messageCallback = messageCallback,
            cancellationCallback = cancellationCallback,
            connection = connection
        )
    }

    /**
     * Cancels a consumer.
     *
     * @param consumerTag Consumer tag to cancel
     * @param connection Connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun cancelConsumer(
        consumerTag: String,
        connection: RabbitMQConnection
    ): Boolean {
        return rabbitClient.cancelConsumer(
            consumerTag = consumerTag,
            connection = connection
        )
    }

    /**
     * Safely requeues messages from one queue to another with reliable processing and error handling.
     * This operation retrieves messages from the source queue without acknowledgment, attempts to publish
     * them to the target queue, and acknowledges them in the source queue only if the publishing operation
     * is successful. Each message is handled individually to ensure that failures in processing do not
     * affect other messages in the operation.
     *
     * @param fromQueue The name of the source queue from which messages will be requeued.
     * @param toQueue The name of the destination queue to which messages will be requeued.
     * @param limit The maximum number of messages to requeue in a single operation.
     * @param connection The RabbitMQ connection to be used for the operation.
     * @return An `OperationSummary` containing details about the success and failure of the operation.
     */
    suspend fun safeRequeueMessages(
        fromQueue: String,
        toQueue: String,
        limit: Int,
        connection: RabbitMQConnection
    ): OperationSummary = safeOperationCoordinator.executeOperation(
        operationType = "requeue-messages",
        messagesProvider = {
            rabbitClient.getMessages(fromQueue, limit, true, connection)
        },
        processor = { message ->
            val published = rabbitClient.publishMessage(
                routingKey = toQueue,
                payload = message.payload,
                connection = connection
            )

            if (published) {
                ProcessingResult.Success(message.id.value)
            } else {
                ProcessingResult.Failure(message.id.value, "Failed to publish to target queue")
            }
        }
    )

    /**
     * Safely deletes multiple messages identified by their IDs from a specified queue.
     *
     * This function provides a batch operation capability for safely deleting multiple messages
     * identified by a list of message IDs. It fetches all candidate messages from the queue,
     * filters those matching the provided IDs, and processes them through the safe operation
     * coordinator to ensure reliability and consistency even in failure scenarios.
     *
     * @param messageIds List of unique identifiers for the messages to delete.
     * @param queueName The name of the queue from which the messages will be deleted.
     * @param connection The RabbitMQ connection used for the operation.
     * @return An `OperationSummary` indicating the overall success or failure of the batch deletion.
     */
    suspend fun safeDeleteMessages(
        messageIds: List<CompositeMessageId>,
        queueName: String,
        connection: RabbitMQConnection,
    ): OperationSummary = safeOperationCoordinator.executeOperation(
        operationType = "delete-messages",
        messagesProvider = {
            rabbitClient.getMessages(queueName, Int.MAX_VALUE, true, connection)
                .filter { message -> messageIds.any { it == message.id } }
        },
        processor = { message ->
            val success = rabbitClient.publishMessage(
                message.exchange,
                message.routingKey,
                message.payload,
                connection
            )

            if (success) {
                ProcessingResult.Success(message.id.value)
            } else {
                ProcessingResult.Failure(message.id.value, "Failed to create backup of deleted message")
            }
        }
    )
}