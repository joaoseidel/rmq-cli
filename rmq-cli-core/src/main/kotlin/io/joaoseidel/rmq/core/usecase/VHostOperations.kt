package io.joaoseidel.rmq.core.usecase

import io.joaoseidel.rmq.core.domain.ConnectionInfo
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.domain.VHost
import io.joaoseidel.rmq.core.ports.input.RabbitMQClient
import io.joaoseidel.rmq.core.ports.output.ConfigurationStore
import io.github.oshai.kotlinlogging.KotlinLogging
import org.koin.core.annotation.Singleton
import org.koin.java.KoinJavaComponent.inject

private val logger = KotlinLogging.logger {}

/**
 * Manages operations related to RabbitMQ Virtual Hosts, including
 * maintaining the default [VHost] state for [ConnectionInfo].
 *
 * @property rabbitClient RabbitMQ client for VHost operations
 * @property configStore Configuration store for connection management
 */
@Singleton
class VHostOperations {
    private val rabbitClient: RabbitMQClient by inject(RabbitMQClient::class.java)
    private val configStore: ConfigurationStore by inject(ConfigurationStore::class.java)

    /**
     * Lists all [VHost] in the broker.
     *
     * @param connection The [RabbitMQConnection] to use
     * @return List of [VHost] or empty list in case of error
     */
    fun list(
        connection: RabbitMQConnection
    ) = rabbitClient.listVHosts(connection)

    /**
     * Gets detailed information about a specific [VHost].
     *
     * @param name The [VHost] name
     * @param connection The [RabbitMQConnection] to use
     * @return The [VHost] or null if it doesn't exist or an error occurs
     */
    fun get(
        name: String,
        connection: RabbitMQConnection
    ) = list(connection).find { it.name == name }

    /**
     * Sets a [VHost] as the default for a [ConnectionInfo].
     *
     * @param name The [VHost] name
     * @param connection The [RabbitMQConnection] to use
     * @return true if the operation was successful, false otherwise
     */
    fun setDefault(name: String, connection: RabbitMQConnection): Boolean {
        try {
            val vHost = get(name, connection) ?: run {
                return false
            }

            return configStore.saveConnection(connection.connectionInfo.withVHost(vHost))
        } catch (e: Exception) {
            logger.error { "Failed to set default VHost: ${e.message}" }
            return false
        }
    }
}