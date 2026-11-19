package dev.modern4e.builder.ui.screens

import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.EntryCategory
import dev.modern4e.builder.Grant
import dev.modern4e.builder.advancementModificationIds
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal data class AdvancementDetail(
    val introduction: String,
    val levels: List<AdvancementLevel>,
    val modifications: List<ContentEntry>,
    val conclusion: String,
)

internal data class AdvancementLevel(
    val level: Int,
    val features: List<ContentEntry>,
    val powers: List<ContentEntry>,
)

/** Builds a preview from authored grant levels and already-resolved catalog definitions. */
internal fun advancementDetail(entry: ContentEntry, definitions: Map<String, ContentEntry>): AdvancementDetail {
    val levels = entry.mechanics.grants.filterIsInstance<Grant.Entry>()
        .groupBy { it.atLevel }.toSortedMap().mapNotNull { (level, grants) ->
            val entries = grants.mapNotNull { definitions[it.entryId] }.distinctBy { it.id }
            val features = entries.filter { it.category == EntryCategory.FEATURE }
            val powers = entries.filter { it.category == EntryCategory.POWER }
            if (features.isEmpty() && powers.isEmpty()) {
                null
            } else {
                AdvancementLevel(level, features, powers)
            }
        }
    val modifications = entry.advancementModificationIds().mapNotNull { definitions[it] }
        .filter { it.category == EntryCategory.FEATURE }
    val sections = (entry.sharedData?.get("sections") as? JsonObject).orEmpty().mapNotNull { (key, value) ->
        val index = key.takeIf { it.startsWith("text-") }?.removePrefix("text-")?.toIntOrNull()
        val text = (value as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim().orEmpty()
        if (index != null && text.isNotEmpty()) {
            index to text
        } else {
            null
        }
    }.sortedBy { it.first }
    val (intro, conclusion) = sections.partition { (index, _) -> index in 1..2 }
    return AdvancementDetail(
        introduction = intro.joinToString("\n\n") { it.second }.ifBlank { entry.presentation.description },
        levels = levels,
        modifications = modifications,
        conclusion = conclusion.joinToString("\n\n") { it.second },
    )
}
