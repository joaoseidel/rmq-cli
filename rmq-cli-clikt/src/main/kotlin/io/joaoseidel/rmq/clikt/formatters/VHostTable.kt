package io.joaoseidel.rmq.clikt.formatters

import com.github.ajalt.mordant.rendering.BorderType
import com.github.ajalt.mordant.table.table
import com.github.ajalt.mordant.terminal.Terminal
import io.joaoseidel.rmq.core.domain.VHost

fun VHost.toTable(terminal: Terminal) = table {
    borderType = BorderType.ASCII
    header { row("Name", "Description", "Is default in connection?") }
    body { row("'${name}'", description, if (isDefault) "Yes" else "") }
}.render(terminal)

fun List<VHost>.toTable(terminal: Terminal) = table {
    borderType = BorderType.ASCII
    header { row("Name", "Description", "Is default in connection?") }
    body { forEach { row("'${it.name}'", it.description, if (it.isDefault) "Yes" else "") } }
}.render(terminal)