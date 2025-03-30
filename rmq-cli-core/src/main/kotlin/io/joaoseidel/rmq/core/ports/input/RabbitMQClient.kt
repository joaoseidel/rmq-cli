package io.joaoseidel.rmq.core.ports.input

import io.joaoseidel.rmq.core.domain.CancellationCallback
import io.joaoseidel.rmq.core.domain.ConnectionInfo
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.MessageCallback
import io.joaoseidel.rmq.core.domain.Queue
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.domain.VHost
import com.rabbitmq.http.client.Client
import com.rabbitmq.http.client.ClientParameters
import com.rabbitmq.http.client.domain.QueryParameters
import com.rabbitmq.http.client.domain.QueueInfo
import io.github.oshai.kotlinlogging.KotlinLogging
import io.joaoseidel.rmq.core.domain.CompositeMessageId

private val logger = KotlinLogging.logger {}

/**
 * Input port that defines operations that can be performed with a RabbitMQ broker.
 * This interface is implemented by external adapters that connect to RabbitMQ.
 */
interface RabbitMQClient {

    /**
     * Establishes a connection with the RabbitMQ broker.
     *
     * @param connectionInfo Connection information
     * @return true if the connection was successful, false otherwise
     */
    fun connect(
        connectionInfo: ConnectionInfo
    ): RabbitMQConnection?

    /**
     * Tests a connection with the RabbitMQ broker.
     *
     * @param connectionInfo Connection information
     * @return true if the connection was successful, false otherwise
     */
    fun testConnection(
        connectionInfo: ConnectionInfo
    ): Boolean

    /**
     * Publishes a message to an exchange.
     *
     * @param exchangeName Name of the exchange
     * @param routingKey Routing key
     * @param payload Message payload
     * @param connection Connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun publishMessage(
        exchangeName: String? = null,
        routingKey: String,
        payload: String,
        connection: RabbitMQConnection
    ): Boolean

    /**
     * Gets messages from a queue using exact queue name.
     * Use this for operations that modify state.
     *
     * @param queueName Exact queue name
     * @param count Number of messages to get
     * @param ack If the messages should be acknowledged
     * @param connection Connection to use
     * @return List of messages
     */
    fun getMessages(
        queueName: String,
        count: Int,
        ack: Boolean = false,
        connection: RabbitMQConnection
    ): List<Message>

    /**
     * Gets messages from queues matching a pattern.
     * Use this for search/listing operations only.
     *
     * @param queueNamePattern Pattern to filter queues (Glob syntax)
     * @param count Number of messages to get per queue
     * @param ack If the messages should be acknowledged
     * @param connection Connection to use
     * @return List of messages
     */
    fun getMessagesByPattern(
        queueNamePattern: String,
        count: Int,
        ack: Boolean,
        connection: RabbitMQConnection
    ): List<Message> {
        val queues = listQueuesByPattern(queueNamePattern, connection)
        val allMessages = mutableListOf<Message>()

        for (queue in queues) {
            val messagesPerQueue = getMessages(queue.name, count, ack, connection)
            allMessages.addAll(messagesPerQueue)
        }

        return allMessages
    }

    /**
     * Finds a message by ID in a specific queue.
     *
     * @param messageId Message ID
     * @param queueName Exact queue name
     * @param autoAck If the message should be acknowledged
     * @param connection Connection to use
     * @return Message if found, null otherwise
     */
    fun findMessage(
        messageId: CompositeMessageId,
        queueName: String,
        autoAck: Boolean,
        connection: RabbitMQConnection
    ): Message? {
        return getMessages(queueName, Int.MAX_VALUE, autoAck, connection)
            .find { it.id == messageId }
    }

    /**
     * Finds a message by ID in queues matching a pattern.
     *
     * @param messageId Message ID
     * @param queueNamePattern Pattern to filter queues (Glob syntax)
     * @param autoAck If the message should be acknowledged
     * @param connection Connection to use
     * @return Message if found, null otherwise
     */
    fun findMessageByPattern(
        messageId: CompositeMessageId,
        queueNamePattern: String,
        autoAck: Boolean,
        connection: RabbitMQConnection
    ): Message? {
        return getMessagesByPattern(queueNamePattern, Int.MAX_VALUE, autoAck, connection)
            .find { it.id == messageId }
    }

    /**
     * Acknowledges a message.
     *
     * @param messageId Message ID
     * @param queueName Queue name
     * @param connection Connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun deleteMessage(
        messageId: CompositeMessageId,
        queueName: String,
        connection: RabbitMQConnection
    ): Boolean

    /**
     * Purges a queue.
     *
     * @param queueName Queue name
     * @param connection Connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun purgeQueue(
        queueName: String,
        connection: RabbitMQConnection
    ): Boolean

    /**
     * Lists queues of an established connection.
     *
     * @param connection Connection information
     * @return List of queues
     */
    fun listQueues(connection: RabbitMQConnection): List<Queue> =
        listQueues(null, connection)

    /**
     * Lists queues that match a specific pattern.
     *
     * @param pattern Pattern to filter queues (Glob syntax: *, ?)
     * @param connection Connection information
     * @return List of queues matching the pattern
     */
    fun listQueuesByPattern(pattern: String, connection: RabbitMQConnection): List<Queue> =
        listQueues(pattern, connection)

    /**
     * Lists queues of an established connection with optional pattern filtering.
     *
     * @param pattern Pattern to filter queues (Glob syntax: *, ?) (null means no filtering)
     * @param connection Connection information
     * @return List of queues matching the pattern
     */
    fun listQueues(
        pattern: String?,
        connection: RabbitMQConnection
    ) = withHttpClient(connection.connectionInfo) { client ->
        try {
            val vHostName = connection.connectionInfo.vHost.name
            val queueList = mutableListOf<QueueInfo>()
            var queryParameters = QueryParameters()

            // Setup necessary columns to work with the response
            queryParameters
                .columns()
                .add("name")
                .add("vhost")
                .add("messages_ready")
                .add("messages_unacknowledged")
                .sort("messages_unacknowledged")
                .sortReverse(true)

            // Setup pagination
            queryParameters
                .pagination()
                .pageSize(20)

            // Setup pattern filtering
            pattern?.let { queryParameters.name(pattern, true) }

            // Paginate through all queues
            var queuesPage = client.getQueues(vHostName, queryParameters)
            queueList.addAll(queuesPage?.itemsAsList ?: emptyList())

            while (queuesPage.pageCount > 1) {
                queryParameters = queryParameters.pagination().nextPage(queuesPage).query()

                queuesPage = client.getQueues(vHostName, queryParameters)
                queuesPage.let { queueList.addAll(it.itemsAsList) }

                if (queuesPage == null || queuesPage.page >= queuesPage.pageCount) break
            }

            // Convert to domain objects
            queueList.map {
                Queue(
                    name = it.name,
                    vhost = it.vhost,
                    messagesReady = it.messagesReady,
                    messagesUnacknowledged = it.messagesUnacknowledged,
                )
            }
        } catch (e: Exception) {
            logger.error(e) { "Failed to list queues: ${e.message}" }
            emptyList()
        }
    }

    /**
     * Lists vhosts of an established connection.
     *
     * @param connection Connection information
     * @return List of vhosts
     */
    fun listVHosts(
        connection: RabbitMQConnection
    ) = withHttpClient(connection.connectionInfo) { client ->
        try {
            val vHostList = client.vhosts?.map {
                VHost(
                    name = it.name,
                    description = it.description,
                    isDefault = connection.connectionInfo.vHost.name == it.name
                )
            }

            vHostList ?: emptyList()
        } catch (e: Exception) {
            logger.error { "Failed to list vhosts: ${e.message}" }
            emptyList()
        }
    }

    /**
     * Consumes messages from a queue.
     *
     * @param queueName Queue name
     * @param autoAck If the messages should be acknowledged
     * @param prefetchCount Number of messages to prefetch
     * @param messageCallback Callback to be called when a message is received
     * @param cancellationCallback Callback to be called when the consumer is cancelled
     * @param connection Connection to use
     * @return Consumer tag
     */
    fun consumeMessages(
        queueName: String,
        autoAck: Boolean,
        prefetchCount: Int,
        messageCallback: MessageCallback,
        cancellationCallback: CancellationCallback,
        connection: RabbitMQConnection
    ): String

    /**
     * Cancels a consumer.
     *
     * @param consumerTag Consumer tag
     * @param connection Connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun cancelConsumer(
        consumerTag: String,
        connection: RabbitMQConnection
    ): Boolean

    /**
     * Wrapper function to execute a block of code with an HTTP client.
     *
     * @param connectionInfo Connection information
     * @param block Block of code to execute
     */
    fun <T> withHttpClient(connectionInfo: ConnectionInfo, block: (Client) -> T): T {
        val client = Client(
            ClientParameters()
                .url(connectionInfo.getHttpApiUrl())
                .username(connectionInfo.username)
                .password(connectionInfo.password)
        )

        return block(client)
    }
}