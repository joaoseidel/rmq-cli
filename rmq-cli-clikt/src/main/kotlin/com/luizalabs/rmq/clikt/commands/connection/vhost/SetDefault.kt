package com.luizalabs.rmq.clikt.commands.connection.vhost

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.mordant.terminal.success
import com.luizalabs.rmq.clikt.CliktCommandWrapper
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatName

class SetDefault : CliktCommandWrapper("set-default") {
    private val vHostName by argument(name = "vhost_name", help = "Name of the VHost to set as default")

    override suspend fun run() {
        val terminal = terminal

        withConnection { connection ->
            val vhost = vHostOperations.get(vHostName, connection) ?: run {
                terminal.error("VHost ${terminal.formatName(vHostName)} not found in connection ${terminal.formatName(connection.connectionInfo.name)}.")
                return@withConnection
            }

            if (vHostOperations.setDefault(vhost.name, connection)) {
                terminal.success("Set VHost ${vhost.name} as default for connection ${connection.connectionInfo.name}.")
            } else {
                terminal.error("Failed to set VHost ${terminal.formatName(vhost.name)} as default. Please check the logs for more information.")
            }
        }
    }
}