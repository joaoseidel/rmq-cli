package com.luizalabs.rmq.clikt.commands.connection.vhost

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.subcommands
import com.luizalabs.rmq.core.ports.input.RabbitMQClient
import com.luizalabs.rmq.core.usecase.ConnectionOperations
import com.luizalabs.rmq.core.usecase.VHostOperations

class Root : SuspendingCliktCommand("vhost") {
    init {
        subcommands(
            List(),
            SetDefault()
        )
    }

    override suspend fun run() {
    }
}