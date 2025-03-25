package io.joaoseidel.rmq.app

import com.github.ajalt.clikt.command.main
import io.joaoseidel.rmq.clikt.RmqCliCommand
import io.github.oshai.kotlinlogging.KotlinLogging
import org.koin.core.context.startKoin
import org.koin.ksp.generated.module
import kotlin.system.exitProcess

private val logger = KotlinLogging.logger {}

suspend fun main(args: Array<String>) {
    try {
        startKoin {
            modules(
                AppModule().module,
            )
        }

        val rootCommand = RmqCliCommand()
        rootCommand.main(args)
    } catch (e: Exception) {
        logger.error { "An error occurred: ${e.message}" }
    }

    exitProcess(1)
}