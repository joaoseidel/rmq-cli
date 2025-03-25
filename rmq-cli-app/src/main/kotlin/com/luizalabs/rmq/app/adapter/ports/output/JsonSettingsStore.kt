@file:OptIn(ExperimentalSerializationApi::class)
@file:Suppress("UNCHECKED_CAST")

package com.luizalabs.rmq.app.adapter.ports.output

import com.luizalabs.rmq.app.configuration.json
import com.luizalabs.rmq.core.ports.output.SettingsStore
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer
import org.koin.core.annotation.Singleton
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths
import java.util.UUID
import kotlin.reflect.KClass
import kotlin.reflect.full.createType

private val logger = KotlinLogging.logger {}

/**
 * JSON-based implementation of the [SettingsStore] interface.
 * This class stores settings in a structured JSON file
 */
@Singleton
class JsonSettingsStore : SettingsStore {
    private val configDir = "${System.getProperty("user.home")}/.rmq-cli"
    private val settingsFile = "$configDir/settings.json"

    // In-memory settings data
    private var rootObject: JsonObject = JsonObject(emptyMap())

    init {
        Files.createDirectories(Paths.get(configDir))
        loadSettings()
    }

    internal fun loadSettings() {
        val settingsPath = Paths.get(settingsFile)
        if (!Files.exists(settingsPath)) {
            return
        }

        try {
            val content = File(settingsFile).readText()
            if (content.isBlank()) {
                return
            }
            rootObject = json.parseToJsonElement(content).jsonObject
        } catch (e: Exception) {
            logger.error { "Failed to load settings: ${e.message}" }
        }
    }

    internal fun saveSettings() {
        try {
            val jsonString = json.encodeToString(rootObject)
            File(settingsFile).writeText(jsonString)
        } catch (e: Exception) {
            logger.error { "Failed to save settings: ${e.message}" }
            throw RuntimeException("Unable to save settings", e)
        }
    }

    internal fun getItemId(item: JsonObject): String? {
        return when {
            item.containsKey("id") -> item["id"]?.jsonPrimitive?.contentOrNull
            item.containsKey("ID") -> item["ID"]?.jsonPrimitive?.contentOrNull
            else -> null
        }
    }

    internal fun getCollection(key: String): JsonObject {
        val collectionJson = rootObject[key]

        return when (collectionJson) {
            null -> JsonObject(emptyMap())
            is JsonObject -> collectionJson
            is JsonArray -> {
                val itemsMap = mutableMapOf<String, JsonElement>()

                collectionJson.forEachIndexed { index, element ->
                    if (element is JsonObject) {
                        val id = getItemId(element) ?: index.toString()
                        itemsMap[id] = element
                    }
                }

                JsonObject(itemsMap)
            }

            else -> JsonObject(emptyMap())
        }
    }

    internal fun encodeToJson(value: Any): JsonElement {
        return when (value) {
            is JsonElement -> value
            is String -> JsonPrimitive(value)
            is Number -> JsonPrimitive(value)
            is Boolean -> JsonPrimitive(value)
            is Enum<*> -> JsonPrimitive(value.toString())
            is Map<*, *> -> {
                JsonObject(value.entries.associate {
                    it.key.toString() to encodeToJson(it.value ?: JsonNull)
                })
            }

            is Collection<*> -> {
                JsonArray(value.map { encodeToJson(it ?: JsonNull) })
            }

            is Array<*> -> {
                JsonArray(value.map { encodeToJson(it ?: JsonNull) })
            }

            else -> {
                try {
                    val serializer = json.serializersModule.getContextual(value::class)
                        ?: serializer(value::class.createType())

                    json.encodeToJsonElement(serializer as SerializationStrategy<Any>, value)
                } catch (e: Exception) {
                    logger.warn { "Falling back to toString() for type ${value::class}: ${e.message}" }
                    JsonPrimitive(value.toString())
                }
            }
        }
    }

    internal fun <T : Any> decodeFromJson(jsonElement: JsonElement, type: KClass<T>): T {
        return try {
            val serializer = json.serializersModule.getContextual(type)
                ?: serializer(type.createType())

            json.decodeFromJsonElement(serializer, jsonElement) as T
        } catch (e: Exception) {
            logger.error { "Failed to decode to ${type.simpleName}: ${e.message}" }
            throw e
        }
    }


    /**
     * Interface implementation
     */

    override fun <T : Any> save(collection: String, item: T, type: KClass<T>): T {
        try {
            var jsonItem = encodeToJson(item)
            if (jsonItem !is JsonObject) {
                jsonItem = JsonObject(mapOf("value" to jsonItem))
            }

            // Check if item has an ID field or assign one
            val id = getItemId(jsonItem) ?: UUID.randomUUID().toString()

            // Add or update the ID field
            jsonItem = JsonObject(jsonItem + ("id" to JsonPrimitive(id)))

            // Get the collection
            val collectionObj = getCollection(collection)

            // Add or update the item in the collection
            val updatedCollection = JsonObject(collectionObj + (id to jsonItem))

            // Update the root object
            rootObject = JsonObject(rootObject + (collection to updatedCollection))

            // Save to disk
            saveSettings()

            // Return the saved item (with ID)
            return decodeFromJson(jsonItem, type)
        } catch (e: Exception) {
            logger.error { "Failed to save item in '$collection': ${e.message}" }
            throw e
        }
    }

    override fun <T : Any> list(collection: String, type: KClass<T>): List<T> {
        try {
            val collectionObj = getCollection(collection)

            return collectionObj.values.mapNotNull { element ->
                try {
                    decodeFromJson(element, type)
                } catch (e: Exception) {
                    logger.error { "Failed to decode item in '$collection': ${e.message}" }
                    null
                }
            }
        } catch (e: Exception) {
            logger.error { "Failed to list items from '$collection': ${e.message}" }
            return emptyList()
        }
    }

    override fun <T : Any> find(collection: String, type: KClass<T>, predicate: (T) -> Boolean): T? {
        return list(collection, type).find(predicate)
    }

    override fun <T : Any> findById(collection: String, id: String, type: KClass<T>): T? {
        try {
            val collectionObj = getCollection(collection)
            val itemJson = collectionObj[id] ?: return null

            return decodeFromJson(itemJson, type)
        } catch (e: Exception) {
            logger.error { "Failed to find item by ID '$id' in '$collection': ${e.message}" }
            return null
        }
    }

    override fun update(collection: String, item: Any): Boolean {
        try {
            // Convert to JsonElement
            val jsonItem = encodeToJson(item)

            // Ensure it's an object
            if (jsonItem !is JsonObject) {
                throw IllegalArgumentException("Item must be a JSON object")
            }

            // Get the ID field
            val id = getItemId(jsonItem) ?: throw IllegalArgumentException("Item must have an ID")

            // Get the collection
            val collectionObj = getCollection(collection)

            // Check if the item exists
            if (!collectionObj.containsKey(id)) {
                return false
            }

            // Update the item
            val updatedCollection = JsonObject(collectionObj + (id to jsonItem))

            // Update the root object
            rootObject = JsonObject(rootObject + (collection to updatedCollection))

            // Save to disk
            saveSettings()

            return true
        } catch (e: Exception) {
            logger.error { "Failed to update item in '$collection': ${e.message}" }
            return false
        }
    }

    override fun updateField(collection: String, id: String, field: String, value: Any): Boolean {
        try {
            val collectionObj = getCollection(collection)

            // Check if the item exists
            val itemJson = collectionObj[id] as? JsonObject ?: return false

            // Update the field
            val valueJson = encodeToJson(value)
            val updatedItem = JsonObject(itemJson + (field to valueJson))

            // Update the collection
            val updatedCollection = JsonObject(collectionObj + (id to updatedItem))

            // Update the root object
            rootObject = JsonObject(rootObject + (collection to updatedCollection))

            // Save to disk
            saveSettings()

            return true
        } catch (e: Exception) {
            logger.error { "Failed to update field '$field' in item '$id' in '$collection': ${e.message}" }
            return false
        }
    }

    override fun delete(collection: String, id: String): Boolean {
        try {
            // Get the collection
            val collectionObj = getCollection(collection)

            // Check if the item exists
            if (!collectionObj.containsKey(id)) {
                return false
            }

            // Remove the item
            val updatedCollection = JsonObject(collectionObj.filterKeys { it != id })

            // Update the root object
            rootObject = JsonObject(rootObject + (collection to updatedCollection))

            // Save to disk
            saveSettings()

            return true
        } catch (e: Exception) {
            logger.error { "Failed to delete item '$id' from '$collection': ${e.message}" }
            return false
        }
    }

    override fun <T : Any> delete(collection: String, type: KClass<T>, predicate: (T) -> Boolean): Boolean {
        val item = find(collection, type, predicate) ?: return false

        // Get the ID of the item
        val itemJson = encodeToJson(item)
        if (itemJson !is JsonObject) return false

        val id = getItemId(itemJson) ?: return false

        return delete(collection, id)
    }

    override fun clear(collection: String): Boolean {
        try {
            // Check if the collection exists
            if (!rootObject.containsKey(collection)) {
                return false
            }

            // Remove the collection
            rootObject = JsonObject(rootObject.filterKeys { it != collection })

            // Save to disk
            saveSettings()

            return true
        } catch (e: Exception) {
            logger.error { "Failed to clear collection '$collection': ${e.message}" }
            return false
        }
    }

    override fun setValue(key: String, value: Any): Boolean {
        try {
            val valueJson = encodeToJson(value)
            rootObject = JsonObject(rootObject + (key to valueJson))
            saveSettings()
            return true
        } catch (e: Exception) {
            logger.error { "Failed to set value for '$key': ${e.message}" }
            return false
        }
    }

    override fun <T : Any> getValue(key: String, type: KClass<T>, defaultValue: T?): T? {
        try {
            val valueJson = rootObject[key] ?: return defaultValue

            return decodeFromJson(valueJson, type)
        } catch (e: Exception) {
            logger.error { "Failed to get value for '$key': ${e.message}" }
            return defaultValue
        }
    }

    override fun removeValue(key: String): Boolean {
        try {
            if (!rootObject.containsKey(key)) {
                return false
            }

            rootObject = JsonObject(rootObject.filterKeys { it != key })
            saveSettings()
            return true
        } catch (e: Exception) {
            logger.error { "Failed to remove value for '$key': ${e.message}" }
            return false
        }
    }

    override fun hasKey(key: String): Boolean {
        return rootObject.containsKey(key)
    }

    override fun listKeys(): List<String> {
        return rootObject.keys.toList()
    }

    override fun listCollections(): List<String> {
        return rootObject.keys.filter { key ->
            val value = rootObject[key]
            value is JsonObject || value is JsonArray
        }
    }

    override fun clearAll(): Boolean {
        try {
            rootObject = JsonObject(emptyMap())
            saveSettings()
            return true
        } catch (e: Exception) {
            logger.error { "Failed to clear all settings: ${e.message}" }
            return false
        }
    }
}