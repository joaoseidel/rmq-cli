package io.joaoseidel.rmq.clikt.commands.message

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.subcommands

class Root : SuspendingCliktCommand("message") {
    init {
        subcommands(
            Inspect(),
            Search(),
            Publish(),
            Requeue(),
            Delete(),
        )
    }

    override suspend fun run() {
    }
}