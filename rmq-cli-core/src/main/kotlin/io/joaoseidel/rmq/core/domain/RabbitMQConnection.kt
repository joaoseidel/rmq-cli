package io.joaoseidel.rmq.core.domain

import com.rabbitmq.client.Channel
import com.rabbitmq.client.Connection
import io.github.oshai.kotlinlogging.KotlinLogging

private val logger = KotlinLogging.logger {}

/**
 * Represents an active connection to a RabbitMQ broker with associated channel.
 *
 * This class wraps the standard RabbitMQ client's connection and channel objects,
 * providing connection lifecycle management functionality. It implements the AutoCloseable
 * interface to enable usage with try-with-resources patterns.
 *
 * Typical usage:
 * ```
 * // Automatic resource management (connection closes after block)
 * withConnection { connection ->
 *     // Perform operations with connection
 * }
 *
 * // Manual resource management
 * val connection = connect(connectionInfo)
 * try {
 *     connection.keepAlive() // Prevent automatic closing
 *     // Perform initial operations
 *
 *     // Later in the code or another method
 *     // Continue using the connection
 *
 *     connection.release() // Allow connection to close
 * } finally {
 *     connection.close()
 * }
 * ```
 *
 * @property channel Active RabbitMQ channel for messaging operations
 * @property connection Underlying RabbitMQ connection
 * @property connectionInfo Domain model containing connection parameters
 * @property keepAlive Internal state to control connection lifecycle
 */
class RabbitMQConnection(
    val channel: Channel?,
    val connection: Connection?,
    val connectionInfo: ConnectionInfo,
    private var keepAlive: Boolean = false
) : AutoCloseable {

    override fun close() {
        if (keepAlive) {
            logger.debug { "Close called on connection, but keepAlive is enabled" }
            return
        }

        try {
            if (channel?.isOpen == true) channel.close()
            if (connection?.isOpen == true) connection.close()
        } catch (e: Exception) {
            logger.error { "Error closing connection: ${e.message}" }
        }
    }

    fun keepAlive() {
        keepAlive = true
    }

    fun release() {
        keepAlive = false
    }
}

/**
 * Callback interface for handling message delivery in a domain-centric way.
 */
interface MessageCallback {

    /**
     * Called when a message is delivered from a queue.
     *
     * @param consumerTag the consumer tag associated with the consumer
     * @param message the delivered message from our domain model
     */
    fun handle(consumerTag: String, message: Message)
}

/**
 * Callback interface for handling consumer cancellation in a domain-centric way.
 */
interface CancellationCallback {

    /**
     * Called when the consumer is cancelled, either by explicit cancellation or
     * when the channel or connection is closed.
     *
     * @param consumerTag the consumer tag associated with the consumer
     */
    fun handle(consumerTag: String)
}