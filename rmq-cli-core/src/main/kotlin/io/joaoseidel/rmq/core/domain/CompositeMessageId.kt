package io.joaoseidel.rmq.core.domain

import kotlinx.serialization.Serializable
import java.nio.ByteBuffer
import java.security.MessageDigest


@Serializable
data class CompositeMessageId(val value: String) {
    companion object {
        // Number of bytes to use for different components
        private const val DELIVERY_TAG_SIZE = 8     // 8 bytes for delivery tag
        private const val ROUTING_INFO_SIZE = 8     // 8 bytes for routing info hash
        private const val CONTENT_HASH_SIZE = 4     // 4 bytes for content hash
        private const val TOTAL_BYTES = DELIVERY_TAG_SIZE + ROUTING_INFO_SIZE + CONTENT_HASH_SIZE

        /**
         * Creates a deterministic, collision-resistant message ID that remains
         * consistent across CLI executions for the same message.
         */
        fun create(
            deliveryTagOrCount: Long,
            queue: String?,
            exchange: String,
            routingKey: String,
            payload: ByteArray
        ): CompositeMessageId {
            // Create a deterministic hash of routing components
            val routingInfo = buildRoutingInfo(queue, exchange, routingKey)
            val routingInfoHash = generateSecureHash(routingInfo.toByteArray())

            // Create a hash of the message content
            val contentHash = generateSecureHash(payload)

            // Combine all components into a buffer
            val buffer = ByteBuffer.allocate(TOTAL_BYTES)

            // Write delivery tag (8 bytes) - preserved exactly
            buffer.putLong(deliveryTagOrCount)

            // Write routing info hash (8 bytes) - first 8 bytes of SHA-256
            buffer.put(routingInfoHash, 0, ROUTING_INFO_SIZE)

            // Write content hash (4 bytes) - first 4 bytes of SHA-256
            buffer.put(contentHash, 0, CONTENT_HASH_SIZE)

            // Convert to hex string (40 characters for 20 bytes)
            buffer.flip()
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)

            return CompositeMessageId(bytesToHex(bytes))
        }

        /**
         * Builds a deterministic string combining all routing information.
         * Format: "q:{queue}:e:{exchange}:rk:{routingKey}"
         */
        private fun buildRoutingInfo(queue: String?, exchange: String, routingKey: String): String {
            return buildString {
                append("q:")
                append(queue ?: "-")
                append(":e:")
                append(exchange.ifBlank { "-" })
                append(":rk:")
                append(routingKey.ifBlank { "-" })
            }
        }

        /**
         * Generates a secure SHA-256 hash of the input data.
         */
        private fun generateSecureHash(data: ByteArray): ByteArray {
            return MessageDigest.getInstance("SHA-256").digest(data)
        }

        /**
         * Converts bytes to a hexadecimal string.
         */
        private fun bytesToHex(bytes: ByteArray): String {
            return bytes.joinToString("") { byte -> "%02x".format(byte) }
        }

        /**
         * Converts a hexadecimal string back to bytes.
         */
        private fun hexToBytes(hex: String): ByteArray {
            check(hex.length % 2 == 0) { "Hex string must have an even length" }

            return ByteArray(hex.length / 2) {
                ((Character.digit(hex[it * 2], 16) shl 4) +
                        Character.digit(hex[it * 2 + 1], 16)).toByte()
            }
        }
    }

    /**
     * Extracts the delivery tag from this message ID.
     */
    fun extractDeliveryTag(): Long {
        val bytes = hexToBytes(value)
        val buffer = ByteBuffer.wrap(bytes)
        return buffer.getLong()
    }

    /**
     * Extracts the routing info hash bytes from this message ID.
     */
    fun extractRoutingInfoHash(): ByteArray {
        val bytes = hexToBytes(value)
        return bytes.sliceArray(DELIVERY_TAG_SIZE until DELIVERY_TAG_SIZE + ROUTING_INFO_SIZE)
    }

    /**
     * Extracts the content hash bytes from this message ID.
     */
    fun extractContentHash(): ByteArray {
        val bytes = hexToBytes(value)
        return bytes.sliceArray(DELIVERY_TAG_SIZE + ROUTING_INFO_SIZE until TOTAL_BYTES)
    }

    /**
     * Determines if this message ID matches a specific message by comparing
     * the delivery tag, routing info hash, and content hash.
     */
    fun matches(message: Message): Boolean {
        // Direct string comparison first
        if (message.id.value == value) {
            return true
        }

        try {
            // Extract components from this ID
            val thisDeliveryTag = extractDeliveryTag()
            val thisRoutingHash = extractRoutingInfoHash()
            val thisContentHash = extractContentHash()

            // Extract components from message ID
            val messageDeliveryTag = message.id.extractDeliveryTag()
            val messageRoutingHash = message.id.extractRoutingInfoHash()
            val messageContentHash = message.id.extractContentHash()

            // Compare all components
            return thisDeliveryTag == messageDeliveryTag &&
                    thisRoutingHash.contentEquals(messageRoutingHash) &&
                    thisContentHash.contentEquals(messageContentHash)
        } catch (e: Exception) {
            // If extraction fails, IDs don't match
            return false
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is CompositeMessageId) return false
        return value == other.value
    }

    override fun hashCode(): Int {
        return value.hashCode()
    }

    override fun toString(): String {
        return value
    }
}