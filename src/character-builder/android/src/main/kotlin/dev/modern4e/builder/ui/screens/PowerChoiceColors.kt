package dev.modern4e.builder.ui.screens

import androidx.compose.ui.graphics.Color
import dev.modern4e.builder.ChoiceDefinition
import dev.modern4e.builder.ChoiceSlotId
import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.EngineEntry
import dev.modern4e.builder.Progression

private val PowerUsageLabel = Regex("""\b(at[-_ ]?will|encounter|daily)\b""", RegexOption.IGNORE_CASE)
private val UtilityLabel = Regex("""\butility\b""", RegexOption.IGNORE_CASE)
private val PowerUsageClass = Regex("""\bclass\s*=\s*['"]?(atwill|encounter|daily)power\b""", RegexOption.IGNORE_CASE)

/** Uses the authored power profile, with a fallback for legacy Compendium cards. */
internal fun powerChoiceUsage(entry: ContentEntry): String? =
    entry.mechanics.powerProfile?.usage?.let(::normalizedPowerUsage)
        ?: PowerUsageClass.find(entry.presentation.description)?.groupValues?.get(1)?.let(::normalizedPowerUsage)

/** Modern 4e power hues darkened for legibility against the folio's paper. */
internal fun powerChoiceColor(label: String): Color? = when (normalizedPowerUsage(label)) {
    "At-will" -> Color(0xFF386327)
    "Encounter" -> Color(0xFF923D32)
    "Daily" -> Color(0xFF354BA4)
    else -> if (UtilityLabel.containsMatchIn(label)) Color(0xFF655283) else null
}

/** Only utility pickers need per-entry usage colors, since their options can differ in usage. */
internal fun isUtilityPowerPicker(level: Int, slot: ChoiceSlotId, sources: List<EngineEntry>): Boolean {
    val mechanics = sources.firstOrNull { it.instanceId == slot.sourceInstanceId }?.definition?.entry?.mechanics
    if (mechanics != null) {
        val choices = mechanics.choices + mechanics.progression.flatMap { it.choices }
        return choices.filterIsInstance<ChoiceDefinition.Entries>().any { it.id == slot.choiceId && it.query?.powerKind == "UTILITY" }
    }
    return slot.sourceInstanceId == "advancement.$level" && slot.choiceId == "power" &&
        Progression.level(level).powers.getOrNull(slot.ordinal)?.let(UtilityLabel::containsMatchIn) == true
}

private fun normalizedPowerUsage(label: String): String? =
    when (PowerUsageLabel.find(label)?.value?.lowercase()) {
        "atwill", "at-will", "at_will", "at will" -> "At-will"
        "encounter" -> "Encounter"
        "daily" -> "Daily"
        else -> null
    }
