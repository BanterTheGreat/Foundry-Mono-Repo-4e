package dev.modern4e.builder.ui.screens

import dev.modern4e.builder.BuilderState
import dev.modern4e.builder.CharacterDocument
import dev.modern4e.builder.ChoiceSlotId
import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.Eligibility
import dev.modern4e.builder.EntryCategory
import dev.modern4e.builder.LevelDecisions
import dev.modern4e.builder.ReplacementKind
import dev.modern4e.builder.SavedSelection

internal data class CurrentPower(val slot: ChoiceSlotId, val title: String, val entry: ContentEntry?, val note: String?)

internal enum class CurrentPowerUsage(val label: String) {
    AT_WILL("At-will"), ENCOUNTER("Encounter"), DAILY("Daily"), UNSPECIFIED("Unspecified")
}

/** Powers are grouped by frequency, including utility powers and entries without a known frequency. */
internal fun List<CurrentPower>.byUsage(): Map<CurrentPowerUsage, List<CurrentPower>> = groupBy { power ->
    val label = power.entry?.let(::powerChoiceUsage)
    CurrentPowerUsage.entries.firstOrNull { it.label == label } ?: CurrentPowerUsage.UNSPECIFIED
}

/** Saved powers from the Android editor's explicit later-level slots. */
internal fun laterPowerSelections(document: CharacterDocument): Set<SavedSelection> =
    document.levels.filter { it.level in 3..document.level }.flatMap { level ->
        level.androidPowers().map { it.selection } + level.androidPowerReplacements().map { it.replacement.selection }
    }.toSet()

/** Engine powers plus later-level selections saved through the Android editor's manual progression. */
internal fun currentPowers(state: BuilderState, resolved: Map<SavedSelection, ContentEntry>?): List<CurrentPower> {
    val rules = state.rules
    val blocked = rules.entryEligibility.filterValues {
        it.status == Eligibility.INELIGIBLE || it.status == Eligibility.UNRESOLVED
    }.keys.toMutableSet()
    // Grants from a blocked selection are not current powers either.
    val engineEntries = rules.entries
    while (blocked.addAll(engineEntries.filter { it.granted && it.slot.sourceInstanceId in blocked }.map { it.instanceId })) {
        // Continue through nested grants.
    }
    val enginePowers = engineEntries.filter { it.definition.entry.category == EntryCategory.POWER }
    val powers = enginePowers.filterNot { it.instanceId in blocked }.associateTo(linkedMapOf()) { power ->
        val entry = power.definition.entry
        val note = when {
            power.granted -> "Granted"
            rules.entryEligibility[power.instanceId]?.status == Eligibility.INCOMPLETE -> "Eligibility incomplete"
            else -> null
        }
        power.slot to CurrentPower(power.slot, entry.presentation.title, entry, note)
    }
    if (resolved != null) {
        val engineBySlot = enginePowers.associateBy { it.slot }
        val laterLevels = state.document.levels.filter { it.level in 3..state.document.level }.sortedBy { it.level }
        val appliedReplacementLevels = mutableMapOf<ChoiceSlotId, Int>()
        for (level in laterLevels) {
            for (replacement in level.replacements) {
                val slot = replacement.replaces
                if (replacement.replacement.slot == slot &&
                    replacement.replacement.selection.entryId == engineBySlot[slot]?.definition?.entry?.id) {
                    appliedReplacementLevels[slot] = level.level
                }
            }
        }
        fun read(slot: ChoiceSlotId, selection: SavedSelection): CurrentPower? {
            val entry = resolved[selection]
            if (entry != null && entry.category != EntryCategory.POWER) {
                return null
            }
            val note = if (entry != null) "Saved · eligibility not evaluated" else "Saved · definition unavailable"
            return CurrentPower(slot, entry?.presentation?.title ?: selection.savedTitle, entry, note)
        }
        for (level in laterLevels) {
            for (choice in level.androidPowers()) {
                if (choice.slot !in engineBySlot) {
                    read(choice.slot, choice.selection)?.let { powers[choice.slot] = it }
                }
            }
            for (replacement in level.androidPowerReplacements()) {
                if (replacement.replaces in powers && level.level > (appliedReplacementLevels[replacement.replaces] ?: 0)) {
                    read(replacement.replaces, replacement.replacement.selection)?.let { powers[replacement.replaces] = it }
                }
            }
        }
    }
    return powers.values.sortedBy { it.title.lowercase() }
}

private fun LevelDecisions.androidPowers() =
    entries.filter { it.slot.sourceInstanceId == "advancement.$level" && it.slot.choiceId == "power" }

private fun LevelDecisions.androidPowerReplacements() = replacements.filter {
    it.kind == ReplacementKind.PROGRESSION && it.replacement.slot == ChoiceSlotId("advancement.$level", "replacement", 0)
}
