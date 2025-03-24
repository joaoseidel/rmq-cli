package com.luizalabs.rmq.clikt

import com.github.ajalt.mordant.terminal.Terminal

fun Terminal.error(message: String) = println("${theme.danger("Error:")} $message")
fun Terminal.formatName(name: String) = theme.info("'$name'")
fun Terminal.formatCount(count: Int, label: String) = "$count ${pluralize(count, label)}"
fun Terminal.formatProperty(property: String) = theme.muted(property)

private fun pluralize(count: Int, singular: String): String {
    val pluralMap = mapOf(
        "message" to "messages",
        "queue" to "queues",
        "connection" to "connections",
        "vhost" to "vhosts"
    )

    return if (count == 1) singular else pluralMap[singular] ?: "${singular}s"
}