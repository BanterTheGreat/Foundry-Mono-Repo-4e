@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package dev.modern4e.builder

import kotlinx.serialization.SerialInfo

/** Nonblank opaque wire value; independent of the property's name or installed content. */
@SerialInfo
@Target(AnnotationTarget.PROPERTY)
annotation class OpaqueIdentifier
