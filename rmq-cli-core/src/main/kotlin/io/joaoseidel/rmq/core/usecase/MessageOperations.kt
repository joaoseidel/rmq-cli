package io.joaoseidel.rmq.core.usecase

import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.ports.input.RabbitMQClient
import io.joaoseidel.rmq.core.toGlobRegex
import io.github.oshai.kotlinlogging.KotlinLogging
import org.koin.core.annotation.Singleton
import org.koin.java.KoinJavaComponent.inject

private val logger = KotlinLogging.logger {}

/**
 * Use case that manages operations related to RabbitMQ messages.
 *
 * @property rabbitClient RabbitMQ client for message operations
 */
@Singleton
class MessageOperations {
    private val rabbitClient: RabbitMQClient by inject(RabbitMQClient::class.java)

    /**
     * Publishes a message to a queue.
     *
     * @param queueName Name of the queue
     * @param payload Message to be published
     * @param connection Connection to use
     * @return true if successful, false otherwise
     */
    fun publishToQueue(
        queueName: String,
        payload: ByteArray,
        connection: RabbitMQConnection
    ) = rabbitClient.publishMessage(
        exchangeName = "",
        routingKey = queueName,
        payload = payload,
        connection = connection
    )

    /**
     * Publishes a message to an exchange.
     *
     * @param exchangeName Name of the exchange
     * @param routingKey Routing key for the message
     * @param payload Message to be published
     * @param connection Connection to use
     * @return true if successful, false otherwise
     */
    fun publishToExchange(
        exchangeName: String,
        routingKey: String,
        payload: ByteArray,
        connection: RabbitMQConnection
    ) = rabbitClient.publishMessage(
        exchangeName = exchangeName,
        routingKey = routingKey,
        payload = payload,
        connection = connection
    )

    /**
     * Finds a message by its ID in a queue.

     * @param messageId ID of the message to find
     * @param queueName Name of the queue
     * @param connection Connection to use
     * @return Message if found, null otherwise
     */
    fun findMessage(
        messageId: String,
        queueName: String,
        connection: RabbitMQConnection
    ) = rabbitClient.findMessage(
        messageId = messageId,
        queueName = queueName,
        autoAck = false,
        connection = connection
    )

    /**
     * Searches for messages in queues that match a pattern.
     *
     * @param pattern Pattern to search for (supports glob patterns)
     * @param queueName Specific queue name (exact)
     * @param queueNamePattern Pattern to filter queues by name (supports glob patterns)
     * @param count Maximum number of messages to search
     * @param connection Connection to use
     * @return List of messages that match the pattern
     */
    fun searchMessages(
        pattern: String,
        queueName: String? = null,
        queueNamePattern: String? = null,
        count: Int = 100,
        connection: RabbitMQConnection
    ): List<Message> {
        val queues = if (queueName != null) {
            listOf(queueName)
        } else {
            rabbitClient.listQueuesByPattern(queueNamePattern ?: "*", connection).map { it.name }
        }

        val regex = pattern.toGlobRegex()
        val matchingMessages = mutableListOf<Message>()

        for (queue in queues) {
            val messages = rabbitClient.getMessages(
                queueName = queue,
                count = count,
                ack = false,
                connection = connection
            )

            for (message in messages) {
                try {
                    val bodyText = message.bodyAsString()

                    if (
                        regex.containsMatchIn(bodyText) ||
                        regex.containsMatchIn(message.id ?: "")
                    ) {
                        matchingMessages.add(message)
                    }
                } catch (e: Exception) {
                    logger.warn { "Message with ID ${message.id} ignored: ${e.message}" }
                }
            }
        }

        return matchingMessages
    }

    /**
     * Searches for messages in queues that match a pattern.
     *
     * @param messagePattern Pattern to search for (supports glob patterns)
     * @param queuePattern Pattern to filter queues by name (supports glob patterns)
     * @param messageLimit Maximum number of messages to search
     * @param ack Whether to acknowledge the messages
     * @param connection Connection to use
     * @return List of messages that match the pattern
     */
    fun searchMessagesInQueuesByPattern(
        messagePattern: String,
        queuePattern: String,
        messageLimit: Int = 100,
        ack: Boolean = false,
        connection: RabbitMQConnection
    ): List<Message> {
        val matchingQueues = rabbitClient.listQueuesByPattern(queuePattern, connection)

        if (matchingQueues.isEmpty()) {
            return emptyList()
        }

        val messageRegex = messagePattern.toGlobRegex()
        val matchingMessages = mutableListOf<Message>()

        for (queue in matchingQueues) {
            val messages = rabbitClient.getMessages(
                queueName = queue.name,
                count = messageLimit,
                ack = ack,
                connection = connection
            )

            for (message in messages) {
                try {
                    val bodyText = message.bodyAsString()

                    if (messageRegex.containsMatchIn(bodyText) ||
                        messageRegex.containsMatchIn(message.id ?: "")
                    ) {
                        matchingMessages.add(message)
                    }
                } catch (e: Exception) {
                    logger.warn { "Message with ID ${message.id} ignored: ${e.message}" }
                }
            }
        }

        return matchingMessages
    }


    /**
     * Gets messages from a queue.
     *
     * @param queueName Name of the queue
     * @param count Maximum number of messages to get
     * @param ack Whether to acknowledge the messages
     * @param connection Connection to use
     * @return List of messages
     */
    fun getMessages(
        queueName: String,
        count: Int,
        ack: Boolean,
        connection: RabbitMQConnection
    ) = rabbitClient.getMessages(
        queueName = queueName,
        count = count,
        ack = ack,
        connection = connection
    )

    /**
     * Gets messages from queues that match a pattern.
     *
     * @param queueNamePattern Pattern to filter queues by name (supports glob patterns)
     * @param messageLimit Maximum number of messages to get
     * @param ack Whether to acknowledge the messages
     * @param connection Connection to use
     * @return List of messages
     */
    fun getMessagesFromQueuesByPattern(
        queueNamePattern: String,
        messageLimit: Int = 100,
        ack: Boolean = false,
        connection: RabbitMQConnection
    ): List<Message> {
        val matchingQueues = rabbitClient.listQueuesByPattern(queueNamePattern, connection)

        if (matchingQueues.isEmpty()) {
            return emptyList()
        }

        val allMessages = mutableListOf<Message>()
        for (queue in matchingQueues) {
            val messages = rabbitClient.getMessages(
                queueName = queue.name,
                count = messageLimit,
                ack = ack,
                connection = connection
            )
            allMessages.addAll(messages)
        }

        return allMessages
    }

    /**
     * Reprocesses a message by publishing it to its original exchange.
     *
     * @param message Message to reprocess
     * @param connection Connection to use
     * @return true if successful, false otherwise
     */
    fun reprocessMessage(
        message: Message,
        connection: RabbitMQConnection
    ): Boolean {
        return publishToExchange(
            exchangeName = message.exchange,
            routingKey = message.routingKey,
            payload = message.payload,
            connection = connection
        )
    }

    /**
     * Requeues a message to a different queue.
     *
     * @param message Message to requeue
     * @param toQueue Name of the queue to requeue the message to
     * @param connection Connection to use
     * @return true if successful, false otherwise
     */
    fun requeueMessage(
        message: Message,
        toQueue: String,
        connection: RabbitMQConnection
    ): Boolean {
        return publishToQueue(
            queueName = toQueue,
            payload = message.payload,
            connection = connection
        )
    }

    /**
     * Deletes a message from a queue.
     *
     * @param messageId ID of the message to delete
     * @param queueName Name of the queue
     * @param connection Connection to use
     * @return true if successful, false otherwise
     */
    fun deleteMessage(
        messageId: String,
        queueName: String,
        connection: RabbitMQConnection
    ) = rabbitClient.deleteMessage(
        messageId = messageId,
        queueName = queueName,
        connection = connection
    )
}