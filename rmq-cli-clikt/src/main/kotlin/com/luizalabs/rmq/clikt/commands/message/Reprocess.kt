﻿package com.luizalabs.rmq.clikt.commands.message

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.options.required
import com.github.ajalt.mordant.terminal.success
import com.luizalabs.rmq.clikt.CliktCommandWrapper
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatName
import com.luizalabs.rmq.core.usecase.MessageOperations
import org.koin.java.KoinJavaComponent.inject

class Reprocess : CliktCommandWrapper("reprocess") {
    private val messageOperations: MessageOperations by inject(MessageOperations::class.java)

    private val messageId by argument(name = "message_id", help = "ID of the message to reprocess")
    private val fromQueue by option("--from", help = "Name of the queue to reprocess a message from").required()

    override suspend fun run() {
        val terminal = terminal

        withConnection {
            val message = messageOperations.findMessage(messageId, fromQueue, it) ?: run {
                terminal.error("Message ${terminal.formatName(messageId)} not found in queue ${terminal.formatName(fromQueue)}.")
                return@withConnection
            }

            if (messageOperations.reprocessMessage(message, it)) {
                terminal.success("Reprocessed message $messageId from queue $fromQueue")
            } else {
                terminal.error("Failed to reprocess message ${terminal.formatName(messageId)} from queue ${terminal.formatName(fromQueue)}. Check connection issues.")
            }
        }
    }
}