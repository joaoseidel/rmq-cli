package io.joaoseidel.rmq.clikt.formatters

import com.github.ajalt.mordant.rendering.BorderType
import com.github.ajalt.mordant.table.table
import com.github.ajalt.mordant.terminal.Terminal
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.removeGlob
import io.joaoseidel.rmq.core.truncateAroundPattern

fun Message.toTable(terminal: Terminal, search: String = "") = table {
    borderType = BorderType.ASCII

    val searchPattern = search.removeGlob()
    val highlightedId = id.value.replace(searchPattern, terminal.theme.info(searchPattern))
    val truncatedPayload = bodyAsString().truncateAroundPattern(search)
    val highlightedPayload = truncatedPayload.replace(searchPattern, terminal.theme.info(searchPattern))

    header { row("ID", "Exchange", "Routing key", "Queue", "Payload", "Properties") }
    body { row(highlightedId, exchange, routingKey, queue, highlightedPayload, properties) }
}.render(terminal)

fun List<Message>.toTable(terminal: Terminal, search: String = "") = table {
    borderType = BorderType.ASCII

    header { row("ID", "Exchange", "Routing key", "Queue", "Payload", "Properties") }
    body {
        forEach {
            val searchPattern = search.removeGlob()
            val highlightedId = it.id.value.replace(searchPattern, terminal.theme.info(searchPattern))
            val truncatedPayload = it.bodyAsString().truncateAroundPattern(search)
            val highlightedPayload = truncatedPayload.replace(searchPattern, terminal.theme.info(searchPattern))
            row(highlightedId, it.exchange, it.routingKey, it.queue, highlightedPayload, it.properties)
        }
    }
}.render(terminal)