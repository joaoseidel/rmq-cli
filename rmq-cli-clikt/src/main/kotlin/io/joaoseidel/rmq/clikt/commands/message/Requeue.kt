package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.arguments.convert
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.askConfirmation
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.usecase.MessageOperations
import kotlinx.coroutines.runBlocking
import org.koin.java.KoinJavaComponent.inject

class Requeue : CliktCommandWrapper("requeue") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val messageId by argument(
        name = "message_id",
        help = "ID of the message to reprocess"
    ).convert { CompositeMessageId(it) }
    private val fromQueue by option("--from", help = "Name of the queue to reprocess a message from").required()
    private val toQueue by option("--to", help = "Name of the queue to reprocess a message to").required()
    private val unsafe by option("--safe", help = "Use safe mode with backup (default)").flag(default = false)

    override suspend fun run() {
        val terminal = terminal

        withConnection {
            val message = messageOperations.findMessage(messageId, fromQueue, it) ?: run {
                terminal.error("Message #${messageId.value} not found in queue $fromQueue.")
                return@withConnection
            }

            if (unsafe) {
                if (messageOperations.requeueMessage(message, toQueue, it)) {
                    terminal.success("Requeued message #${message.id.value} from queue $fromQueue to $toQueue.")
                    return@withConnection
                }

                terminal.error("Failed to requeue message from queue ${terminal.formatName(fromQueue)}. Check if the queue is empty or if there are connection issues.")
                return@withConnection
            }

            val requeueMessageSummary = runBlocking {
                messageOperations.safeRequeueMessage(message, toQueue, it)
            }

            if (requeueMessageSummary.successful > 0) {
                terminal.success("Requeued #${message.id.value} from queue $fromQueue to $toQueue.")

                if (terminal.askConfirmation("Do you want to remove the message from the queue now?")) {
                    val deleteMessagesSummary = runBlocking {
                        messageOperations.safeDeleteMessage(messageId, fromQueue, it)
                    }

                    if (deleteMessagesSummary.successful > 0) {
                        val formatCount = terminal.formatCount(deleteMessagesSummary.successful, "message")
                        terminal.success("Deleted $formatCount from queue $fromQueue.")
                    }

                    if (deleteMessagesSummary.failed > 0) {
                        val formatCount = terminal.formatCount(deleteMessagesSummary.successful, "message")
                        terminal.warning("Failed to delete messages from queue $formatCount.")
                        terminal.warning("The operation ${deleteMessagesSummary.id} was saved successfuly under the message_backup_operations file.")
                    }
                }
            }

            if (requeueMessageSummary.failed > 0) {
                terminal.error("Failed to requeue #${message.id.value} from queue $fromQueue to $toQueue.")
                terminal.warning("The operation ${requeueMessageSummary.id} was saved successfuly under the message_backup_operations file.")
            }
        }
    }
}