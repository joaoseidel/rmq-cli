package com.luizalabs.rmq.core.ports.output

import com.luizalabs.rmq.core.domain.Connection

/**
 * Interface for storing RabbitMQ connection configurations.
 *
 * This output port defines operations for persisting and retrieving information
 * about connections to RabbitMQ brokers. It acts as a registry of connections
 * that can be used by the application.
 */
interface ConfigurationStore {

    /**
     * Saves a connection in storage.
     *
     * @param connection Connection to be saved
     * @return true if the operation was successful, false otherwise
     */
    fun saveConnection(connection: Connection): Boolean

    /**
     * Retrieves a connection from storage.
     *
     * @param id Connection ID
     * @return Connection object or null if not found
     */
    fun getConnection(id: String): Connection?

    /**
     * Lists all connections stored.
     *
     * @return List of connections
     */
    fun listConnections(): List<Connection>

    /**
     * Removes a connection from storage.
     *
     * @param id Connection ID
     * @return true if the operation was successful, false otherwise
     */
    fun removeConnection(id: String): Boolean

    /**
     * Sets a connection as the default one.
     *
     * @param id Connection ID
     * @return true if the operation was successful, false otherwise
     */
    fun setDefaultConnection(id: String): Boolean

    /**
     * Retrieves the default connection.
     *
     * @return Connection object or null if not found
     */
    fun getDefaultConnection(): Connection?
}