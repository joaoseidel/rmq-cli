package io.joaoseidel.rmq.clikt.commands.queue

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.subcommands

class Root : SuspendingCliktCommand("queue") {
    init {
        subcommands(
            List(),
            Search(),
            Inspect(),
            Requeue(),
            Consume(),
            Export(),
            Import(),
            Purge(),
        )
    }

    override suspend fun run() {
    }
}