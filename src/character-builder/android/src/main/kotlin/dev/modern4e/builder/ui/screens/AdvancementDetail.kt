package dev.modern4e.builder.ui.screens

import dev.modern4e.builder.ChoiceDefinition
import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.EntryCategory
import dev.modern4e.builder.FactKind
import dev.modern4e.builder.Grant
import dev.modern4e.builder.Statistic
import dev.modern4e.builder.advancementModificationIds
import dev.modern4e.builder.readable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal data class AdvancementDetail(
    val introduction: String,
    val levels: List<AdvancementLevel>,
    val modifications: List<ContentEntry>,
    val conclusion: String,
    val attributes: List<Pair<String, String>> = emptyList(),
)

internal data class AdvancementLevel(
    val level: Int,
    val features: List<ContentEntry>,
    val powers: List<ContentEntry>,
    val powerChoices: List<AdvancementPowerChoice> = emptyList(),
)

internal data class AdvancementPowerChoice(val count: Int, val powers: List<ContentEntry>)

/** Builds a preview from authored grant levels and already-resolved catalog definitions. */
internal fun advancementDetail(entry: ContentEntry, definitions: Map<String, ContentEntry>): AdvancementDetail {
    val ancestry = entry.category == EntryCategory.ANCESTRY
    val entriesByLevel = sortedMapOf<Int, MutableList<ContentEntry>>()
    val choicesByLevel = sortedMapOf<Int, MutableList<AdvancementPowerChoice>>()
    fun displayLevel(level: Int) = if (ancestry && level == 1) 0 else level
    fun visit(source: ContentEntry, acquired: Int, path: Set<String>) {
        val mechanics = source.mechanics
        fun collect(grants: List<Grant>, choices: List<ChoiceDefinition>, level: Int) {
            grants.filterIsInstance<Grant.Entry>().forEach { grant ->
                val target = definitions[grant.entryId] ?: return@forEach
                if (target.id !in path) {
                    val targetLevel = maxOf(level, grant.atLevel)
                    entriesByLevel.getOrPut(displayLevel(targetLevel)) { mutableListOf() }.add(target)
                    visit(target, targetLevel, path + target.id)
                }
            }
            if (ancestry || entry.category == EntryCategory.FEATURE) {
                choices.filterIsInstance<ChoiceDefinition.Entries>().forEach { choice ->
                    val powers = choice.entryIds.mapNotNull(definitions::get).filter { it.category == EntryCategory.POWER }
                    if (powers.isNotEmpty()) {
                        val choiceLevel = displayLevel(maxOf(level, choice.atLevel))
                        choicesByLevel.getOrPut(choiceLevel) { mutableListOf() }.add(AdvancementPowerChoice(choice.count, powers))
                    }
                }
            }
        }
        collect(mechanics.grants, mechanics.choices, acquired)
        mechanics.progression.forEach { progression ->
            collect(progression.grants, progression.choices, maxOf(acquired, progression.level))
        }
    }
    visit(entry, 1, setOf(entry.id))
    val levels = (entriesByLevel.keys + choicesByLevel.keys).toSortedSet().mapNotNull { level ->
        val available = entriesByLevel[level].orEmpty().distinctBy { it.id }
        val features = available.filter { it.category == EntryCategory.FEATURE }
        val powers = available.filter { it.category == EntryCategory.POWER }
        val choices = choicesByLevel[level].orEmpty().distinct()
        if (features.isEmpty() && powers.isEmpty() && choices.isEmpty()) {
            null
        } else {
            AdvancementLevel(level, features, powers, choices)
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
        introduction = intro.joinToString("\n\n") { it.second }.ifBlank {
            if (entry.category == EntryCategory.FEATURE) featureProse(entry) else entry.presentation.description
        },
        levels = levels,
        modifications = modifications,
        conclusion = conclusion.joinToString("\n\n") { it.second },
        attributes = if (ancestry) ancestryAttributes(entry) else emptyList(),
    )
}

/** Preserve every authored feature heading and paragraph in reading order. */
internal fun featureProse(entry: ContentEntry): String {
    fun JsonObject.text(key: String): String? =
        (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }

    val sections = entry.sharedData?.get("sections") as? JsonArray
    return sections.orEmpty().mapNotNull { section ->
        val fields = section as? JsonObject ?: return@mapNotNull null
        when (fields.text("type")) {
            "heading" -> fields.text("title")?.let { "*$it*" }
            "text" -> fields.text("text")
            else -> null
        }
    }.joinToString("\n\n").ifBlank { entry.presentation.description }
}


/** Summarize the ancestry rules available on the entry without relying on its prose. */
private fun ancestryAttributes(entry: ContentEntry): List<Pair<String, String>> = buildList {
    val mechanics = entry.mechanics
    mechanics.size?.let { add("Size" to it.name.readable()) }
    mechanics.modifiers.firstOrNull { it.target.statistic == Statistic.SPEED }?.let {
        add("Speed" to "${it.value} squares")
    }
    entry.visionName()?.let { add("Vision" to it) }
    val languages = mechanics.facts.filter { it.kind == FactKind.LANGUAGE }.flatMap { it.values }.map { it.readable() }
    val languageCount = mechanics.choices.filterIsInstance<ChoiceDefinition.Values>()
        .filter { it.kind == FactKind.LANGUAGE }.sumOf { it.count }
    val languageChoices = if (languageCount > 0) listOf("choose $languageCount") else emptyList()
    val displayedLanguages = languages + languageChoices
    if (displayedLanguages.isNotEmpty()) {
        add("Languages" to displayedLanguages.joinToString(", "))
    }
}

/** Vision is currently authored in entry attributes. */
internal fun ContentEntry.visionName(): String? {
    val attributes = sharedData?.get("attributes") as? JsonObject
    val vision = attributes?.get("vision") as? JsonPrimitive
    return vision?.takeIf { it.isString && it.content.isNotBlank() }?.content
        ?.split('-', '_')?.joinToString("-") { it.readable() }
}
