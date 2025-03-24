package com.luizalabs.rmq.clikt.commands.connection

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.subcommands
import com.luizalabs.rmq.clikt.commands.connection.vhost.Root as VHostRoot

class Root : SuspendingCliktCommand("connection") {
    init {
        subcommands(
            VHostRoot(),
            Add(),
            List(),
            Remove(),
            SetDefault()
        )
    }

    override suspend fun run() {
    }
}