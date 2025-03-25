package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.success
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.clikt.formatProperty
import io.joaoseidel.rmq.core.usecase.QueueOperations
import org.koin.java.KoinJavaComponent.inject

class Reprocess : CliktCommandWrapper("reprocess") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)

    private val fromQueue by option("--from", help = "Name of the queue to reprocess a message from").required()
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

            val limit = if (all) Int.MAX_VALUE else limit!!
            val reprocessedMessages = queueOperations.reprocessMessages(fromQueue, limit, it)
            if (reprocessedMessages > 0) {
                terminal.success("Reprocessed ${terminal.formatCount(reprocessedMessages, "message")} from queue $fromQueue.")
            } else {
                terminal.error("Failed to reprocess messages from queue ${terminal.formatName(fromQueue)}. Check if the queue is empty or if there are connection issues.")
            }
        }
    }
}