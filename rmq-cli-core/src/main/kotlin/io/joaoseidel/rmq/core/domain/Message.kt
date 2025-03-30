package io.joaoseidel.rmq.core.domain

import com.rabbitmq.client.AMQP
import com.rabbitmq.client.Delivery
import com.rabbitmq.client.Envelope
import com.rabbitmq.http.client.domain.InboundMessage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.text.Charsets.UTF_8

/**
 * Represents a domain entity for messages used within a messaging system. This sealed class allows for multiple
 * message types and encodes shared metadata and properties for all message types.
 *
 * The primary properties of a message include:
 * - A unique identifier (`id`)
 * - The exchange (`exchange`) and routing key (`routingKey`) for routing
 * - A string payload (`payload`) holding the message's body
 * - Metadata in the form of `headers` and `properties`
 *
 * Supported message types include `HttpMessage` and `AmqpMessage`, each with its own serialization and logic
 * for constructing instances from specific input formats.
 *
 * Subclasses:
 * - `HttpMessage`: Encapsulates HTTP-based message data.
 * - `AmqpMessage`: Wraps AMQP-based messaging details, supporting RabbitMQ integration.
 */
@Serializable
sealed class Message {
    abstract val id: CompositeMessageId
    abstract val exchange: String

    abstract val routingKey: String

    abstract val payload: String

    abstract val headers: Map<String, String>
    abstract val properties: Map<String, String>

    @Serializable
    @SerialName("http")
    data class HttpMessage(
        override val id: CompositeMessageId,
        override val exchange: String,
        override val routingKey: String,
        override val payload: String,
        override val headers: Map<String, String> = emptyMap(),
        override val properties: Map<String, String> = emptyMap(),
    ) : Message() {
        companion object {
            /**
             * Converts an InboundMessage into an HttpMessage.
             *
             * This function creates a CompositeMessageId using the details of the provided InboundMessage,
             * including message count, routing key, and payload. It then constructs and returns an HttpMessage
             * with the created message ID, exchange, routing key, payload, and empty headers and properties.
             *
             * @param message The InboundMessage to be converted into an HttpMessage.
             * @return An instance of HttpMessage corresponding to the given InboundMessage.
             */
            fun from(message: InboundMessage): HttpMessage {
                val id = CompositeMessageId.create(
                    deliveryTagOrCount = message.messageCount.toLong(),
                    queue = message.routingKey,
                    exchange = "amq.default",
                    routingKey = message.routingKey,
                    payload = message.payload.toByteArray(charset(UTF_8.name())),
                )

                return HttpMessage(
                    id = id,
                    exchange = "amq.default",
                    routingKey = message.routingKey,
                    payload = message.payload,
                    headers = emptyMap(),
                    properties = emptyMap(),
                )
            }
        }
    }

    @Serializable
    @SerialName("amqp")
    data class AmqpMessage(
        override val id: CompositeMessageId,
        override val exchange: String,
        override val routingKey: String,
        override val payload: String,
        override val headers: Map<String, String> = emptyMap(),
        override val properties: Map<String, String> = emptyMap(),
    ) : Message() {
        companion object {
            /**
             * Constructs an instance of `AmqpMessage` from the given `Delivery` object.
             *
             * This function extracts the relevant data from the `Delivery` object, including envelope details, properties, and body.
             * It uses the extracted information to create a unique `CompositeMessageId` and populate the headers and properties maps.
             *
             * @param delivery The `Delivery` object containing the message details to be converted to `AmqpMessage`.
             * @return An `AmqpMessage` instance with data extracted from the provided `Delivery` object.
             */
            fun from(delivery: Delivery): AmqpMessage {
                val envelope = delivery.envelope

                val properties = delivery.properties
                val (headersMap, propertiesMap) = buildMaps(properties)

                val id = CompositeMessageId.create(
                    deliveryTagOrCount = envelope.deliveryTag,
                    queue = envelope.routingKey,
                    exchange = envelope.exchange,
                    routingKey = envelope.routingKey,
                    payload = delivery.body,
                )

                return AmqpMessage(
                    id = id,
                    exchange = envelope.exchange,
                    routingKey = envelope.routingKey,
                    payload = String(delivery.body, charset(UTF_8.name())),
                    headers = headersMap,
                    properties = propertiesMap
                )
            }

            /**
             * Constructs an instance of `AmqpMessage` from the provided envelope, payload, and properties.
             *
             * This function extracts relevant information from the `Envelope` object, the `body` byte array,
             * and the `AMQP.BasicProperties` object. It creates a unique `CompositeMessageId` and populates
             * maps for headers and properties using the provided data. The resulting `AmqpMessage` includes
             * the extracted details such as exchange, routing key, payload (as a string), headers, and properties.
             *
             * @param envelope The `Envelope` object containing metadata about the AMQP message.
             * @param body The payload of the message as a byte array.
             * @param properties The `AMQP.BasicProperties` object containing metadata and headers for the message.
             * @return An `AmqpMessage` instance populated with the extracted and formatted data from the inputs.
             */
            fun from(envelope: Envelope, body: ByteArray, properties: AMQP.BasicProperties): AmqpMessage {
                val id = CompositeMessageId.create(
                    deliveryTagOrCount = envelope.deliveryTag,
                    queue = envelope.routingKey,
                    exchange = envelope.exchange,
                    routingKey = envelope.routingKey,
                    payload = body,
                )

                val (headersMap, propertiesMap) = buildMaps(properties)

                return AmqpMessage(
                    id = id,
                    exchange = envelope.exchange,
                    routingKey = envelope.routingKey,
                    payload = String(body, charset(UTF_8.name())),
                    headers = headersMap,
                    properties = propertiesMap
                )
            }

            private fun buildMaps(properties: AMQP.BasicProperties): Pair<Map<String, String>, Map<String, String>> {
                val headersMap = properties.headers?.mapValues { it.value.toString() } ?: emptyMap()

                val propertiesMap = mapOf(
                    "contentType" to properties.contentType,
                    "contentEncoding" to properties.contentEncoding,
                    "deliveryMode" to properties.deliveryMode.toString(),
                    "priority" to properties.priority.toString(),
                    "correlationId" to properties.correlationId,
                    "replyTo" to properties.replyTo,
                    "expiration" to properties.expiration,
                    "messageId" to properties.messageId,
                    "timestamp" to properties.timestamp.toString(),
                    "type" to properties.type,
                    "userId" to properties.userId,
                    "appId" to properties.appId,
                    "clusterId" to properties.clusterId,
                )

                return Pair(headersMap, propertiesMap)
            }
        }
    }

    fun toTableString() = buildString {
        append("ID: $id\n")
        append("Exchange: $exchange\n")
        append("Routing key: $routingKey\n")
        append("Headers: $headers\n")
        append("Properties: $properties\n")
        append("Payload: $payload\n")
    }
}