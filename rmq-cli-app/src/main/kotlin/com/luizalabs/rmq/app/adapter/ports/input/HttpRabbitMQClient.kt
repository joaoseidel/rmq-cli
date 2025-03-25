package com.luizalabs.rmq.app.adapter.ports.input

import com.luizalabs.rmq.core.domain.CancellationCallback
import com.luizalabs.rmq.core.domain.ConnectionInfo
import com.luizalabs.rmq.core.domain.Message
import com.luizalabs.rmq.core.domain.MessageCallback
import com.luizalabs.rmq.core.domain.RabbitMQConnection
import com.luizalabs.rmq.core.ports.input.RabbitMQClient
import com.rabbitmq.http.client.GetAckMode.ACK_REQUEUE_FALSE
import com.rabbitmq.http.client.GetAckMode.NACK_REQUEUE_TRUE
import com.rabbitmq.http.client.GetEncoding
import com.rabbitmq.http.client.domain.OutboundMessage
import io.github.oshai.kotlinlogging.KotlinLogging
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
        exchangeName: String,
        routingKey: String,
        payload: ByteArray,
        connection: RabbitMQConnection
    ) = withHttpClient(connection.connectionInfo) { client ->
        try {
            val vHost = connection.connectionInfo.vHost.name
            val message = OutboundMessage().payload(String(payload, UTF_8))

            client.publish(vHost, exchangeName, routingKey, message)
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
                ?.map {
                    Message(
                        id = "it.properties",
                        exchange = "it.exchange",
                        routingKey = it.routingKey,
                        payload = it.payload.toByteArray(),
                        properties = emptyMap()
                    )
                }
                ?: emptyList()

            messageList
        } catch (e: Exception) {
            logger.error { "Failed to get messages from queue $queueName: ${e.message}" }
            emptyList()
        }
    }

    override fun deleteMessage(
        messageId: String,
        queueName: String,
        connection: RabbitMQConnection
    ): Boolean {
        return try {
            val messages = getMessages(queueName, Int.MAX_VALUE, true, connection)

            val found = messages.any { it.id == messageId }
            if (!found) return false

            val messagesToKeep = messages.filter { it.id != messageId }
            for (message in messagesToKeep) {
                publishMessage(
                    exchangeName = message.exchange,
                    routingKey = message.routingKey,
                    payload = message.payload,
                    connection = connection
                )
            }

            true
        } catch (e: Exception) {
            logger.error { "Failed to delete message $messageId from queue $queueName: ${e.message}" }
            false
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