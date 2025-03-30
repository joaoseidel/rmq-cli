package io.joaoseidel.rmq.app.adapter.ports.input

import io.joaoseidel.rmq.core.domain.CancellationCallback
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.domain.ConnectionInfo
import io.joaoseidel.rmq.core.domain.MessageCallback
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.ports.input.RabbitMQClient
import org.koin.core.annotation.Singleton

@Singleton
class RabbitMQClient : RabbitMQClient {
    private val amqpRabbitMQClient = AmqpRabbitMQClient()
    private val httpRabbitMQClient = HttpRabbitMQClient()

    override fun connect(connectionInfo: ConnectionInfo) =
        when (connectionInfo) {
            is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.connect(connectionInfo)
            is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.connect(connectionInfo)
        }

    override fun testConnection(connectionInfo: ConnectionInfo) =
        when (connectionInfo) {
            is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.testConnection(connectionInfo)
            is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.testConnection(connectionInfo)
        }

    override fun publishMessage(
        exchangeName: String?,
        routingKey: String,
        payload: String,
        connection: RabbitMQConnection
    ) = when (connection.connectionInfo) {
        is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.publishMessage(
            exchangeName,
            routingKey,
            payload,
            connection
        )

        is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.publishMessage(
            exchangeName,
            routingKey,
            payload,
            connection
        )
    }

    override fun getMessages(
        queueName: String,
        count: Int,
        ack: Boolean,
        connection: RabbitMQConnection
    ) = when (connection.connectionInfo) {
        is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.getMessages(queueName, count, ack, connection)
        is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.getMessages(queueName, count, ack, connection)
    }

    override fun deleteMessage(
        messageId: CompositeMessageId,
        queueName: String,
        connection: RabbitMQConnection
    ) = when (connection.connectionInfo) {
        is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.deleteMessage(messageId, queueName, connection)
        is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.deleteMessage(messageId, queueName, connection)
    }

    override fun purgeQueue(queueName: String, connection: RabbitMQConnection) =
        when (connection.connectionInfo) {
            is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.purgeQueue(queueName, connection)
            is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.purgeQueue(queueName, connection)
        }

    override fun consumeMessages(
        queueName: String,
        autoAck: Boolean,
        prefetchCount: Int,
        messageCallback: MessageCallback,
        cancellationCallback: CancellationCallback,
        connection: RabbitMQConnection
    ) = when (connection.connectionInfo) {
        is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.consumeMessages(
            queueName,
            autoAck,
            prefetchCount,
            messageCallback,
            cancellationCallback,
            connection
        )

        is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.consumeMessages(
            queueName,
            autoAck,
            prefetchCount,
            messageCallback,
            cancellationCallback,
            connection
        )
    }

    override fun cancelConsumer(consumerTag: String, connection: RabbitMQConnection) =
        when (connection.connectionInfo) {
            is ConnectionInfo.AmqpConnectionInfo -> amqpRabbitMQClient.cancelConsumer(consumerTag, connection)
            is ConnectionInfo.HttpConnectionInfo -> httpRabbitMQClient.cancelConsumer(consumerTag, connection)
        }
}