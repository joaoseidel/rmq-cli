package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.*
import io.joaoseidel.rmq.core.usecase.QueueOperations
import kotlinx.coroutines.runBlocking
import org.koin.java.KoinJavaComponent.inject

class Requeue : CliktCommandWrapper("requeue") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)

    private val fromQueue by option("--from", help = "Name of the queue to reprocess a message from").required()
    private val toQueue by option("--to", help = "Name of the queue to reprocess a message to").required()
    private val limit by option("--limit", help = "Limit of messages to reprocess").int()
    private val all by option("--all", help = "Reprocess all messages in the queue").flag()

    override suspend fun run() {
        withConnection {
            val terminal = terminal

            if (all && limit != null) {
                terminal.error("You can't use ${terminal.formatProperty("--all")} and ${terminal.formatProperty("--limit")} together.")
                return@withConnection
            }

            if (!all && limit == null) {
                terminal.error("You must use ${terminal.formatProperty("--all")} or ${terminal.formatProperty("--limit")}.")
                return@withConnection
            }

            val messageLimit = if (all) Int.MAX_VALUE else limit!!

            val requeueMessagesSummary = runBlocking {
                queueOperations.safeRequeueMessages(fromQueue, toQueue, messageLimit, it)
            }

            if (requeueMessagesSummary.successful > 0) {
                var formatCount = terminal.formatCount(requeueMessagesSummary.successful, "message")
                terminal.success("Requeued $formatCount from queue $fromQueue to $toQueue.")

                if (terminal.askConfirmation("Do you want to remove the messages from the queue now?")) {
                    val messageIdList = requeueMessagesSummary.processedMessages.map { it.id }

                    val deleteMessagesSummary = runBlocking {
                        queueOperations.safeDeleteMessages(messageIdList, fromQueue, it)
                    }

                    if (deleteMessagesSummary.successful > 0) {
                        formatCount = terminal.formatCount(deleteMessagesSummary.successful, "message")
                        terminal.success("Deleted $formatCount from queue $fromQueue.")
                    }

                    if (deleteMessagesSummary.failed > 0) {
                        formatCount = terminal.formatCount(deleteMessagesSummary.successful, "message")
                        terminal.warning("Failed to delete messages from queue $formatCount.")
                        terminal.warning("The operation ${deleteMessagesSummary.id} was saved successfuly under the message_backup_operations file.")
                    }
                }
            }

            if (requeueMessagesSummary.failed > 0) {
                val formatCount = terminal.formatCount(requeueMessagesSummary.failed, "message")
                terminal.error("Failed to requeue $formatCount from queue $fromQueue to $toQueue.")
                terminal.warning("The operation ${requeueMessagesSummary.id} was saved successfuly under the message_backup_operations file.")
            }
        }
    }
}