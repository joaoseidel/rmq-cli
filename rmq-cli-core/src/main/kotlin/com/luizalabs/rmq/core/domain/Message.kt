package com.luizalabs.rmq.core.domain

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Represents a message in RabbitMQ.
 *
 * @property id Message ID in the queue
 * @property payload Message content in bytes
 * @property queue Queue where the message is or was
 * @property exchange Exchange from which the message was published
 * @property routingKey Routing key used to deliver the message
 * @property properties AMQP message properties
 */
@Serializable
data class Message(
    val id: String? = null,
    val queue: String? = null,
    val exchange: String = "",
    val routingKey: String = "",
    val properties: Map<String, String> = emptyMap(),
    @Serializable(ByteArrayAsStringSerializer::class)
    val payload: ByteArray
) {
    fun bodyAsString(charset: String = "UTF-8"): String {
        return String(payload, charset(charset))
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as Message

        if (id != other.id) return false
        if (!payload.contentEquals(other.payload)) return false
        if (queue != other.queue) return false
        if (exchange != other.exchange) return false
        if (routingKey != other.routingKey) return false
        if (properties != other.properties) return false

        return true
    }

    override fun hashCode(): Int {
        var result = id?.hashCode() ?: 0
        result = 31 * result + payload.contentHashCode()
        result = 31 * result + (queue?.hashCode() ?: 0)
        result = 31 * result + exchange.hashCode()
        result = 31 * result + routingKey.hashCode()
        result = 31 * result + properties.hashCode()
        return result
    }

    override fun toString(): String {
        return "Message(id='$id', queue='$queue', exchange='$exchange', routingKey='$routingKey', payload='${bodyAsString()}', properties='$properties')"
    }

    fun toTableString() = buildString {
        append("ID: $id\n")
        append("Exchange: $exchange\n")
        append("Routing key: $routingKey\n")
        append("Queue: $queue\n")
        append("Properties: $properties\n")
        append("Payload: ${bodyAsString()}\n")
    }
}

object ByteArrayAsStringSerializer : KSerializer<ByteArray> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("com.luizalabs.rmq.core.domain.Message.ByteArrayAsStringSerializer", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: ByteArray) {
        encoder.encodeString(String(value, charset("UTF-8")))
    }

    override fun deserialize(decoder: Decoder): ByteArray {
        return decoder.decodeString().toByteArray(charset("UTF-8"))
    }
}