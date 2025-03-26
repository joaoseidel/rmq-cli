﻿package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.arguments.convert
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.mordant.terminal.success
import io.joaoseidel.rmq.clikt.CliktCommandWrapper
import io.joaoseidel.rmq.clikt.error
import io.joaoseidel.rmq.clikt.formatName
import io.joaoseidel.rmq.core.domain.CompositeMessageId
import io.joaoseidel.rmq.core.usecase.MessageOperations
import org.koin.java.KoinJavaComponent.inject

class Requeue : CliktCommandWrapper("requeue") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val messageId by argument(name = "message_id", help = "ID of the message to reprocess").convert { CompositeMessageId(it) }
    private val fromQueue by option("--from", help = "Name of the queue to reprocess a message from").required()
    private val toQueue by option("--to", help = "Name of the queue to reprocess a message to").required()

    override suspend fun run() {
        val terminal = terminal

        withConnection {
            val message = messageOperations.findMessage(messageId, fromQueue, it) ?: run {
                terminal.error("Message ${terminal.formatName(messageId.value)} not found in queue ${terminal.formatName(fromQueue)}.")
                return@withConnection
            }

            if (messageOperations.requeueMessage(message, toQueue, it)) {
                terminal.success("Requeued message #$messageId from queue $fromQueue to $toQueue.")
            } else {
                terminal.error("Failed to requeue message ${terminal.formatName(messageId.value)} from queue ${terminal.formatName(fromQueue)}. Check connection issues.")
            }
        }
    }
}