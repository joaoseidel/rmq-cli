package io.joaoseidel.rmq.app.adapter.ports.output

import io.joaoseidel.rmq.core.domain.ConnectionInfo
import io.joaoseidel.rmq.core.ports.output.ConfigurationStore
import io.joaoseidel.rmq.core.ports.output.SettingsStore
import io.github.oshai.kotlinlogging.KotlinLogging
import org.koin.core.annotation.Singleton

private val logger = KotlinLogging.logger {}

/**
 * Implementation of the [ConfigurationStore] interface.
 * This class is responsible for managing the configuration of the application.
 */
@Singleton
class ConfigurationStore(
    private val settingsStore: SettingsStore = JsonSettingsStore()
) : ConfigurationStore {
    companion object {
        const val CONNECTION_COLLECTION = "connections"
    }

    override fun saveConnection(connection: ConnectionInfo): Boolean {
        return try {
            if (connection.isDefault) {
                updateDefaultConnectionFlag(connection.id)
            }

            settingsStore.save(CONNECTION_COLLECTION, connection, ConnectionInfo::class)
            true
        } catch (e: Exception) {
            logger.error { "Failed to save connection: ${e.message}" }
            false
        }
    }

    override fun getConnection(id: String): ConnectionInfo? {
        return try {
            settingsStore.findById(CONNECTION_COLLECTION, id, ConnectionInfo::class)
        } catch (e: Exception) {
            logger.error { "Failed to get connection: ${e.message}" }
            null
        }
    }

    override fun listConnections(): List<ConnectionInfo> {
        return try {
            settingsStore.list(CONNECTION_COLLECTION, ConnectionInfo::class)
        } catch (e: Exception) {
            logger.error { "Failed to list connections: ${e.message}" }
            emptyList()
        }
    }

    override fun removeConnection(id: String): Boolean {
        return try {
            val wasDefault = getConnection(id)?.isDefault == true
            val result = settingsStore.delete(CONNECTION_COLLECTION, id)

            if (wasDefault) {
                val connections = listConnections()
                if (connections.isNotEmpty()) {
                    setDefaultConnection(connections.first().id)
                }
            }

            result
        } catch (e: Exception) {
            logger.error { "Failed to remove connection: ${e.message}" }
            false
        }
    }

    override fun setDefaultConnection(id: String): Boolean {
        return try {
            getConnection(id) ?: throw IllegalArgumentException("Connection not found with ID: $id")
            updateDefaultConnectionFlag(id)
            true
        } catch (e: Exception) {
            logger.error { "Failed to set default connection: ${e.message}" }
            false
        }
    }

    override fun getDefaultConnection(): ConnectionInfo? {
        return try {
            val connections = listConnections()
            connections.find { it.isDefault } ?: connections.firstOrNull()
        } catch (e: Exception) {
            logger.error { "Failed to get default connection: ${e.message}" }
            null
        }
    }

    private fun updateDefaultConnectionFlag(defaultConnectionId: String) {
        val connections = listConnections()

        for (connection in connections) {
            if (connection.id == defaultConnectionId && !connection.isDefault) {
                settingsStore.update(CONNECTION_COLLECTION, connection.withIsDefault(true))
            } else if (connection.id != defaultConnectionId && connection.isDefault) {
                settingsStore.update(CONNECTION_COLLECTION, connection.withIsDefault(false))
            }
        }
    }
}
