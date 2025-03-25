package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.danger
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.usecase.MessageOperations
import org.koin.java.KoinJavaComponent.inject

class Delete : CliktCommandWrapper("delete") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val messageId by argument(name = "message_id", help = "ID of the message to delete")
    private val queueName by argument(name = "queue_name", help = "Name of the queue containing the message")
    private val force by option("--force", help = "Delete without confirmation").flag()

    override suspend fun run() {
        val terminal = terminal

        if (!force) {
            terminal.warning("Are you sure you want to delete message ${terminal.formatName(messageId)} from queue ${terminal.formatName(queueName)}? (y/N)")
            val response = readLine()?.lowercase()
            if (response != "y" && response != "yes") {
                terminal.danger("Operation cancelled.")
                return
            }
        }

        withConnection { connection ->
            val result = messageOperations.deleteMessage(messageId, queueName, connection)
            if (result) {
                terminal.success("Deleted message #$messageId from queue queueName.")
            } else {
                terminal.error("Failed to delete message ${terminal.formatName(messageId)} from queue ${terminal.formatName(queueName)}. Check if the message exists or if there are connection issues.")
            }
        }
    }
}