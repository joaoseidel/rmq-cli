package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.clikt.formatters.toTable
import io.joaoseidel.rmq.core.usecase.QueueOperations
import org.koin.java.KoinJavaComponent.inject

class Inspect : CliktCommandWrapper("inspect") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)

    private val queueName by argument(name = "queue_name", help = "Name of the queue to inspect")
    private val verbose by option("--verbose", help = "Display additional message details").flag()

    override suspend fun run() {
        val terminal = terminal

        withConnection { connection ->
            val queue = queueOperations.getQueue(queueName, connection) ?: run {
                terminal.error("Queue ${terminal.formatName(queueName)} not found.")
                return@withConnection
            }

            terminal.warning("Queue details for $queueName:")

            if (verbose) {
                echo(queue.toString())
            } else {
                echo(queue.toTable(terminal))
            }
        }
    }
}