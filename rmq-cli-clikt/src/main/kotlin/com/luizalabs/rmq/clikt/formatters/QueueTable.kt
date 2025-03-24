package com.luizalabs.rmq.clikt.formatters

import com.github.ajalt.mordant.rendering.BorderType
import com.github.ajalt.mordant.table.table
import com.github.ajalt.mordant.terminal.Terminal
import com.luizalabs.rmq.core.domain.Queue
import com.luizalabs.rmq.core.removeGlob

fun Queue.toTable(terminal: Terminal, search: String = "") = table {
    borderType = BorderType.ASCII

    val search = search.removeGlob()
    val highlightedName = name.replace(search, terminal.theme.info(search))
    header { row("Name", "VHost", "No. Ready", "No. Unacknowledged") }
    body { row(highlightedName, vhost, messagesReady, messagesUnacknowledged) }
}.render(terminal)

fun List<Queue>.toTable(terminal: Terminal, search: String = "") = table {
    borderType = BorderType.ASCII

    header { row("Name", "VHost", "No. Ready", "No. Unacknowledged") }
    body {
        forEach {
            val search = search.removeGlob()
            val highlightedName = it.name.replace(search, terminal.theme.info(search))
            row(highlightedName, it.vhost, it.messagesReady, it.messagesUnacknowledged)
        }
    }
}.render(terminal)