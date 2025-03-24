package com.luizalabs.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import com.luizalabs.rmq.clikt.CliktCommandWrapper
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatCount
import com.luizalabs.rmq.clikt.formatName
import com.luizalabs.rmq.core.usecase.MessageOperations
import com.luizalabs.rmq.core.usecase.QueueOperations
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.koin.java.KoinJavaComponent.inject
import java.io.File

class Export : CliktCommandWrapper("export") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val queueName by argument("queue_name", help = "Name of the queue to export messages from")
    private val outputFile by option("-o", "--output", help = "Output file path").required()
    private val limit by option("--limit", help = "Maximum number of messages to export").int().default(100)
    private val ack by option("--ack", help = "Acknowledge messages after export").flag()

    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override suspend fun run() {
        val terminal = terminal

        withConnection { connection ->
            val queue = queueOperations.getQueue(queueName, connection) ?: run {
                terminal.error("Queue ${terminal.formatName(queueName)} not found.")
                return@withConnection
            }

            val messages = messageOperations.getMessages(queue.name, limit, ack, connection).ifEmpty {
                terminal.error("No messages found in queue ${terminal.formatName(queueName)}.")
                return@withConnection
            }

            terminal.warning("Exporting ${terminal.formatCount(messages.size, "message")} from queue $queueName...")

            try {
                val output = json.encodeToString(messages)
                File(outputFile).writeText(output, Charsets.UTF_8)
                terminal.success("Exported messages to $outputFile.")
            } catch (e: Exception) {
                terminal.error("Failed to write to file ${terminal.formatName(outputFile)}: ${e.message ?: "Unknown error"}")
            }
        }
    }
}