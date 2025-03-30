package io.joaoseidel.rmq.app.adapter.ports.input

import com.rabbitmq.http.client.GetAckMode.ACK_REQUEUE_FALSE
import com.rabbitmq.http.client.GetAckMode.NACK_REQUEUE_TRUE
import com.rabbitmq.http.client.GetEncoding
import com.rabbitmq.http.client.domain.OutboundMessage
import io.github.oshai.kotlinlogging.KotlinLogging
import io.joaoseidel.rmq.core.domain.CancellationCallback
import io.joaoseidel.rmq.core.domain.ConnectionInfo
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.MessageCallback
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.ports.input.RabbitMQClient
import kotlin.text.Charsets.UTF_8

private val logger = KotlinLogging.logger {}

internal class HttpRabbitMQClient : RabbitMQClient {

    override fun connect(connectionInfo: ConnectionInfo) =
        RabbitMQConnection(
            channel = null,
            connection = null,
            connectionInfo = connectionInfo,
        )

    override fun testConnection(connectionInfo: ConnectionInfo) = withHttpClient(connectionInfo) { client ->
        try {
            client.whoAmI() != null
        } catch (e: Exception) {
            logger.error { "Failed to connect to RabbitMQ via HTTP API: ${e.message}" }
            false
        }
    }

    override fun publishMessage(
        exchangeName: String?,
        routingKey: String,
        payload: String,
        connection: RabbitMQConnection
    ) = withHttpClient(connection.connectionInfo) { client ->
        try {
            val vHost = connection.connectionInfo.vHost.name
            val message =
                OutboundMessage()
                    .payload(payload)

            client.publish(vHost, exchangeName ?: "amq.default", routingKey, message)
        } catch (e: Exception) {
            logger.error { "Failed to publish message: ${e.message}" }
            false
        }
    }

    override fun getMessages(
        queueName: String,
        count: Int,
        ack: Boolean,
        connection: RabbitMQConnection
    ) = withHttpClient(connection.connectionInfo) { client ->
        try {
            val vHostName = connection.connectionInfo.vHost.name
            val ackMode = if (ack) ACK_REQUEUE_FALSE else NACK_REQUEUE_TRUE

            val messageList = client.get(vHostName, queueName, count, ackMode, GetEncoding.AUTO)
                ?.map { Message.HttpMessage.from(it) }
                ?: emptyList()

            messageList
        } catch (e: Exception) {
            logger.error { "Failed to get messages from queue $queueName: ${e.message}" }
            emptyList()
        }
    }

    override fun purgeQueue(
        queueName: String,
        connection: RabbitMQConnection
    ) = withHttpClient(connection.connectionInfo) { client ->
        try {
            client.purgeQueue(connection.connectionInfo.vHost.name, queueName)
            true
        } catch (e: Exception) {
            logger.error { "Failed to purge queue $queueName: ${e.message}" }
            false
        }
    }

    override fun consumeMessages(
        queueName: String,
        autoAck: Boolean,
        prefetchCount: Int,
        messageCallback: MessageCallback,
        cancellationCallback: CancellationCallback,
        connection: RabbitMQConnection
    ): String {
        throw UnsupportedOperationException("Real-time message consumption is not supported over HTTP API")
    }

    override fun cancelConsumer(
        consumerTag: String,
        connection: RabbitMQConnection
    ): Boolean {
        throw UnsupportedOperationException("Cancelling consumers is not supported over HTTP API")
    }
}