package io.joaoseidel.rmq.app.adapter.ports.input

import com.rabbitmq.client.AMQP
import com.rabbitmq.client.CancelCallback
import com.rabbitmq.client.ConnectionFactory
import com.rabbitmq.client.DeliverCallback
import io.github.oshai.kotlinlogging.KotlinLogging
import io.joaoseidel.rmq.core.domain.CancellationCallback
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.domain.ConnectionInfo
import io.joaoseidel.rmq.core.domain.ConnectionInfo.AmqpConnectionInfo
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.MessageCallback
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.ports.input.RabbitMQClient
import kotlin.text.Charsets.UTF_8

private val logger = KotlinLogging.logger {}

internal class AmqpRabbitMQClient : RabbitMQClient {

    override fun connect(connectionInfo: ConnectionInfo): RabbitMQConnection? {
        return try {
            if (connectionInfo is AmqpConnectionInfo) {
                val factory = ConnectionFactory()
                factory.host = connectionInfo.host
                factory.port = connectionInfo.amqpPort
                factory.username = connectionInfo.username
                factory.password = connectionInfo.password
                factory.virtualHost = connectionInfo.vHost.name
                factory.isAutomaticRecoveryEnabled = true

                val connection = factory.newConnection()
                val channel = connection.createChannel()

                return RabbitMQConnection(channel, connection, connectionInfo)
            }

            null
        } catch (e: Exception) {
            logger.error { "Failed to connect to RabbitMQ: ${e.message}" }
            null
        }
    }

    override fun testConnection(connectionInfo: ConnectionInfo) =
        connect(connectionInfo) != null

    override fun publishMessage(
        exchangeName: String?,
        routingKey: String,
        payload: String,
        connection: RabbitMQConnection
    ): Boolean {
        try {
            val channel = connection.channel ?: run {
                throw IllegalStateException("Channel is not available")
            }

            channel.basicPublish(
                exchangeName ?: "amq.default",
                routingKey,
                AMQP.BasicProperties.Builder().build(),
                payload.toByteArray(charset(UTF_8.name()))
            )

            return true
        } catch (e: Exception) {
            logger.error { "Failed to publish message: ${e.message}" }
            return false
        }
    }

    override fun getMessages(
        queueName: String,
        count: Int,
        ack: Boolean,
        connection: RabbitMQConnection
    ): List<Message> {
        try {
            val channel = connection.channel ?: run {
                throw IllegalStateException("Channel is not available")
            }

            val messages = mutableListOf<Message>()

            for (i in 1..count) {
                val response = channel.basicGet(queueName, ack) ?: break
                val message = Message.AmqpMessage.from(response.envelope, response.body, response.props)
                messages.add(message)
            }

            return messages
        } catch (e: Exception) {
            logger.error { "Failed to get messages from queue $queueName: ${e.message}" }
            return emptyList()
        }
    }

    override fun deleteMessage(
        messageId: CompositeMessageId,
        queueName: String,
        connection: RabbitMQConnection
    ): Boolean {
        try {
            val messages = getMessages(
                queueName = queueName,
                count = Int.MAX_VALUE,
                ack = true,
                connection = connection
            )

            messages
                .filter { it.id != messageId }
                .forEach {
                    publishMessage(
                        exchangeName = it.exchange,
                        routingKey = it.routingKey,
                        payload = it.payload,
                        connection = connection
                    )
                }

            return messages.any { it.id == messageId }
        } catch (e: Exception) {
            logger.error { "Failed to delete message $messageId from queue $queueName: ${e.message}" }
            return false
        }
    }

    override fun purgeQueue(
        queueName: String,
        connection: RabbitMQConnection
    ): Boolean {
        try {
            val channel = connection.channel ?: run {
                throw IllegalStateException("Channel is not available")
            }

            channel.queuePurge(queueName)

            return true
        } catch (e: Exception) {
            logger.error { "Failed to purge queue $queueName: ${e.message}" }
            return false
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
        try {
            val channel = connection.channel ?: run {
                throw IllegalStateException("Channel is not available")
            }

            if (prefetchCount > 0) {
                channel.basicQos(prefetchCount)
            }

            val deliverCallback = DeliverCallback { consumerTag, delivery ->
                val message = Message.AmqpMessage.from(delivery)
                messageCallback.handle(consumerTag, message)
            }

            val cancelCallback = CancelCallback { consumerTag ->
                cancellationCallback.handle(consumerTag)
            }

            val consumerTag = channel.basicConsume(
                queueName,
                autoAck,
                deliverCallback,
                cancelCallback
            )

            return consumerTag
        } catch (e: Exception) {
            logger.error { "Failed to start consumer for queue $queueName: ${e.message}" }
            throw e
        }
    }

    override fun cancelConsumer(
        consumerTag: String,
        connection: RabbitMQConnection
    ): Boolean {
        try {
            val channel = connection.channel ?: run {
                throw IllegalStateException("Channel is not available")
            }

            channel.basicCancel(consumerTag)

            return true
        } catch (e: Exception) {
            logger.error { "Failed to cancel consumer $consumerTag: ${e.message}" }
            return false
        }
    }
}