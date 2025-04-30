package io.joaoseidel.rmq.clikt

import com.github.ajalt.mordant.terminal.Terminal
import com.github.ajalt.mordant.terminal.warning

fun Terminal.error(message: String) = println("${theme.danger("Error:")} $message")
fun Terminal.formatName(name: String) = theme.info("'$name'")
fun Terminal.formatCount(count: Int, label: String) = "$count ${pluralize(count, label)}"
fun Terminal.formatProperty(property: String) = theme.muted(property)

fun Terminal.askConfirmation(question: String, defaultNo: Boolean = true): Boolean {
    warning("$question ${if (defaultNo) "(y/N)" else "(Y/n)"}")

    val response = readlnOrNull()?.lowercase()
    return when {
        defaultNo -> response == "y" || response == "yes"
        else -> response != "n" && response != "no"
    }
}

private fun pluralize(count: Int, singular: String): String {
    val pluralMap = mapOf(
        "message" to "messages",
        "queue" to "queues",
        "connection" to "connections",
        "vhost" to "vhosts"
    )

    return if (count == 1) singular else pluralMap[singular] ?: "${singular}s"
}