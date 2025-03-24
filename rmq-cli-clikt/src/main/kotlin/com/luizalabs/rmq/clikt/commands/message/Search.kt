package com.luizalabs.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.warning
import com.luizalabs.rmq.clikt.CliktCommandWrapper
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatCount
import com.luizalabs.rmq.clikt.formatName
import com.luizalabs.rmq.clikt.formatProperty
import com.luizalabs.rmq.clikt.formatters.toTable
import com.luizalabs.rmq.core.usecase.MessageOperations
import org.koin.java.KoinJavaComponent.inject

class Search : CliktCommandWrapper("search") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val pattern by argument(name = "pattern", help = "Search pattern (text to search for in message bodies)")
    private val queue by option("--queue", help = "Specific queue to search in")
    private val limit by option("--limit", help = "Maximum number of messages to search in each queue").int()
    private val global by option("--global", help = "Search in all queues in the virtual host").flag()

    override suspend fun run() {
        val terminal = terminal

        if (queue != null && global) {
            terminal.error("You can't use ${terminal.formatProperty("--queue")} and ${terminal.formatProperty("--global")} together.")
            return
        }

        if (queue == null && !global) {
            terminal.error("You must use ${terminal.formatProperty("--queue")} or ${terminal.formatProperty("--global")}.")
            return
        }

        withConnection { connection ->
            val messages = messageOperations.searchMessages(
                pattern = pattern,
                queueName = queue,
                count = limit ?: Int.MAX_VALUE,
                connection = connection
            )

            if (messages.isEmpty()) {
                terminal.error("No messages matching pattern ${terminal.formatName(pattern)} found.")
                return@withConnection
            }

            terminal.warning("Found ${terminal.formatCount(messages.size, "message")} matching pattern $pattern:")
            echo()

            echo(messages.toTable(terminal, pattern))
        }
    }
}