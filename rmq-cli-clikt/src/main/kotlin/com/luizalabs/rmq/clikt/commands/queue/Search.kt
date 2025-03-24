package com.luizalabs.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.warning
import com.luizalabs.rmq.clikt.CliktCommandWrapper
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatCount
import com.luizalabs.rmq.clikt.formatName
import com.luizalabs.rmq.clikt.formatProperty
import com.luizalabs.rmq.clikt.formatters.toTable
import com.luizalabs.rmq.core.usecase.QueueOperations
import org.koin.java.KoinJavaComponent.inject

class Search : CliktCommandWrapper("search") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)

    private val pattern by argument(help = "Search pattern (glob syntax: * and ? wildcards are supported)")
    private val verbose by option("--verbose", help = "Show detailed queue information").flag()

    override suspend fun run() {
        val terminal = terminal

        withConnection { connection ->
            val vhost = connection.connectionInfo.vHost

            val queues = queueOperations.searchQueues(pattern, connection)
            if (queues.isEmpty()) {
                terminal.error("No queues matching pattern ${terminal.formatName(pattern)} found in vhost ${terminal.formatName(vhost.name)}.")
                return@withConnection
            }

            terminal.warning("Found ${terminal.formatCount(queues.size, "queue")} matching pattern $pattern in vhost ${vhost.name}:")
            echo()

            if (verbose) {
                queues.forEachIndexed { i, queue -> echo("${i + 1}. ${terminal.formatProperty(queue.toString())}") }
            } else {
                echo(queues.toTable(terminal, pattern))
            }
        }
    }
}