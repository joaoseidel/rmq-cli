package io.joaoseidel.rmq.clikt.commands.connection

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.mordant.terminal.success
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.usecase.ConnectionOperations
import org.koin.java.KoinJavaComponent.inject

class SetDefault : SuspendingCliktCommand("set-default") {
    private val connectionOperations: ConnectionOperations by inject(ConnectionOperations::class.java)

    private val connectionName by argument(name = "connection_name", help = "Name of the connection to set as default")

    override suspend fun run() {
        val terminal = terminal

        val connection = connectionOperations.getConnectionByName(connectionName) ?: run {
            terminal.error("Connection ${terminal.formatName(connectionName)} not found.")
            return
        }

        val success = connectionOperations.setDefaultConnection(connection.id)

        if (success) {
            terminal.success("Set $connectionName as the default connection.")
        } else {
            terminal.error("Failed to set connection ${terminal.formatName(connectionName)} as default. Please check the logs for more information.")
        }
    }
}