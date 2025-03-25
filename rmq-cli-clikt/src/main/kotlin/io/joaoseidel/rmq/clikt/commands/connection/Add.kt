package io.joaoseidel.rmq.clikt.commands.connection

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.clikt.parameters.types.choice
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.success
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatProperty
import io.joaoseidel.rmq.core.domain.ConnectionInfo
import io.joaoseidel.rmq.core.domain.VHost
import io.joaoseidel.rmq.core.usecase.ConnectionOperations
import org.koin.java.KoinJavaComponent.inject

class Add : SuspendingCliktCommand("add") {
    private val connectionOperations: ConnectionOperations by inject(ConnectionOperations::class.java)

    private val name by argument("name", help = "Friendly name for the connection")
    private val host by option("--host", help = "RabbitMQ server hostname").required()
    private val username by option("--username", help = "RabbitMQ username").required()
    private val password by option("--password", help = "RabbitMQ password").required()
    private val vhost by option("--vhost", help = "RabbitMQ virtual host").default("/")
    private val useSsl by option("--ssl", help = "Use SSL/TLS for connection").flag()

    private val connectionType by option(
        "--type",
        help = "Connection type: 'amqp' for messaging or 'http' for management API only"
    ).choice("amqp", "http")

    private val amqpPort by option(
        "--amqp-port",
        help = "Port for AMQP protocol (default: 5672)"
    ).int().default(5672)

    private val httpPort by option(
        "--http-port",
        help = "Port for HTTP Management API (default: 15672)"
    ).int().default(15672)

    override suspend fun run() {
        val vHostObj = VHost(name = vhost)
        val terminal = terminal

        val connection = when (connectionType) {
            "amqp" -> ConnectionInfo.AmqpConnectionInfo(
                name = name,
                host = host,
                amqpPort = amqpPort,
                httpPort = httpPort,
                username = username,
                password = password,
                vHost = vHostObj,
                useSsl = useSsl,
                isDefault = true
            )

            "http" -> ConnectionInfo.HttpConnectionInfo(
                name = name,
                host = host,
                httpPort = httpPort,
                username = username,
                password = password,
                vHost = vHostObj,
                useSsl = useSsl,
                isDefault = true
            )

            else -> {
                terminal.error("Invalid connection type: $connectionType. Must be either 'amqp' or 'http'.")
                return
            }
        }

        val result = connectionOperations.addConnection(connection)

        if (result) {
            terminal.success("Added $connectionType connection '$name'. This connection is now the default.")
            echo("You can now set the default vhost with '${terminal.formatProperty("rmq connection vhost set-default <vhost-name>")}'.")
        } else {
            terminal.error("Failed to add connection. Check credentials and server availability.")
        }
    }
}