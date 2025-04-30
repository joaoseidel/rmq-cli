package io.joaoseidel.rmq.clikt.commands.connection

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.arguments.optional
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.askConfirmation
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.usecase.ConnectionOperations
import org.koin.java.KoinJavaComponent.inject

class Remove : SuspendingCliktCommand("remove") {
    private val connectionOperations: ConnectionOperations by inject(ConnectionOperations::class.java)

    private val name by argument(name = "name", help = "Name of the connection to remove").optional()
    private val force by option("--force", help = "Remove without confirmation").flag()

    override suspend fun run() {
        val terminal = terminal

        val connections = connectionOperations.listConnections()
        if (connections.isEmpty()) {
            terminal.error("No connections found.")
            return
        }

        val connectionToRemove = if (name.isNullOrBlank().not()) {
            connectionOperations.getConnectionByName(name!!)
        } else {
            val defaultConnection = connectionOperations.getDefaultConnection()
            if (defaultConnection != null) {
                terminal.warning("Using default connection: ${defaultConnection.name}")
                defaultConnection
            } else {
                terminal.error("No default connection found. Please specify a connection name.")
                return
            }
        }

        if (connectionToRemove == null) {
            terminal.error("Connection ${terminal.formatName(name ?: "")} not found.")
            return
        }

        if (!force) {
            val connectionToRemoveFormatted = terminal.formatName(connectionToRemove.name)
            if (terminal.askConfirmation("Are you sure you want to remove connection $connectionToRemoveFormatted?")) {
                terminal.error("Operation cancelled.")
                return
            }
        }

        val result = connectionOperations.removeConnection(connectionToRemove.id)
        if (result) {
            terminal.success("Removed connection ${connectionToRemove.name}.")
        } else {
            terminal.error("Failed to remove connection. Please check the logs for more information.")
        }
    }
}