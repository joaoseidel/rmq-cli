package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.clikt.formatProperty
import io.joaoseidel.rmq.core.usecase.QueueOperations
import kotlinx.coroutines.runBlocking
import org.koin.java.KoinJavaComponent.inject

class Reprocess : CliktCommandWrapper("reprocess") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)

    private val fromQueue by option("--from", help = "Name of the queue to reprocess a message from").required()
    private val limit by option("--limit", help = "Limit of messages to reprocess").int()
    private val all by option("--all", help = "Reprocess all messages in the queue").flag()
    private val unsafe by option("--unsafe", help = "Use unsafe mode without backup (not recommended)").flag()

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

            if (unsafe) {
                val requeueMessages = queueOperations.reprocessMessages(fromQueue, messageLimit, it)
                if (requeueMessages > 0) {
                    val formatCount = terminal.formatCount(requeueMessages, "message")
                    terminal.success("Reprocess $formatCount from queue $fromQueue.")
                    return@withConnection
                }

                terminal.error("Failed to requeue messages from queue ${terminal.formatName(fromQueue)}. Check if the queue is empty or if there are connection issues.")
                return@withConnection
            }

            val operationResult = runBlocking {
                queueOperations.safeReprocessMessages(fromQueue, messageLimit, it)
            }

            if (operationResult.successful > 0) {
                val formatCount = terminal.formatCount(operationResult.successful, "message")
                terminal.success("Reprocess $formatCount from queue $fromQueue.")
            }

            if (operationResult.failed > 0) {
                val formatCount = terminal.formatCount(operationResult.failed, "message")
                terminal.error("Failed to reprocess $formatCount from queue $fromQueue.")
                terminal.warning("The operation ${operationResult.id} was saved successfuly under the message_backup_operations file.")
            }
        }
    }
}