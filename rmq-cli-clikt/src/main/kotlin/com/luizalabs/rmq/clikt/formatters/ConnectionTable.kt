package com.luizalabs.rmq.clikt.formatters

import com.github.ajalt.mordant.rendering.BorderType
import com.github.ajalt.mordant.table.table
import com.github.ajalt.mordant.terminal.Terminal
import com.luizalabs.rmq.core.domain.ConnectionInfo
import com.luizalabs.rmq.core.domain.ConnectionInfo.AmqpConnectionInfo
import com.luizalabs.rmq.core.domain.ConnectionInfo.HttpConnectionInfo

fun ConnectionInfo.toTable(terminal: Terminal) = table {
    borderType = BorderType.ASCII

    val typeName = when (this@toTable) {
        is AmqpConnectionInfo -> "AMQP"
        is HttpConnectionInfo -> "HTTP"
    }

    val portsString = when (this@toTable) {
        is AmqpConnectionInfo -> "$amqpPort (AMQP) / $httpPort (HTTP)"
        is HttpConnectionInfo -> "$httpPort (HTTP)"
    }

    header { row("Name", "Host", "Type", "Port", "Selected vHost", "Is default?") }
    body { row("'$name'", host, typeName, portsString, vHost.name, if (isDefault) "Yes" else "No") }
}.render(terminal)


fun List<ConnectionInfo>.toTable(terminal: Terminal) = table {
    borderType = BorderType.ASCII

    header { row("Name", "Host", "Type", "Port", "Selected vHost", "Is default?") }
    body {
        forEach { conn ->
            val typeName = when (conn) {
                is AmqpConnectionInfo -> "AMQP"
                is HttpConnectionInfo -> "HTTP"
            }

            val portsString = when (conn) {
                is AmqpConnectionInfo -> "${conn.amqpPort} (AMQP) / ${conn.httpPort} (HTTP)"
                is HttpConnectionInfo -> "${conn.httpPort} (HTTP)"
            }

            row("'${conn.name}'", conn.host, typeName, portsString, conn.vHost.name, if (conn.isDefault) "Yes" else "No")
        }
    }
}.render(terminal)