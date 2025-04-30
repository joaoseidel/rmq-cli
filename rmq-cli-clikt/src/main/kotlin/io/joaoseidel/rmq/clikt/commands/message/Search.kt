package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.warning
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatCount
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.clikt.formatProperty
import io.joaoseidel.rmq.clikt.askConfirmation
import io.joaoseidel.rmq.clikt.formatters.toTable
import io.joaoseidel.rmq.core.usecase.MessageOperations
import org.koin.java.KoinJavaComponent.inject

class Search : CliktCommandWrapper("search") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val pattern by argument(name = "pattern", help = "Search pattern (text to search for in message bodies)")
    private val queue by option("--queue", help = "Specific queue to search in (exact name)")
    private val queuePattern by option("--queue-pattern", help = "Pattern to filter queues (glob syntax: * and ?)")
    private val limit by option("--limit", help = "Maximum number of messages to search in each queue").int()
    private val global by option("--global", help = "Search in all queues in the virtual host").flag()

    override suspend fun run() {
        val terminal = terminal

        val formattedQueueOption = terminal.formatName("--queue")
        val formattedQueuePatternOption = terminal.formatProperty("--queue-pattern")
        val formattedGlobalOption = terminal.formatProperty("--global")

        if (
            (queue != null && queuePattern != null) ||
            (queue != null && global) ||
            (queuePattern != null && global)
        ) {
            terminal.error("You can only use one of: $formattedQueueOption, $formattedQueuePatternOption, or $formattedGlobalOption")
            return
        }

        if (queue == null && queuePattern == null && !global) {
            terminal.error("You must specify one of: $formattedQueueOption, $formattedQueuePatternOption, or $formattedGlobalOption")
            return
        }


        withConnection { connection ->
            if (global || queuePattern != null) {
                val queueCount = rabbitClient.listQueues(queuePattern, connection).size

                val question = buildString {
                    appendLine("You are about to search for '$pattern' across all $queueCount queues in the virtual host.")
                    appendLine("This operation may take some time and consume significant resources.")
                    append("Are you sure you want to continue?")
                }

                if (terminal.askConfirmation(question)) {
                    terminal.error("Operation cancelled.")
                    return@withConnection
                }
            }

            val messages = when {
                queue != null -> {
                    messageOperations.searchMessages(
                        pattern = pattern,
                        queueName = queue,
                        count = limit ?: 100,
                        connection = connection
                    )
                }

                queuePattern != null -> {
                    messageOperations.searchMessagesInQueuesByPattern(
                        messagePattern = pattern,
                        queuePattern = queuePattern!!,
                        messageLimit = limit ?: 100,
                        connection = connection
                    )
                }

                // global
                else -> {
                    messageOperations.searchMessagesInQueuesByPattern(
                        messagePattern = pattern,
                        queuePattern = ".",
                        messageLimit = limit ?: 100,
                        connection = connection
                    )
                }
            }

            if (messages.isEmpty()) {
                terminal.error("No messages matching pattern ${terminal.formatName(pattern)} found with a limit of $limit per queue.")
                return@withConnection
            }

            terminal.warning("Found ${terminal.formatCount(messages.size, "message")} matching pattern '$pattern':")
            echo()

            echo(messages.toTable(terminal, pattern))
        }
    }
}