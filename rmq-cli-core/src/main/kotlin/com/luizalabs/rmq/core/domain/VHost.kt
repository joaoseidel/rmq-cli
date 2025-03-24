package com.luizalabs.rmq.core.domain

import kotlinx.serialization.Serializable
import java.util.UUID

/**
 * Represents a Virtual Host (vhost) in RabbitMQ.
 *
 * @property name Name of the vhost
 * @property description Description of the vhost (optional)
 * @property isDefault Indicates if this is the default vhost for the connection
 */
@Serializable
data class VHost(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val description: String = "",
    val isDefault: Boolean = false
)