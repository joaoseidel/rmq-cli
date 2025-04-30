package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.danger
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.askConfirmation
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.usecase.QueueOperations
import org.koin.java.KoinJavaComponent.inject

class Purge : CliktCommandWrapper("purge") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)

    private val queueName by argument(name = "queue_name", help = "Name of the queue to purge")
    private val force by option("--force", help = "Purge without confirmation").flag()

    override suspend fun run() {
        withConnection { connection ->
            val terminal = terminal
            val vhost = connection.connectionInfo.vHost

            val queue = queueOperations.getQueue(queueName, connection)
            if (queue == null) {
                terminal.error("Queue ${terminal.formatName(queueName)} not found in vhost ${terminal.formatName(vhost.name)}.")
                return@withConnection
            }

            if (!force) {
                terminal.warning(
                    "Queue $queueName contains ${
                        terminal.formatCount(
                            queue.totalMessages.toInt(),
                            "message"
                        )
                    }."
                )

                if (terminal.askConfirmation("Are you sure you want to purge this queue? All messages will be permanently deleted.")) {
                    terminal.danger("Operation cancelled.")
                    return@withConnection
                }
            }

            if (queueOperations.purgeQueue(queueName, connection)) {
                terminal.success(
                    "Purged queue $queueName. ${
                        terminal.formatCount(
                            queue.totalMessages.toInt(),
                            "message"
                        )
                    } were removed."
                )
            } else {
                terminal.error("Failed to purge queue ${terminal.formatName(queueName)}. Check if the queue exists or if there are connection issues.")
            }
        }
    }
}