package io.joaoseidel.rmq.app.adapter.ports.output

import io.github.oshai.kotlinlogging.KotlinLogging
import io.joaoseidel.rmq.core.domain.Message
import io.joaoseidel.rmq.core.ports.output.MessageBackupRepository
import io.joaoseidel.rmq.core.ports.output.SettingsStore
import kotlinx.serialization.Serializable
import org.koin.core.annotation.Singleton
import java.time.Instant
import java.util.*

private val logger = KotlinLogging.logger {}

@Serializable
private data class MessageBackupEntity(
    val id: String,
    val type: String,
    val messages: List<Message>,
    val processedMessageIds: MutableSet<String> = mutableSetOf(),
    val createdAt: Long = Instant.now().toEpochMilli(),
)

@Singleton
class JsonMessageBackupRepository(
    private val settingsStore: SettingsStore = JsonSettingsStore(fileName = "message_backup_operations")
) : MessageBackupRepository {
    companion object {
        private const val COLLECTION_NAME = "message_backup_operations"
    }

    override fun storeMessages(
        operationId: UUID,
        operationType: String,
        messages: List<Message>,
    ): Boolean {
        if (messages.isEmpty()) {
            return true
        }

        return try {
            val entity =
                MessageBackupEntity(
                    id = operationId.toString(),
                    type = operationType,
                    messages = messages,
                )

            settingsStore.save(COLLECTION_NAME, entity, MessageBackupEntity::class)
            logger.debug { "Stored ${messages.size} messages for operation $operationId" }
            true
        } catch (e: Exception) {
            logger.error(e) { "Failed to store messages for operation ${operationId}" }
            false
        }
    }

    override fun markMessageAsProcessed(
        operationId: UUID,
        messageId: String,
    ): Boolean {
        return try {
            val entity = findOperationEntity(operationId) ?: return false

            entity.processedMessageIds.add(messageId)
            settingsStore.update(COLLECTION_NAME, entity)
        } catch (e: Exception) {
            logger.error(e) { "Failed to mark message $messageId as processed for operation ${operationId}" }
            false
        }
    }

    override fun getUnprocessedMessages(operationId: UUID): List<Message> {
        val entity = findOperationEntity(operationId) ?: return emptyList()

        return entity.messages.filter { message ->
            !entity.processedMessageIds.contains(message.id.value)
        }
    }

    override fun getProcessedMessages(operationId: UUID): List<Message> {
        val entity = findOperationEntity(operationId) ?: return emptyList()

        return entity.messages.filter { message ->
            entity.processedMessageIds.contains(message.id.value)
        }
    }

    override fun completeOperation(operationId: UUID): Boolean {
        val entity = findOperationEntity(operationId) ?: return false

        if (entity.messages.size == entity.processedMessageIds.size) {
            return settingsStore.delete(COLLECTION_NAME, MessageBackupEntity::class) {
                it.id == operationId.toString()
            }
        }

        return true
    }

    private fun findOperationEntity(operationId: UUID): MessageBackupEntity? =
        settingsStore.find(COLLECTION_NAME, MessageBackupEntity::class) {
            it.id == operationId.toString()
        }
}
