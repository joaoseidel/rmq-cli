package com.luizalabs.rmq.core.usecase

import com.luizalabs.rmq.core.domain.CancellationCallback
import com.luizalabs.rmq.core.domain.MessageCallback
import com.luizalabs.rmq.core.domain.Queue
import com.luizalabs.rmq.core.domain.RabbitMQConnection
import com.luizalabs.rmq.core.ports.input.RabbitMQClient
import com.luizalabs.rmq.core.toGlobRegex
import io.github.oshai.kotlinlogging.KotlinLogging
import org.koin.core.annotation.Singleton
import org.koin.java.KoinJavaComponent.inject

private val logger = KotlinLogging.logger {}

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
     * Requeues all messages from one queue to another.
     *
     * @param fromQueue The queue name
     * @param toQueue The queue name
     * @param limit The maximum number of messages to requeue
     * @param connection The connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun requeueMessages(
        fromQueue: String,
        toQueue: String,
        limit: Int,
        connection: RabbitMQConnection
    ): Int {
        val messages = rabbitClient.getMessages(fromQueue, limit, true, connection).ifEmpty { null }
            ?: return 0

        messages.forEach {
            rabbitClient.publishMessage("", toQueue, it.payload, connection)
        }

        return messages.size
    }

    /**
     * Reprocess all messages from one queue.
     *
     * @param queueName The queue name
     * @param limit The maximum number of messages to reprocess
     * @param connection The connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun reprocessMessages(
        queueName: String,
        limit: Int,
        connection: RabbitMQConnection
    ): Int {
        val messages = rabbitClient.getMessages(queueName, limit, true, connection).ifEmpty { null }
            ?: return 0

        messages.forEach {
            rabbitClient.publishMessage(it.exchange, it.routingKey, it.payload, connection)
        }

        return messages.size
    }

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
}