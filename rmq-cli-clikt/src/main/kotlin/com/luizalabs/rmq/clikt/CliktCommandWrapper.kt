package com.luizalabs.rmq.clikt

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.options.option
import com.luizalabs.rmq.core.domain.RabbitMQConnection
import com.luizalabs.rmq.core.ports.input.RabbitMQClient
import com.luizalabs.rmq.core.usecase.ConnectionOperations
import com.luizalabs.rmq.core.usecase.VHostOperations
import io.github.oshai.kotlinlogging.KotlinLogging
import org.koin.java.KoinJavaComponent.inject

private val logger = KotlinLogging.logger {}

abstract class CliktCommandWrapper(
    name: String? = null,
) : SuspendingCliktCommand(name) {
    protected val rabbitClient: RabbitMQClient by inject(RabbitMQClient::class.java)
    protected val vHostOperations: VHostOperations by inject(VHostOperations::class.java)
    protected val connectionOperations: ConnectionOperations by inject(ConnectionOperations::class.java)

    protected open val connectionName by option("--connection", help = "Connection name to use")
    protected open val virtualHost by option("--vhost", help = "Virtual host to use")

    protected fun <T> withConnection(block: (RabbitMQConnection) -> T): T? {
        val connection = if (connectionName.isNullOrBlank().not()) connectionOperations.getConnectionByName(connectionName!!)
        else connectionOperations.getDefaultConnection()

        if (connection == null) {
            logger.error { "No connection found" }
            terminal.error("No connection found")
            return null
        }

        try {
            val rabbitConnection = rabbitClient.connect(connection)?.let { connection ->
                if (virtualHost != null) {
                    val vHost = vHostOperations.get(virtualHost!!, connection)

                    if (vHost == null) {
                        logger.error { "Virtual host '$virtualHost' not found" }
                        terminal.error("Virtual host '$virtualHost' not found")
                        return null
                    }

                    return@let RabbitMQConnection(
                        connection = connection.connection,
                        channel = connection.channel,
                        connectionInfo = connection.connectionInfo.copy(vHost = vHost)
                    )
                }

                connection
            } ?: run {
                logger.error { "Failed to connect to RabbitMQ at ${connection.host}:${connection.port}" }
                terminal.error("Failed to connect to RabbitMQ at ${connection.host}:${connection.port}")
                return null
            }

            return rabbitConnection.use { conn ->
                try {
                    conn.keepAlive()
                    block(conn)
                } catch (e: Exception) {
                    logger.error(e) { "Error while executing operation: ${e.message}" }
                    terminal.error("Error: ${e.message}")
                    null
                } finally {
                    conn.release()
                    conn.close()
                }
            }
        } catch (e: Exception) {
            logger.error(e) { "Failed to establish connection: ${e.message}" }
            terminal.error("Failed to establish connection: ${e.message}")
            return null
        }
    }

    override suspend fun run() {
    }
}