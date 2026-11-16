@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package dev.modern4e.builder

import kotlinx.serialization.descriptors.*
import kotlinx.serialization.json.*

/** Wire-format checks only. Eligibility and content availability belong to the engine. */
internal object CharacterValidation {
    /** A JSON tree would overwrite duplicate members; reject them before accepting any decisions. */
    fun duplicateFields(text: String): List<Diagnostic> {
        val objects = mutableListOf<MutableSet<String>?>()
        val errors = mutableListOf<Diagnostic>()
        val tokens = Regex("\"(?:\\\\.|[^\"\\\\])*\"|[{}\\[\\]]")
        for (token in tokens.findAll(text)) {
            when (token.value) {
                "{" -> objects.add(mutableSetOf())
                "[" -> objects.add(null)
                "}", "]" -> objects.removeAt(objects.lastIndex)
                else -> {
                    var next = token.range.last + 1
                    while (next < text.length && text[next].isWhitespace()) {
                        next++
                    }
                    if (next < text.length && text[next] == ':') {
                        val name = ContractCodec.json.decodeFromString<String>(token.value)
                        if (objects.last()?.add(name) == false) {
                            errors.add(Diagnostic("character.duplicateField", DiagnosticKind.INCOMPATIBLE_FORMAT,
                                "Duplicate field '$name'; keep exactly one value. No fields were imported."))
                        }
                    }
                }
            }
        }
        return errors
    }

    fun validate(tree: JsonElement): List<Diagnostic> {
        val errors = mutableListOf<Diagnostic>()
        fun error(code: String, path: String, message: String) {
            errors.add(Diagnostic("character.$code", DiagnosticKind.INCOMPATIBLE_FORMAT, "$path: $message"))
        }
        val root = tree as? JsonObject
        if (root == null) {
            error("type", "$", "Expected a character object.")
            return errors
        }
        val version = root["formatVersion"] as? JsonPrimitive
        if (version == null || version.isString || version.intOrNull == null) {
            error("format", "$.formatVersion", "Required integer format version; this app supports 1.")
            return errors
        }
        if (version.intOrNull != 1) {
            error("format", "$.formatVersion", "Unsupported version ${version.content}; this app supports 1. Use a compatible app.")
            return errors
        }

        fun check(value: JsonElement, descriptor: SerialDescriptor, path: String) {
            if (value == JsonNull && descriptor.isNullable) {
                return
            }
            val primitive = value as? JsonPrimitive
            when (descriptor.kind) {
                StructureKind.CLASS -> {
                    if (value !is JsonObject) {
                        error("type", path, "Expected an object.")
                        return
                    }
                    val names = (0 until descriptor.elementsCount).map { descriptor.getElementName(it) }
                    for (key in value.keys - names.toSet()) {
                        error("unknownField", "$path.$key", "Unknown field; remove it or use a compatible app. No fields were imported.")
                    }
                    for ((index, name) in names.withIndex()) {
                        val child = value[name]
                        if (child == null) {
                            if (!descriptor.isElementOptional(index)) {
                                error("required", "$path.$name", "Required field is missing.")
                            }
                        } else {
                            check(child, descriptor.getElementDescriptor(index), "$path.$name")
                            if (descriptor.getElementAnnotations(index).any { it is OpaqueIdentifier } && child is JsonPrimitive && child.isString && child.content.isBlank()) {
                                error("identifier", "$path.$name", "Must be a nonblank opaque identifier or revision.")
                            }
                        }
                    }
                }
                StructureKind.LIST -> {
                    if (value !is JsonArray) {
                        error("type", path, "Expected an array.")
                    } else {
                        value.forEachIndexed { index, child -> check(child, descriptor.getElementDescriptor(0), "$path[$index]") }
                    }
                }
                StructureKind.MAP -> {
                    if (value !is JsonObject) {
                        error("type", path, "Expected a map object.")
                    } else {
                        for ((key, child) in value) {
                            check(JsonPrimitive(key), descriptor.getElementDescriptor(0), "$path.$key (key)")
                            check(child, descriptor.getElementDescriptor(1), "$path.$key")
                        }
                    }
                }
                SerialKind.ENUM -> {
                    val names = (0 until descriptor.elementsCount).map { descriptor.getElementName(it) }
                    if (primitive == null || !primitive.isString || primitive.content !in names) {
                        error("type", path, "Expected one of: ${names.joinToString()}.")
                    }
                }
                PrimitiveKind.STRING -> {
                    if (primitive == null || !primitive.isString) {
                        error("type", path, "Expected a string.")
                    }
                }
                PrimitiveKind.INT -> {
                    if (primitive == null || primitive.isString || primitive.intOrNull == null) {
                        error("type", path, "Expected a 32-bit integer.")
                    }
                }
                PrimitiveKind.BOOLEAN -> {
                    if (primitive == null || primitive.isString || primitive.booleanOrNull == null) {
                        error("type", path, "Expected a boolean.")
                    }
                }
                else -> error("type", path, "Unsupported character field type.")
            }
        }
        check(tree, CharacterDocument.serializer().descriptor, "$")
        val savedAt = root["savedAt"] as? JsonPrimitive
        if (savedAt?.isString == true && !validTimestamp(savedAt.content)) {
            error("timestamp", "$.savedAt", "Expected an RFC 3339 timestamp with a timezone, e.g. 2026-11-16T20:00:00Z.")
        }
        return errors
    }

    /** Calendar-valid RFC 3339 subset: four-digit years, seconds 00–59, and explicit offset. */
    private fun validTimestamp(value: String): Boolean {
        val match = Regex("^(\\d{4})-(\\d{2})-(\\d{2})[Tt](\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(?:[Zz]|[+-](\\d{2}):(\\d{2}))$").matchEntire(value) ?: return false
        val parts = match.groupValues
        val year = parts[1].toInt()
        val month = parts[2].toInt()
        val day = parts[3].toInt()
        val leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
        val days = listOf(31, if (leap) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        return month in 1..12 && day in 1..days[month - 1] && parts[4].toInt() in 0..23 &&
            parts[5].toInt() in 0..59 && parts[6].toInt() in 0..59 &&
            (parts[7].isEmpty() || (parts[7].toInt() in 0..23 && parts[8].toInt() in 0..59))
    }
}
