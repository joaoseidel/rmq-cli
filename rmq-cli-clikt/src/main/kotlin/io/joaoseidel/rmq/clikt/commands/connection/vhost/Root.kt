package io.joaoseidel.rmq.clikt.commands.connection.vhost

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.subcommands

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