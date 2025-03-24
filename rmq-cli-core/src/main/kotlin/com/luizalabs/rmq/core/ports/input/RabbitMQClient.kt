package com.luizalabs.rmq.core.ports.input

import com.luizalabs.rmq.core.domain.CancellationCallback
import com.luizalabs.rmq.core.domain.Connection
import com.luizalabs.rmq.core.domain.Message
import com.luizalabs.rmq.core.domain.MessageCallback
import com.luizalabs.rmq.core.domain.Queue
import com.luizalabs.rmq.core.domain.RabbitMQConnection
import com.luizalabs.rmq.core.domain.VHost

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
        connectionInfo: Connection
    ): RabbitMQConnection?

    /**
     * Tests a connection with the RabbitMQ broker.
     *
     * @param connectionInfo Connection information
     * @return true if the connection was successful, false otherwise
     */
    fun testConnection(
        connectionInfo: Connection
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
        exchangeName: String,
        routingKey: String,
        payload: ByteArray,
        connection: RabbitMQConnection
    ): Boolean

    /**
     * Finds a message in a queue.
     *
     * @param messageId Message ID
     * @param queueName Queue name
     * @param autoAck If the message should be acknowledged
     * @param connection Connection to use
     * @return Message
     */
    fun findMessage(
        messageId: String,
        queueName: String,
        autoAck: Boolean = false,
        connection: RabbitMQConnection
    ): Message?

    /**
     * Gets messages from a queue.
     *
     * @param queueName Queue name
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
     * Acknowledges a message.
     *
     * @param messageId Message ID
     * @param queueName Queue name
     * @param connection Connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun deleteMessage(
        messageId: String,
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
    fun listQueues(
        connection: RabbitMQConnection
    ): List<Queue>

    /**
     * Lists vhosts of an established connection.
     *
     * @param connection Connection information
     * @return List of vhosts
     */
    fun listVHosts(
        connection: RabbitMQConnection
    ): List<VHost>

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
}