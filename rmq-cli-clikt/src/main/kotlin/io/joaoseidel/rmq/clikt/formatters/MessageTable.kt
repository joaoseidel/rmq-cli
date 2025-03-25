package io.joaoseidel.rmq.clikt.formatters

import com.github.ajalt.mordant.rendering.BorderType
import com.github.ajalt.mordant.table.table
import com.github.ajalt.mordant.terminal.Terminal
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.removeGlob

fun Message.toTable(terminal: Terminal, search: String = "") = table {
    borderType = BorderType.ASCII

    val search = search.removeGlob()
    val highlightedId = id?.replace(search, terminal.theme.info(search)) ?: ""
    val highlightedPayload = bodyAsString().replace(search, terminal.theme.info(search))
    header { row("ID", "Exchange", "Routing key", "Queue", "Payload", "Properties") }
    body { row(highlightedId, exchange, routingKey, queue, highlightedPayload, properties) }
}.render(terminal)

fun List<Message>.toTable(terminal: Terminal, search: String = "") = table {
    borderType = BorderType.ASCII

    header { row("ID", "Exchange", "Routing key", "Queue", "Payload", "Properties") }
    body {
        forEach {
            val search = search.removeGlob()
            val highlightedId = it.id?.replace(search, terminal.theme.info(search)) ?: ""
            val highlightedPayload = it.bodyAsString().replace(search, terminal.theme.info(search))
            row(highlightedId, it.exchange, it.routingKey, it.queue, highlightedPayload, it.properties)
        }
    }
}.render(terminal)