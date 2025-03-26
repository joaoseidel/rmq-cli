package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.arguments.convert
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.clikt.formatters.toTable
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.usecase.MessageOperations
import org.koin.java.KoinJavaComponent.inject

class Inspect : CliktCommandWrapper("inspect") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val messageId by argument(name = "message_id", help = "ID of the message to inspect").convert { CompositeMessageId(it) }
    private val queueName by argument(name = "queue_name", help = "Name of the queue containing the message")

    override suspend fun run() {
        val terminal = terminal

        withConnection { connection ->
            val message = messageOperations.findMessage(
                messageId = messageId,
                queueName = queueName,
                connection = connection
            )

            if (message == null) {
                terminal.error("Message ${terminal.formatName(messageId.value)} not found in queue ${terminal.formatName(queueName)}.")
                return@withConnection
            }

            echo(message.toTable(terminal))
        }
    }
}