package com.luizalabs.rmq.clikt.commands.connection

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.warning
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatCount
import com.luizalabs.rmq.clikt.formatProperty
import com.luizalabs.rmq.clikt.formatters.toTable
import com.luizalabs.rmq.core.usecase.ConnectionOperations
import org.koin.java.KoinJavaComponent.inject

class List : SuspendingCliktCommand("list") {
    private val connectionOperations: ConnectionOperations by inject(ConnectionOperations::class.java)

    private val verbose by option("--verbose", help = "Show detailed connection information").flag()

    override suspend fun run() {
        val connections = connectionOperations.listConnections()

        val terminal = terminal

        if (connections.isEmpty()) {
            terminal.error("No connections found.")
            return
        }

        terminal.warning("Found ${terminal.formatCount(connections.size, "connection")}:")
        echo()

        if (verbose) {
            connections.forEachIndexed { i, conn -> echo("${i + 1}. ${terminal.formatProperty(conn.toSecureString())}") }
        } else {
            echo(connections.toTable(terminal))
        }
    }
}