package com.luizalabs.rmq.core.domain

import kotlinx.serialization.Serializable
import java.util.UUID

/**
 * Represents a connection to a RabbitMQ broker.
 *
 * @property id Unique identifier for the connection (optional, generated if not provided)
 * @property name Friendly name for the connection
 * @property host RabbitMQ server address
 * @property port Server port (default: 5672 for AMQP, 15672 for HTTP API)
 * @property username Username for authentication
 * @property password Password for authentication
 * @property vHost Default Virtual Host (vhost) for the connection
 * @property useSsl Indicates whether to use secure connection (SSL/TLS)
 * @property isDefault Indicates if this is the default connection
 */
@Serializable
data class Connection(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val host: String,
    val port: Int = 5672,
    val username: String,
    val password: String,
    val vHost: VHost,
    val useSsl: Boolean = false,
    val isDefault: Boolean = false
) {

    fun getAmqpUrl(): String {
        val protocol = if (useSsl) "amqps" else "amqp"
        return "$protocol://$username:$password@$host:$port/${vHost.name}"
    }

    fun getHttpApiUrl(): String {
        val protocol = if (useSsl) "https" else "http"
        return "$protocol://$host:15672/api"
    }

    fun toSecureString(): String {
        return "Connection(id=$id, name=$name, host=$host, port=$port, username=$username, vhost=${vHost.name}, useSsl=$useSsl, isDefault=$isDefault)"
    }
}