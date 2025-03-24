package com.luizalabs.rmq.clikt.commands.queue

import com.github.ajalt.clikt.core.terminal
import com.github.ajalt.clikt.parameters.arguments.argument
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.flag
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.int
import com.github.ajalt.mordant.terminal.muted
import com.github.ajalt.mordant.terminal.success
import com.github.ajalt.mordant.terminal.warning
import com.luizalabs.rmq.clikt.CliktCommandWrapper
import com.luizalabs.rmq.clikt.error
import com.luizalabs.rmq.clikt.formatName
import com.luizalabs.rmq.core.domain.CancellationCallback
import com.luizalabs.rmq.core.domain.Message
import com.luizalabs.rmq.core.domain.MessageCallback
import com.luizalabs.rmq.core.usecase.QueueOperations
import org.koin.java.KoinJavaComponent.inject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

class Consume : CliktCommandWrapper("consume") {
    private val queueOperations: QueueOperations by inject(QueueOperations::class.java)

    private val queueName by argument(name = "queue_name", help = "Name of the queue to consume messages from")
    private val ack by option("--ack", help = "Acknowledge messages after consuming").flag()
    private val count by option("--count", "-n", help = "Number of messages to consume (default: infinity)").int().default(Int.MAX_VALUE)
    private val noWait by option("--no-wait", help = "Exit automatically after consuming the specified number of messages").flag()

    override suspend fun run() {
        val terminal = terminal

        // RabbitMQ does not support prefetch count greater than 65535
        val count = if (count > 65535) 65535 else count

        withConnection { connection ->
            queueOperations.getQueue(queueName, connection) ?: run {
                terminal.error("Queue ${terminal.formatName(queueName)} not found.")
                return@withConnection
            }

            terminal.warning("Starting to consume messages from queue $queueName.")
            terminal.warning("Press Ctrl+C to stop.")
            echo()

            val countLatch = CountDownLatch(1)
            val messageCounter = AtomicInteger(0)

            val messageCallback = object : MessageCallback {
                override fun handle(consumerTag: String, message: Message) {
                    val messageCount = messageCounter.incrementAndGet()

                    terminal.success("Received message #$messageCount (${message.id}):")
                    terminal.muted(message.toTableString())

                    if (messageCount >= count) {
                        terminal.warning("Reached the specified message count ($count).")
                        countLatch.countDown()
                    }
                }
            }

            val cancellationCallback = object : CancellationCallback {
                override fun handle(consumerTag: String) {
                    terminal.warning("Consumer $consumerTag was cancelled")
                }
            }

            val consumerTag = queueOperations.consumeMessages(
                queueName = queueName,
                autoAck = ack,
                prefetchCount = count,
                messageCallback = messageCallback,
                cancellationCallback = cancellationCallback,
                connection = connection
            )

            try {
                countLatch.await()

                if (noWait) {
                    return@withConnection
                }

                terminal.warning("Received $count messages. Press Enter to stop consuming additional messages...")
                readLine()
            } catch (_: InterruptedException) {
                terminal.warning("Interrupted. Stopping consumer...")
            } finally {
                try {
                    queueOperations.cancelConsumer(consumerTag, connection)
                    terminal.success("Consumer stopped after processing ${messageCounter.get()} messages.")
                } catch (e: Exception) {
                    terminal.error("Error stopping consumer: ${e.message}")
                }
            }
        }
    }
}