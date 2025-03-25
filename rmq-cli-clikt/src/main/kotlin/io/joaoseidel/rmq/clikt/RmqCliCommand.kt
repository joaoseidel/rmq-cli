package io.joaoseidel.rmq.clikt

import com.github.ajalt.clikt.command.SuspendingCliktCommand
import com.github.ajalt.clikt.core.context
import com.github.ajalt.clikt.core.subcommands
import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.mordant.rendering.AnsiLevel.TRUECOLOR
import com.github.ajalt.mordant.terminal.Terminal
import io.joaoseidel.rmq.clikt.commands.connection.Root as ConnectionRoot
import io.joaoseidel.rmq.clikt.commands.message.Root as MessageRoot
import io.joaoseidel.rmq.clikt.commands.queue.Root as QueueRoot

open class RmqCliCommand : SuspendingCliktCommand() {
    init {
        subcommands(
            ConnectionRoot(),
            QueueRoot(),
            MessageRoot()
        )

        context {
            terminal = Terminal(
                ansiLevel = TRUECOLOR,
                interactive = true
            )
        }
    }

    override suspend fun run() {
    }
}