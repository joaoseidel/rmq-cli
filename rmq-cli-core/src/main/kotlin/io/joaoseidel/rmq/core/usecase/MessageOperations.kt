package io.joaoseidel.rmq.core.usecase

import io.github.oshai.kotlinlogging.KotlinLogging
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.domain.OperationSummary
import io.joaoseidel.rmq.core.domain.ProcessingResult
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.ports.input.RabbitMQClient
import io.joaoseidel.rmq.core.ports.output.SafeOperationCoordinator
import io.joaoseidel.rmq.core.toGlobRegex
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
    private val safeOperationCoordinator: SafeOperationCoordinator by inject(SafeOperationCoordinator::class.java)

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
        payload: String,
        connection: RabbitMQConnection,
    ) = rabbitClient.publishMessage(
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
        payload: String,
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
        messageId: CompositeMessageId,
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
        val queues =
            if (queueName != null) {
                listOf(queueName)
            } else {
                rabbitClient.listQueuesByPattern(queueNamePattern ?: ".", connection).map { it.name }
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
                    if (
                        regex.containsMatchIn(message.payload) ||
                        regex.containsMatchIn(message.id.value)
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
                    if (messageRegex.containsMatchIn(message.payload) ||
                        messageRegex.containsMatchIn(message.id.value)
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
     * Safely deletes a message from a specified queue.
     *
     * This function ensures reliable deletion of a message identified by its ID from a queue
     * using the given RabbitMQ connection. It fetches messages from the queue to locate the
     * target message and then attempts to delete it. The operation is executed through a
     * `SafeOperationCoordinator` to handle failures gracefully and ensure consistency.
     *
     * @param messageId The unique identifier of the message to delete.
     * @param queueName The name of the queue from which the message will be deleted.
     * @param connection The RabbitMQ connection used for the operation.
     * @return An `OperationSummary` indicating the success or failure of the deletion operation.
     */
    suspend fun safeDeleteMessage(
        messageId: CompositeMessageId,
        queueName: String,
        connection: RabbitMQConnection,
    ): OperationSummary = safeOperationCoordinator.executeOperation(
        operationType = "delete-message",
        messagesProvider = {
            rabbitClient.getMessages(queueName, Int.MAX_VALUE, true, connection)
                .filter { it.id == messageId }
        },
        processor = { message ->
            val success = rabbitClient.publishMessage(message.exchange, message.routingKey, message.payload, connection)

            if (success) {
                ProcessingResult.Success(message.id.value)
            } else {
                ProcessingResult.Failure(message.id.value, "Failed to republish acked message")
            }
        }
    )

    /**
     * Safely reprocesses a message by republishing it to its original exchange.
     *
     * This function attempts to republish the provided message to its defined exchange and routing key
     * using the specified RabbitMQ connection. If the message belongs to a specific queue, and the republish
     * operation succeeds, it optionally fetches the message back for further processing. The operation is
     * executed through a `SafeOperationCoordinator` to ensure resilience against failures and proper handling
     * of state transitions.
     *
     * @param message The message to be reprocessed.
     * @param connection The RabbitMQ connection to be used for the operation.
     * @return An `OperationSummary` summarizing the success or failure of the reprocess operation for the message.
     */
    suspend fun safeReprocessMessage(
        message: Message,
        connection: RabbitMQConnection,
    ): OperationSummary {
        val operationResult = safeDeleteMessage(message.id, message.routingKey, connection)

        if (operationResult.failed > 0) {
            return operationResult
        }

        return safeOperationCoordinator.executeOperation(
            operationType = "reprocess-message",
            messagesProvider = { listOf(message) },
            processor = { msg ->
                val published =
                    rabbitClient.publishMessage(
                        msg.exchange,
                        msg.routingKey,
                        msg.payload,
                        connection,
                    )
                if (published) {
                    ProcessingResult.Success(msg.id.value)
                } else {
                    ProcessingResult.Failure(msg.id.value, "Failed to republish message")
                }
            }
        )
    }

    /**
     * Safely requeues a message to a specified target queue, ensuring reliability and consistency.
     *
     * This function attempts to publish the provided message to the target queue. In case the
     * message was successfully published, it optionally acknowledges the message in its original
     * queue. The operation is orchestrated using a safe operation coordinator to handle any
     * potential failure scenarios gracefully.
     *
     * @param message The message to be requeued.
     * @param toQueue The name of the target queue where the message should be requeued.
     * @param connection The RabbitMQ connection to be used for the operation.
     * @return An `OperationSummary` detailing the result of the requeue operation, including
     *         success or failure for the processed message.
     */
    suspend fun safeRequeueMessage(
        message: Message,
        toQueue: String,
        connection: RabbitMQConnection,
    ): OperationSummary = safeOperationCoordinator.executeOperation(
        operationType = "requeue-message",
        messagesProvider = { listOf(message) },
        processor = {
            val published =
                rabbitClient.publishMessage(
                    it.exchange,
                    toQueue,
                    it.payload,
                    connection,
                )

            if (published) {
                rabbitClient.getMessages(it.routingKey, 1, true, connection)
                ProcessingResult.Success(it.id.value)
            } else {
                ProcessingResult.Failure(it.id.value, "Failed to publish to target queue")
            }
        }
    )
}
