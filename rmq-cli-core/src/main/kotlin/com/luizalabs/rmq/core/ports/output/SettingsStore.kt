package com.luizalabs.rmq.core.ports.output

import kotlin.reflect.KClass

/**
 * This interface uses a CRUD-like approach for managing collections of objects
 * as well as simple key-value pairs.
 */
interface SettingsStore {

    /**
     * Saves an item in the specified collection.
     * If the item has an ID, it will be preserved. Otherwise, a new ID will be assigned.
     *
     * @param collection The collection name
     * @param item The item to save
     * @param type The class of the item (needed for deserialization)
     * @return The saved item (with ID assigned if it was missing)
     * @throws IllegalArgumentException If the item cannot be serialized
     */
    fun <T : Any> save(collection: String, item: T, type: KClass<T>): T

    /**
     * Retrieves all items from the specified collection.
     *
     * @param collection The collection name
     * @param type The class to deserialize to
     * @return List of items, or empty list if collection doesn't exist
     */
    fun <T : Any> list(collection: String, type: KClass<T>): List<T>

    /**
     * Finds the first item in a collection that matches the predicate.
     *
     * @param collection The collection name
     * @param type The class to deserialize to
     * @param predicate Function that returns true for the desired item
     * @return The matching item, or null if not found
     */
    fun <T : Any> find(collection: String, type: KClass<T>, predicate: (T) -> Boolean): T?

    /**
     * Finds an item by its ID in the specified collection.
     *
     * @param collection The collection name
     * @param id The ID of the item to find
     * @param type The class to deserialize to
     * @return The item, or null if not found
     */
    fun <T : Any> findById(collection: String, id: String, type: KClass<T>): T?

    /**
     * Updates an existing item in a collection.
     * The item must have an ID field.
     *
     * @param collection The collection name
     * @param item The updated item
     * @return true if the update was successful, false if item not found
     */
    fun update(collection: String, item: Any): Boolean

    /**
     * Updates a single field in an item.
     *
     * @param collection The collection name
     * @param id The ID of the item to update
     * @param field The field name to update
     * @param value The new value for the field
     * @return true if successful, false if item not found
     */
    fun updateField(collection: String, id: String, field: String, value: Any): Boolean

    /**
     * Deletes an item by ID.
     *
     * @param collection The collection name
     * @param id The ID of the item to delete
     * @return true if successful, false if item not found
     */
    fun delete(collection: String, id: String): Boolean

    /**
     * Deletes the first item that matches the predicate.
     *
     * @param collection The collection name
     * @param type The class to deserialize to
     * @param predicate Function that returns true for the item to delete
     * @return true if an item was deleted, false otherwise
     */
    fun <T : Any> delete(collection: String, type: KClass<T>, predicate: (T) -> Boolean): Boolean

    /**
     * Clears all items from a collection.
     *
     * @param collection The collection name
     * @return true if successful, false if collection not found
     */
    fun clear(collection: String): Boolean

    /**
     * Simple key-value operations
     */

    /**
     * Stores a simple value with the given key.
     *
     * @param key The key for storing the value
     * @param value The value to store
     * @return true if successful
     */
    fun setValue(key: String, value: Any): Boolean

    /**
     * Retrieves a value by key.
     *
     * @param key The key to look up
     * @param type The class to deserialize to
     * @param defaultValue Value to return if key not found
     * @return The stored value, or defaultValue if not found
     */
    fun <T : Any> getValue(key: String, type: KClass<T>, defaultValue: T? = null): T?

    /**
     * Removes a simple value.
     *
     * @param key The key to remove
     * @return true if successful, false if key not found
     */
    fun removeValue(key: String): Boolean

    /**
     * Checks if a key exists.
     *
     * @param key The key to check
     * @return true if the key exists
     */
    fun hasKey(key: String): Boolean

    /**
     * Lists all top-level keys (both collection names and simple values).
     *
     * @return List of key names
     */
    fun listKeys(): List<String>

    /**
     * Lists all collection names.
     *
     * @return List of collection names
     */
    fun listCollections(): List<String>

    /**
     * Global operations
     */

    /**
     * Clears all settings (both collections and simple values).
     *
     * @return true if successful
     */
    fun clearAll(): Boolean
}

/**
 * Saves an item in the specified collection with type inference.
 */
inline fun <reified T : Any> SettingsStore.save(collection: String, item: T): T {
    return save(collection, item, T::class)
}

/**
 * Lists all items in a collection with type inference.
 */
inline fun <reified T : Any> SettingsStore.list(collection: String): List<T> {
    return list(collection, T::class)
}

/**
 * Finds an item by predicate with type inference.
 */
inline fun <reified T : Any> SettingsStore.find(collection: String, noinline predicate: (T) -> Boolean): T? {
    return find(collection, T::class, predicate)
}

/**
 * Finds an item by ID with type inference.
 */
inline fun <reified T : Any> SettingsStore.findById(collection: String, id: String): T? {
    return findById(collection, id, T::class)
}

/**
 * Deletes an item by predicate with type inference.
 */
inline fun <reified T : Any> SettingsStore.delete(collection: String, noinline predicate: (T) -> Boolean): Boolean {
    return delete(collection, T::class, predicate)
}

/**
 * Gets a value with type inference.
 */
inline fun <reified T : Any> SettingsStore.getValue(key: String, defaultValue: T? = null): T? {
    return getValue(key, T::class, defaultValue)
}