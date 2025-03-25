package com.luizalabs.rmq.core.ports.output

import com.luizalabs.rmq.core.domain.ConnectionInfo

/**
 * Interface for storing RabbitMQ connection configurations.
 *
 * This output port defines operations for persisting and retrieving information
 * about connections to RabbitMQ brokers. It acts as a registry of connections
 * that can be used by the application.
 */
interface ConfigurationStore {

    /**
     * Saves a [ConnectionInfo] in storage.
     *
     * @param [ConnectionInfo] Connection to be saved
     * @return true if the operation was successful, false otherwise
     */
    fun saveConnection(connection: ConnectionInfo): Boolean

    /**
     * Retrieves a [ConnectionInfo] from storage.
     *
     * @param id [ConnectionInfo.id]
     * @return [ConnectionInfo] object or null if not found
     */
    fun getConnection(id: String): ConnectionInfo?

    /**
     * Lists all [ConnectionInfo] stored.
     *
     * @return List of [ConnectionInfo]
     */
    fun listConnections(): List<ConnectionInfo>

    /**
     * Removes a [ConnectionInfo] from storage.
     *
     * @param id [ConnectionInfo.id]
     * @return true if the operation was successful, false otherwise
     */
    fun removeConnection(id: String): Boolean

    /**
     * Sets a [ConnectionInfo] as the default one.
     *
     * @param id [ConnectionInfo.id]
     * @return true if the operation was successful, false otherwise
     */
    fun setDefaultConnection(id: String): Boolean

    /**
     * Retrieves the default [ConnectionInfo].
     *
     * @return [ConnectionInfo] object or null if not found
     */
    fun getDefaultConnection(): ConnectionInfo?
}