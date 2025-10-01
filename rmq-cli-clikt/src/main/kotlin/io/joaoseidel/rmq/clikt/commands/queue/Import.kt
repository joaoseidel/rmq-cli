package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.mordant.terminal.Terminal
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.domain.RabbitMQConnection
import io.joaoseidel.rmq.core.usecase.MessageOperations
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import org.koin.java.KoinJavaComponent.inject
import java.io.File

class Import : CliktCommandWrapper("import") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val queueName by argument("queue_name", help = "Name of the queue to import messages into")
    private val inputFile by option("-i", "--input", help = "Input JSON file path").required()

    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    override suspend fun run() {
        val terminal = terminal

        withConnection { connection ->
            val file = File(inputFile)
            if (!file.exists() || !file.isFile) {
                terminal.error("Input file ${terminal.formatName(inputFile)} not found or is not a file.")
                return@withConnection
            }

            try {
                val jsonContent = file.readText(Charsets.UTF_8)
                val messages = json.decodeFromString(ListSerializer(Message.serializer()), jsonContent)

                if (messages.isEmpty()) {
                    terminal.warning("No messages found in the input file.")
                    return@withConnection
                }

                importMessages(messages, connection, terminal)
            } catch (e: Exception) {
                terminal.error("Failed to parse the input file: ${e.message ?: "Unknown error"}")
            }
        }
    }

    private fun importMessages(messages: Collection<Message>, connection: RabbitMQConnection, terminal: Terminal) {
        var successCount = 0
        var failureCount = 0

        messages.forEachIndexed { index: Int, msg: Message ->
            try {
                val success = messageOperations.publishToQueue(
                    queueName = queueName,
                    payload = msg.payload,
                    connection = connection
                )

                if (success) {
                    successCount++
                } else {
                    failureCount++
                    terminal.warning("Failed to import message #${index + 1}")
                }
            } catch (e: Exception) {
                failureCount++
                terminal.warning("Error importing message #${index + 1}: ${e.message ?: "Unknown error"}")
            }
        }

        if (successCount > 0) {
            terminal.success(
                "Successfully imported ${terminal.formatCount(successCount, "message")} " +
                    "into queue ${terminal.formatName(queueName)}."
            )
        }

        if (failureCount > 0) {
            terminal.warning("Failed to import ${terminal.formatCount(failureCount, "message")}.")
        }
    }
}