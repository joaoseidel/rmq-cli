package io.joaoseidel.rmq.core.domain

import kotlinx.serialization.Serializable

/**
 * Represents a queue in RabbitMQ.
 *
 * @property name Queue name
 * @property vhost Virtual host where the queue is located
 * @property messagesReady Number of messages ready for delivery
 * @property messagesUnacknowledged Number of messages that have been delivered but not acknowledged
 */
@Serializable
data class Queue(
    val name: String,
    val vhost: String,
    val messagesReady: Long = 0,
    val messagesUnacknowledged: Long = 0,
) {
    val totalMessages: Long
        get() = messagesReady + messagesUnacknowledged

    val isEmpty: Boolean
        get() = totalMessages == 0L
}