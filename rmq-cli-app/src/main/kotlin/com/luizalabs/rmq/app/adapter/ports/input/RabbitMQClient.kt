package com.luizalabs.rmq.app.adapter.ports.input

import com.luizalabs.rmq.core.domain.CancellationCallback
import com.luizalabs.rmq.core.domain.Connection
import com.luizalabs.rmq.core.domain.Message
import com.luizalabs.rmq.core.domain.MessageCallback
import com.luizalabs.rmq.core.domain.Queue
import com.luizalabs.rmq.core.domain.RabbitMQConnection
import com.luizalabs.rmq.core.domain.VHost
import com.luizalabs.rmq.core.ports.input.RabbitMQClient
import com.rabbitmq.client.AMQP
import com.rabbitmq.client.CancelCallback
import com.rabbitmq.client.ConnectionFactory
import com.rabbitmq.client.DeliverCallback
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.koin.core.annotation.Singleton
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64

private val logger = KotlinLogging.logger {}

@Singleton
class RabbitMQClient : RabbitMQClient {

    override fun connect(connectionInfo: Connection): RabbitMQConnection? {
        return try {
            val factory = ConnectionFactory()
            factory.host = connectionInfo.host
            factory.port = connectionInfo.port
            factory.username = connectionInfo.username
            factory.password = connectionInfo.password
            factory.virtualHost = connectionInfo.vHost.name
            factory.isAutomaticRecoveryEnabled = true

            val connection = factory.newConnection()
            val channel = connection.createChannel()

            RabbitMQConnection(channel, connection, connectionInfo)
        } catch (e: Exception) {
            logger.error { "Failed to connect to RabbitMQ: ${e.message}" }
            null
        }
    }

    override fun testConnection(connectionInfo: Connection) =
        connect(connectionInfo) != null

    override fun publishMessage(
        exchangeName: String,
        routingKey: String,
        payload: ByteArray,
        connection: RabbitMQConnection
    ) = connection.use {
        try {
            val props = AMQP.BasicProperties.Builder()
//                .messageId(payload.id)
//                .headers(payload.properties.mapValues { it.value as Any })
                .build()

            it.channel.basicPublish(
                exchangeName,
                routingKey,
                props,
                payload
            )
            true
        } catch (e: Exception) {
            logger.error { "Failed to publish message: ${e.message}" }
            false
        }
    }

    override fun findMessage(
        messageId: String,
        queueName: String,
        autoAck: Boolean,
        connection: RabbitMQConnection
    ) = connection.use {
        try {
            getMessages(
                queueName = queueName,
                count = Int.MAX_VALUE,
                ack = autoAck,
                connection = connection
            ).find { it.id == messageId } ?: return null
        } catch (e: Exception) {
            logger.error { "Failed to find message $messageId in queue $queueName: ${e.message}" }
            null
        }
    }

    override fun getMessages(
        queueName: String,
        count: Int,
        ack: Boolean,
        connection: RabbitMQConnection
    ) = connection.use {
        try {
            val messages = mutableListOf<Message>()

            for (i in 1..count) {
                val response = it.channel.basicGet(queueName, ack) ?: break
                val envelope = response.envelope
                val props = response.props
                val headersMap = props.headers?.mapValues { it.value.toString() } ?: emptyMap()

                val message = Message(
                    id = props.messageId ?: response.envelope.deliveryTag.toString(),
                    payload = response.body,
                    queue = queueName,
                    exchange = envelope.exchange,
                    routingKey = envelope.routingKey,
                    properties = headersMap
                )

                messages.add(message)
            }

            messages
        } catch (e: Exception) {
            logger.error { "Failed to get messages from queue $queueName: ${e.message}" }
            emptyList()
        }
    }

    override fun deleteMessage(
        messageId: String,
        queueName: String,
        connection: RabbitMQConnection
    ) = connection.use {
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

            messages.any { it.id == messageId }
        } catch (e: Exception) {
            logger.error { "Failed to delete message $messageId from queue $queueName: ${e.message}" }
            false
        }
    }

    override fun purgeQueue(
        queueName: String,
        connection: RabbitMQConnection
    ) = connection.use {
        try {
            it.channel.queuePurge(queueName)
            true
        } catch (e: Exception) {
            logger.error { "Failed to purge queue $queueName: ${e.message}" }
            false
        }
    }

    override fun listQueues(
        connection: RabbitMQConnection
    ) = connection.use {
        try {
            val encodedVhost = java.net.URLEncoder.encode(it.connectionInfo.vHost.name, "UTF-8")
            val response = executeHttpApiRequest(
                path = "/queues/$encodedVhost",
                method = "GET",
                connection = it
            )

            Json.parseToJsonElement(response).jsonArray
                .map { queueData ->
                    Queue(
                        name = queueData.jsonObject["name"]?.jsonPrimitive?.contentOrNull ?: "",
                        vhost = queueData.jsonObject["vhost"]?.jsonPrimitive?.contentOrNull ?: "",
                        messagesReady = queueData.jsonObject["messages_ready"]?.jsonPrimitive?.longOrNull ?: 0L,
                        messagesUnacknowledged = queueData.jsonObject["messages_unacknowledged"]?.jsonPrimitive?.longOrNull ?: 0L,
                    )
                }
        } catch (e: Exception) {
            logger.error { "Failed to list queues: ${e.message}" }
            emptyList()
        }
    }

    override fun listVHosts(
        connection: RabbitMQConnection
    ) = connection.use {
        try {
            val response = executeHttpApiRequest(
                path = "/vhosts",
                method = "GET",
                connection = connection
            )

            Json.parseToJsonElement(response).jsonArray
                .map { vhostData ->
                    val name = vhostData.jsonObject["name"]?.jsonPrimitive?.contentOrNull ?: ""
                    VHost(
                        name = name,
                        description = vhostData.jsonObject["description"]?.jsonPrimitive?.contentOrNull ?: "",
                        isDefault = it.connectionInfo.vHost.name == name
                    )
                }
        } catch (e: Exception) {
            logger.error { "Failed to list vhosts: ${e.message}" }
            emptyList()
        }
    }

    override fun consumeMessages(
        queueName: String,
        autoAck: Boolean,
        prefetchCount: Int,
        messageCallback: MessageCallback,
        cancellationCallback: CancellationCallback,
        connection: RabbitMQConnection
    ): String = connection.use {
        try {
            if (prefetchCount > 0) {
                it.channel.basicQos(prefetchCount)
            }

            val deliverCallback = DeliverCallback { consumerTag, delivery ->
                val headersMap = delivery.properties.headers?.mapValues { it.value.toString() } ?: emptyMap()

                val message = Message(
                    id = delivery.properties.messageId ?: delivery.envelope.deliveryTag.toString(),
                    payload = delivery.body,
                    queue = queueName,
                    exchange = delivery.envelope.exchange,
                    routingKey = delivery.envelope.routingKey,
                    properties = headersMap
                )

                messageCallback.handle(consumerTag, message)
            }

            val cancelCallback = CancelCallback { consumerTag ->
                cancellationCallback.handle(consumerTag)
            }

            val consumerTag = it.channel.basicConsume(
                queueName,
                autoAck,
                deliverCallback,
                cancelCallback
            )

            consumerTag
        } catch (e: Exception) {
            logger.error { "Failed to start consumer for queue $queueName: ${e.message}" }
            throw e
        }
    }

    override fun cancelConsumer(
        consumerTag: String,
        connection: RabbitMQConnection
    ): Boolean = connection.use {
        try {
            it.channel.basicCancel(consumerTag)
            true
        } catch (e: Exception) {
            logger.error { "Failed to cancel consumer $consumerTag: ${e.message}" }
            false
        }
    }

    internal fun executeHttpApiRequest(
        path: String,
        method: String,
        connection: RabbitMQConnection
    ) = connection.use { wrapper ->
        val apiUrl = wrapper.connectionInfo.getHttpApiUrl() + path

        val url = URL(apiUrl)
        val httpConn = url.openConnection() as HttpURLConnection
        httpConn.requestMethod = method

        // Set basic authentication header
        val auth = "${wrapper.connectionInfo.username}:${wrapper.connectionInfo.password}"
        val encodedAuth = Base64.getEncoder().encodeToString(auth.toByteArray())
        httpConn.setRequestProperty("Authorization", "Basic $encodedAuth")

        httpConn.inputStream.bufferedReader().use { it.readText() }
    }
}