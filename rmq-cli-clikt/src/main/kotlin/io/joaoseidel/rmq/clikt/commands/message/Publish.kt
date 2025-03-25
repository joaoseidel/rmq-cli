package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.mordant.terminal.success
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatProperty
import io.joaoseidel.rmq.core.usecase.MessageOperations
import org.koin.java.KoinJavaComponent.inject

class Publish : CliktCommandWrapper("publish") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val payload by option("--payload", help = "Message content to publish").required()
    private val exchange by option("--exchange", help = "Exchange to publish to")
    private val routingKey by option("--routing-key", help = "Routing key for the message")
    private val queueName by option("--queue", help = "Queue to publish directly to")

    override suspend fun run() {
        val terminal = terminal

        if ((exchange == null || routingKey == null) && queueName == null) {
            terminal.error(
                "You must specify either ${terminal.formatProperty("--exchange")} and ${terminal.formatProperty("--routing-key")}, or ${
                    terminal.formatProperty("--queue")
                }"
            )
            return
        }

        if (exchange != null && routingKey != null && queueName != null) {
            terminal.error(
                "You cannot specify both ${terminal.formatProperty("--exchange")}/${terminal.formatProperty("--routing-key")} and ${
                    terminal.formatProperty("--queue")
                } at the same time"
            )
            return
        }

        withConnection { connection ->
            val result = if (queueName != null) {
                messageOperations.publishToQueue(queueName!!, payload.toByteArray(), connection)
            } else {
                messageOperations.publishToExchange(exchange!!, routingKey!!, payload.toByteArray(), connection)
            }

            if (result) {
                if (queueName != null) {
                    terminal.success("Published message to queue $queueName.")
                } else {
                    terminal.success("Published message to exchange $exchange with routing key $routingKey.")
                }
            } else {
                terminal.error("Failed to publish message. Check connection and destination details.")
            }
        }
    }
}