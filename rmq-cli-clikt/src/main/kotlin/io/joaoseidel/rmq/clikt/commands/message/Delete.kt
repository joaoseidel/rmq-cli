package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.arguments.convert
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.mordant.terminal.danger
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.usecase.MessageOperations
import kotlinx.coroutines.runBlocking
import org.koin.java.KoinJavaComponent.inject

class Delete : CliktCommandWrapper("delete") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val messageId by argument(
        name = "message_id",
        help = "ID of the message to delete"
    ).convert { CompositeMessageId(it) }
    private val queueName by argument(name = "queue_name", help = "Name of the queue containing the message")
    private val force by option("--force", help = "Delete without confirmation").flag()

    override suspend fun run() {
        val terminal = terminal

        if (!force) {
            val messageIdFormatted = terminal.formatName(messageId.value)
            val queueNameFormatted = terminal.formatName(queueName)
            terminal.warning("Are you sure you want to delete message $messageIdFormatted from queue $queueNameFormatted? (y/N)")

            val response = readlnOrNull()?.lowercase()
            if (response != "y" && response != "yes") {
                terminal.danger("Operation cancelled.")
                return
            }
        }

        withConnection { connection ->
            val operationResult = runBlocking {
                messageOperations.safeDeleteMessage(messageId, queueName, connection)
            }

            terminal.success("Message #${messageId.value} deleted from $queueName.")

            if (operationResult.failed > 0) {
                val formatCount = terminal.formatCount(operationResult.failed, "message")
                terminal.error("Failed to requeue $formatCount to $queueName after delete operation.")
                terminal.warning("The operation ${operationResult.id} was saved successfuly under the message_backup_operations file.")
            }
        }
    }
}