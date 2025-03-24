package com.luizalabs.rmq.core.usecase

import com.luizalabs.rmq.core.domain.RabbitMQConnection
import com.luizalabs.rmq.core.ports.input.RabbitMQClient
import com.luizalabs.rmq.core.ports.output.ConfigurationStore
import io.github.oshai.kotlinlogging.KotlinLogging
import org.koin.core.annotation.Singleton
import org.koin.java.KoinJavaComponent.inject

private val logger = KotlinLogging.logger {}

/**
 * Manages operations related to RabbitMQ Virtual Hosts, including
 * maintaining the default VHost state for connections.
 *
 * @property rabbitClient RabbitMQ client for VHost operations
 * @property configStore Configuration store for connection management
 */
@Singleton
class VHostOperations {
    private val rabbitClient: RabbitMQClient by inject(RabbitMQClient::class.java)
    private val configStore: ConfigurationStore by inject(ConfigurationStore::class.java)

    /**
     * Lists all virtual hosts in the broker.
     *
     * @param connection The connection to use
     * @return List of virtual hosts or empty list in case of error
     */
    fun list(
        connection: RabbitMQConnection
    ) = rabbitClient.listVHosts(connection)

    /**
     * Gets detailed information about a specific virtual host.
     *
     * @param name The virtual host name
     * @param connection The connection to use
     * @return The virtual host or null if it doesn't exist or an error occurs
     */
    fun get(
        name: String,
        connection: RabbitMQConnection
    ) = list(connection).find { it.name == name }

    /**
     * Sets a virtual host as the default for a connection.
     *
     * @param name The virtual host name
     * @param connection The connection to use
     * @return true if the operation was successful, false otherwise
     */
    fun setDefault(
        name: String,
        connection: RabbitMQConnection
    ): Boolean {
        try {
            val vhost = get(name, connection) ?: run {
                return false
            }

            val connectionInfo = connection.connectionInfo.copy(vHost = vhost)
            return configStore.saveConnection(connectionInfo)
        } catch (e: Exception) {
            logger.error { "Failed to set default VHost: ${e.message}" }
            return false
        }
    }
}