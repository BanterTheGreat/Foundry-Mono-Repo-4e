package dev.modern4e.builder.ui.screens

import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.EntryCategory
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Uses the same introductory paragraphs as the Modern 4e Zeitgeist theme pages. */
internal fun zeitgeistThemeDescription(entry: ContentEntry): String? {
    if (entry.category != EntryCategory.THEME || !entry.id.startsWith("modern4e.theme.")) {
        return null
    }
    val sections = entry.sharedData?.get("sections") as? JsonObject ?: return null
    return listOf("text-1", "text-2").mapNotNull { key ->
        (sections[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
    }.joinToString("\n\n").ifBlank { null }
}
