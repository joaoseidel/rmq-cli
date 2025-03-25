package com.luizalabs.rmq.core.domain

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.UUID

/**
 * Represents a connection to a RabbitMQ broker.
 *
 * This sealed class hierarchy models connections to RabbitMQ, with different
 * subclasses representing the primary protocol used to interact with the broker.
 * Each connection type contains configuration for both AMQP and HTTP protocols,
 * as many RabbitMQ operations require both protocols even when primarily using one.
 *
 * The two main connection types are:
 * - [AmqpConnectionInfo]: For clients primarily using the AMQP protocol for messaging
 * - [HttpConnectionInfo]: For clients primarily using the HTTP Management API
 */
@Serializable
sealed class ConnectionInfo {
    /**
     * Unique identifier for the connection
     */
    abstract val id: String

    /**
     * Human-readable name for the connection
     */
    abstract val name: String

    /**
     * Hostname or IP address of the RabbitMQ server
     */
    abstract val host: String

    /**
     * Username for authentication with the RabbitMQ server
     */
    abstract val username: String

    /**
     * Password for authentication with the RabbitMQ server
     */
    abstract val password: String

    /**
     * Virtual host to connect to within the RabbitMQ server
     */
    abstract val vHost: VHost

    /**
     * Whether this connection is the default one
     */
    abstract val isDefault: Boolean

    /**
     * Whether to use a secure connection (SSL/TLS)
     */
    abstract val useSsl: Boolean

    /**
     * The type of connection (AMQP or HTTP)
     * Manually set to 'amqp' or 'http' based on the subclass
     * This is used for serialization and deserialization
     */
    abstract val type: String

    /**
     * Returns the HTTP Management API URL for this connection.
     *
     * @return The base URL for the HTTP Management API
     */
    abstract fun getHttpApiUrl(): String

    /**
     * Creates a secure string representation of this connection with sensitive
     * information (like password) masked. This is suitable for logging and display.
     *
     * @return A string representation of this connection with masked sensitive data
     */
    abstract fun toSecureString(): String

    /**
     * Returns a new connection instance with the specified virtual host.
     *
     * @param vHost The new virtual host to use
     * @return A new connection instance with the updated virtual host
     */
    fun withVHost(vHost: VHost): ConnectionInfo {
        return when (this) {
            is AmqpConnectionInfo -> copy(vHost = vHost)
            is HttpConnectionInfo -> copy(vHost = vHost)
        }
    }

    /**
     * Returns a new connection instance with the specified default flag.
     *
     * @param isDefault Whether this connection should be the default
     * @return A new connection instance with the updated default flag
     */
    fun withIsDefault(isDefault: Boolean): ConnectionInfo {
        return when (this) {
            is AmqpConnectionInfo -> copy(isDefault = isDefault)
            is HttpConnectionInfo -> copy(isDefault = isDefault)
        }
    }

    /**
     * Represents a connection primarily using the AMQP protocol, which is
     * the main protocol for message publishing and consumption in RabbitMQ.
     *
     * This connection type also includes HTTP API configuration for management
     * operations that cannot be performed over AMQP.
     *
     * Use this connection type when your application needs to perform messaging
     * operations such as:
     * - Publishing messages
     * - Consuming messages
     * - Creating and binding queues
     * - Setting up exchanges
     *
     * @property amqpPort The AMQP port to connect to (default is 5672)
     * @property httpPort The HTTP API port for management operations (default is 15672)
     * @property useSsl Whether to use SSL/TLS for both protocols
     */
    @Serializable
    @SerialName("amqp")
    data class AmqpConnectionInfo(
        override val id: String = UUID.randomUUID().toString(),
        override val name: String,
        override val host: String,
        val amqpPort: Int = 5672,
        val httpPort: Int = 15672,
        override val username: String,
        override val password: String,
        override val vHost: VHost,
        override val useSsl: Boolean = false,
        override val isDefault: Boolean = false,
        override val type: String = "amqp"
    ) : ConnectionInfo() {
        /**
         * Returns the complete AMQP URL for this connection.
         *
         * The format follows the AMQP URI specification:
         * amqp://username:password@host:port/vhost
         *
         * If SSL is enabled, the protocol will be 'amqps' instead of 'amqp'.
         *
         * @return The formatted AMQP URL as a string
         */
        fun getAmqpUrl(): String {
            val protocol = if (useSsl) "amqps" else "amqp"
            val encodedVhost = java.net.URLEncoder.encode(vHost.name, "UTF-8")
            return "$protocol://$username:$password@$host:$amqpPort/$encodedVhost"
        }

        /**
         * Returns the HTTP Management API URL for this connection.
         *
         * AMQP connections often need to access the HTTP API for management
         * operations like listing queues or viewing statistics.
         *
         * @return The base URL for the HTTP Management API
         */
        override fun getHttpApiUrl(): String {
            val protocol = if (useSsl) "https" else "http"
            return "$protocol://$host:$httpPort/api"
        }

        /**
         * Provides a secure string representation of this AMQP connection,
         * with the password masked for security.
         *
         * @return A string representation with sensitive data masked
         */
        override fun toSecureString(): String {
            return "AmqpConnection(id=$id, name=$name, host=$host, " +
                    "amqpPort=$amqpPort, httpPort=$httpPort, " +
                    "username=$username, vhost=${vHost.name}, " +
                    "useSsl=$useSsl, isDefault=$isDefault)"
        }
    }

    /**
     * Represents a connection primarily using the HTTP Management API of RabbitMQ.
     *
     * This connection type is designed for management operations rather than
     * direct messaging. Some operations (like real-time message consumption)
     * are not available through the HTTP API.
     *
     * Use this connection type when your application only needs to:
     * - Monitor queue statistics
     * - List and manage queues/exchanges
     * - Perform administrative tasks
     * - Retrieve messages (in a non-streaming fashion)
     *
     * Note that all operations will be performed via HTTP API, which may have
     * performance limitations compared to direct AMQP operations.
     *
     * @property httpPort The HTTP API port to connect to (default is 15672)
     * @property useSsl Whether to use HTTPS instead of HTTP
     */
    @Serializable
    @SerialName("http")
    data class HttpConnectionInfo(
        override val id: String = UUID.randomUUID().toString(),
        override val name: String,
        override val host: String,
        val httpPort: Int = 15672,
        override val username: String,
        override val password: String,
        override val vHost: VHost,
        override val useSsl: Boolean = false,
        override val isDefault: Boolean = false,
        override val type: String = "http"
    ) : ConnectionInfo() {
        /**
         * Returns the base URL for the RabbitMQ HTTP API.
         *
         * The format is:
         * http://host:port/api
         *
         * If SSL is enabled, the protocol will be 'https' instead of 'http'.
         *
         * @return The base URL for the HTTP Management API
         */
        override fun getHttpApiUrl(): String {
            val protocol = if (useSsl) "https" else "http"
            return "$protocol://$host:$httpPort/api"
        }

        /**
         * Provides a secure string representation of this HTTP connection,
         * with the password masked for security.
         *
         * @return A string representation with sensitive data masked
         */
        override fun toSecureString(): String {
            return "HttpConnection(id=$id, name=$name, host=$host, " +
                    "httpPort=$httpPort, username=$username, vhost=${vHost.name}, " +
                    "useSsl=$useSsl, isDefault=$isDefault)"
        }
    }

    companion object {
        /**
         * Creates a connection instance of the appropriate type based on the specified parameters.
         *
         * @param id Unique identifier (generated if not provided)
         * @param name Friendly name for the connection
         * @param host RabbitMQ server address
         * @param amqpPort Port for AMQP protocol (default 5672)
         * @param httpPort Port for HTTP API (default 15672)
         * @param username Username for authentication
         * @param password Password for authentication
         * @param vHost Virtual Host to connect to
         * @param useSsl Whether to use SSL/TLS
         * @param useHttp Whether to create an HTTP API connection (vs AMQP)
         * @param isDefault Whether this is the default connection
         * @return An instance of either AmqpConnection or HttpConnection
         */
        fun create(
            id: String = UUID.randomUUID().toString(),
            name: String,
            host: String,
            amqpPort: Int = 5672,
            httpPort: Int = 15672,
            username: String,
            password: String,
            vHost: VHost,
            useSsl: Boolean = false,
            useHttp: Boolean = false,
            isDefault: Boolean = false
        ): ConnectionInfo {
            return if (useHttp) {
                HttpConnectionInfo(
                    id = id,
                    name = name,
                    host = host,
                    httpPort = httpPort,
                    username = username,
                    password = password,
                    vHost = vHost,
                    useSsl = useSsl,
                    isDefault = isDefault
                )
            } else {
                AmqpConnectionInfo(
                    id = id,
                    name = name,
                    host = host,
                    amqpPort = amqpPort,
                    httpPort = httpPort,
                    username = username,
                    password = password,
                    vHost = vHost,
                    useSsl = useSsl,
                    isDefault = isDefault
                )
            }
        }
    }
}