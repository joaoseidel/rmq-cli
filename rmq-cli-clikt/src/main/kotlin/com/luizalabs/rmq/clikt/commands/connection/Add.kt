package com.luizalabs.rmq.clikt.commands.connection

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.success
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatProperty
import com.luizalabs.rmq.core.domain.Connection
import com.luizalabs.rmq.core.domain.VHost
import com.luizalabs.rmq.core.usecase.ConnectionOperations
import org.koin.java.KoinJavaComponent.inject

class Add : SuspendingCliktCommand("add") {
    private val connectionOperations: ConnectionOperations by inject(ConnectionOperations::class.java)

    private val name by argument("name", help = "Friendly name for the connection")
    private val host by option("--host", help = "RabbitMQ server hostname").required()
    private val port by option("--port", help = "RabbitMQ server port").int().required()
    private val username by option("--username", help = "RabbitMQ username").required()
    private val password by option("--password", help = "RabbitMQ password").required()
    private val vhost by option("--vhost", help = "RabbitMQ virtual host").default("/")
    private val useSsl by option("--ssl", help = "Use SSL/TLS for connection").flag()

    override suspend fun run() {
        val connection = Connection(
            name = name,
            host = host,
            port = port,
            username = username,
            password = password,
            vHost = VHost(name = vhost),
            useSsl = useSsl,
            isDefault = true,
        )

        val terminal = terminal

        val result = connectionOperations.addConnection(connection)

        if (result) {
            terminal.success("Added connection $name. This connection is now the default.")
            echo("You can now set the default vhost with ${terminal.formatProperty("rmq connection vhost set-default <vhost-name>")}.")
        } else {
            terminal.error("Failed to add connection. Check credentials and server availability.")
        }
    }
}