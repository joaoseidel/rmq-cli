package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.Terminal
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.Queue
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.usecase.MessageOperations
import io.joaoseidel.rmq.core.usecase.QueueOperations
import kotlinx.serialization.json.Json
import org.koin.java.KoinJavaComponent.inject
import java.io.File
import kotlin.collections.List
import kotlin.collections.forEachIndexed
import kotlin.collections.isNotEmpty
import kotlin.collections.listOf
import kotlin.collections.mutableListOf
import kotlin.text.Charsets
import kotlin.text.lowercase

class Export : CliktCommandWrapper("export") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val queueName by argument("queue_name", help = "Name of the queue or pattern to export messages from")
    private val outputFile by option("-o", "--output", help = "Output file path").required()
    private val usePattern by option("--pattern", "-p", help = "Treat queue_name as a pattern (glob syntax: * and ?)").flag()
    private val limit by option("--limit", help = "Maximum number of messages to export from each queue").int().default(100)
    private val ack by option("--ack", help = "Acknowledge messages after export").flag()

    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override suspend fun run() {
        val terminal = terminal

        withConnection { connection ->
            val queuesToProcess = if (usePattern) {
                val matchingQueues = queueOperations.searchQueues(queueName, connection)
                if (matchingQueues.isEmpty()) {
                    terminal.error("No queues matching pattern ${terminal.formatName(queueName)} found.")
                    return@withConnection
                }

                terminal.warning("Found ${terminal.formatCount(matchingQueues.size, "queue")} matching pattern $queueName:")
                echo()

                matchingQueues.forEachIndexed { index, queue ->
                    echo("${index + 1}. ${terminal.formatName(queue.name)} (${queue.totalMessages} messages)")
                }

                echo()
                terminal.warning("You are about to export messages from all these queues (up to $limit messages each).")
                terminal.warning("Are you sure you want to continue? (y/N)")

                val response = readLine()?.lowercase()
                if (response != "y" && response != "yes") {
                    terminal.error("Operation cancelled.")
                    return@withConnection
                }

                matchingQueues
            } else {
                val queue = queueOperations.getQueue(queueName, connection) ?: run {
                    terminal.error("Queue ${terminal.formatName(queueName)} not found.")
                    return@withConnection
                }

                listOf(queue)
            }

            val allMessages = collectMessages(queuesToProcess, connection, terminal)
            if (allMessages.isEmpty()) {
                val queueName = if (usePattern) "any of the matching queues" else "queue $queueName"
                terminal.error("No messages found in $queueName.")
                return@withConnection
            }

            exportMessages(allMessages, queuesToProcess.size, terminal)
        }
    }

    private fun collectMessages(queues: List<Queue>, connection: RabbitMQConnection, terminal: Terminal): List<Message> {
        val messages = mutableListOf<Message>()

        for (queue in queues) {
            val queueMessages = messageOperations.getMessages(queue.name, limit, ack, connection)
            messages.addAll(queueMessages)

            if (queueMessages.isNotEmpty()) {
                echo("Retrieved ${terminal.formatCount(queueMessages.size, "message")} from ${terminal.formatName(queue.name)}")
            }
        }

        return messages
    }

    private fun exportMessages(messages: List<Message>, queueCount: Int, terminal: Terminal) {
        try {
            val output = json.encodeToString(messages)
            File(outputFile).writeText(output, Charsets.UTF_8)

            val successMsg = if (queueCount > 1) {
                "Exported ${terminal.formatCount(messages.size, "message")} from ${terminal.formatCount(queueCount, "queue")} to $outputFile."
            } else {
                "Exported ${terminal.formatCount(messages.size, "message")} to $outputFile."
            }

            terminal.success(successMsg)
        } catch (e: Exception) {
            terminal.error("Failed to write to file ${terminal.formatName(outputFile)}: ${e.message ?: "Unknown error"}")
        }
    }
}