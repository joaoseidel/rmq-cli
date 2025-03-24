package com.luizalabs.rmq.clikt.formatters

import com.github.ajalt.mordant.rendering.BorderType
import com.github.ajalt.mordant.table.table
import com.github.ajalt.mordant.terminal.Terminal
import com.luizalabs.rmq.core.domain.Connection

fun Connection.toTable(terminal: Terminal) = table {
    borderType = BorderType.ASCII
    header { row("Name", "Host", "Selected vHost", "Is default connection?") }
    body { row("'${name}'", host, vHost.name, if (isDefault) "Yes" else "") }
}.render(terminal)

fun List<Connection>.toTable(terminal: Terminal) = table {
    borderType = BorderType.ASCII
    header { row("Name", "Host", "Selected vHost", "Is default connection?") }
    body { forEach { row("'${it.name}'", it.host, it.vHost.name, if (it.isDefault) "Yes" else "") } }
}.render(terminal)