package com.luizalabs.rmq.core.usecase

import com.luizalabs.rmq.core.domain.Connection
import com.luizalabs.rmq.core.ports.input.RabbitMQClient
import com.luizalabs.rmq.core.ports.output.ConfigurationStore
import org.koin.core.annotation.Singleton
import org.koin.java.KoinJavaComponent.inject

/**
 * Use case that manages operations related to connections with RabbitMQ brokers.
 *
 * This class implements the business logic for adding, removing, listing, and
 * managing connections with RabbitMQ brokers. It works as a coordinator between
 * the input port [RabbitMQClient] and the output port [ConfigurationStore].
 *
 * @property configStore Configuration storage for persisting connections]
 * @property rabbitClient RabbitMQ client for testing connections
 */
@Singleton
class ConnectionOperations {
    private val configStore: ConfigurationStore by inject(ConfigurationStore::class.java)
    private val rabbitClient: RabbitMQClient by inject(RabbitMQClient::class.java)

    /**
     * Adds a new connection to the configuration storage.
     *
     * @param connection Connection to be added
     * @return true if the operation was successful, false otherwise
     */
    fun addConnection(
        connection: Connection
    ): Boolean {
        if (rabbitClient.testConnection(connection).not())
            return false

        return if (configStore.saveConnection(connection)) {
            configStore.setDefaultConnection(connection.id)
            return true
        } else {
            return false
        }
    }

    /**
     * Removes a connection from the configuration storage.
     *
     * @param id ID of the connection to be removed
     * @return true if the operation was successful, false otherwise
     */
    fun removeConnection(id: String): Boolean {
        val connection = configStore.getConnection(id)
        if (connection == null) {
            return false
        }

        val defaultConnection = configStore.getDefaultConnection()
        val isDefault = defaultConnection?.id == id
        val removed = configStore.removeConnection(id)

        if (removed && isDefault) {
            val connections = configStore.listConnections()
            if (connections.isNotEmpty()) {
                configStore.setDefaultConnection(connections.first().id)
            }
        }

        return removed
    }

    /**
     * Lists all connections saved in the configuration storage.
     *
     * @return List of connections
     */
    fun listConnections() =
        configStore.listConnections()

    /**
     * Gets a connection by its name.
     *
     * @param name Name of the connection
     * @return The connection or null if it does not exist
     */
    fun getConnectionByName(name: String) =
        configStore.listConnections().find { it.name == name }

    /**
     * Gets the default connection.
     *
     * @return The default connection or null if it does not exist
     */
    fun getDefaultConnection() =
        configStore.getDefaultConnection()


    /**
     * Sets the default connection by its ID.
     *
     * @param id ID of the connection
     * @return true if the operation was successful, false otherwise
     */
    fun setDefaultConnection(
        id: String
    ): Boolean {
        val connection = configStore.getConnection(id)
        if (connection == null) {
            throw IllegalArgumentException("Connection not found with ID: $id")
        }

        return configStore.setDefaultConnection(id)
    }

    /**
     * Gets a connection by its ID.
     *
     * @param id ID of the connection
     * @return The connection or null if it does not exist
     */
    fun getConnection(
        id: String
    ): Connection? {
        return configStore.getConnection(id)
    }
}