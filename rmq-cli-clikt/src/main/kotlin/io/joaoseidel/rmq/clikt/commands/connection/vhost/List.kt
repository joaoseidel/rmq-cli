package io.joaoseidel.rmq.clikt.commands.connection.vhost

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatProperty
import io.joaoseidel.rmq.clikt.formatters.toTable

class List : CliktCommandWrapper("list") {
    private val verbose by option("--verbose", help = "Show detailed connection information").flag()

    override suspend fun run() {
        val terminal = this@List.terminal

        withConnection { connection ->
            val vHostList = vHostOperations.list(connection)

            terminal.warning("Found ${terminal.formatCount(vHostList.size, "virtual host")} on ${connection.connectionInfo.name}:")
            echo()

            if (verbose) {
                vHostList.forEachIndexed { i, vHost -> echo("${i + 1}. ${terminal.formatProperty(vHost.toString())}") }
            } else {
                echo(vHostList.toTable(terminal))
            }
        }
    }
}