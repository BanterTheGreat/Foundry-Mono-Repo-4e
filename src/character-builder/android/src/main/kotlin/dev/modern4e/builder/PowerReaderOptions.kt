package dev.modern4e.builder

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/** Prefer the authored power level over prerequisite prose, including grouped utility requirements. */
internal fun ContentEntry.pickerPowerLevel(): Int? {
    mechanics.powerProfile?.level?.let { return it }
    (sharedData?.get("level") as? JsonPrimitive)?.intOrNull?.let { return it }
    fun minimum(condition: Prerequisite): Int = when (condition) {
        is Prerequisite.Level -> condition.minimum
        is Prerequisite.AllOf -> condition.conditions.maxOfOrNull(::minimum) ?: 0
        is Prerequisite.AnyOf -> condition.conditions.minOfOrNull(::minimum) ?: 0
        else -> 0
    }
    mechanics.prerequisites.maxOfOrNull(::minimum)?.takeIf { it > 0 }?.let { return it }
    return Regex("(?:Attack|Utility) (\\d+)").find(presentation.description)?.groupValues?.get(1)?.toIntOrNull()
}

/** Class choices that include features use the full rules reader, including mixed feature/power pools. */
internal fun usesClassFeatureReader(
    rows: List<BuilderOptionRow>?, slot: ChoiceSlotId?, entries: List<EngineEntry>,
): Boolean {
    if (rows.orEmpty().none { it.metadata.metadata.category == EntryCategory.FEATURE } ||
        rows.orEmpty().any { it.metadata.metadata.category !in setOf(EntryCategory.FEATURE, EntryCategory.POWER) }
    ) {
        return false
    }
    val byInstance = entries.associateBy { it.instanceId }
    val seen = mutableSetOf<String>()
    var owner = slot?.sourceInstanceId?.let(byInstance::get)
    while (owner != null && seen.add(owner.instanceId)) {
        if (owner.definition.entry.category == EntryCategory.CLASS) {
            return true
        }
        owner = byInstance[owner.slot.sourceInstanceId]
    }
    return false
}

/** Mixed catalog choices retain their normal expandable list. */
internal fun usesPowerReader(rows: List<BuilderOptionRow>?): Boolean =
    !rows.isNullOrEmpty() && rows.all { it.metadata.metadata.category == EntryCategory.POWER }

/** Search the current slot's visible names and authored rules without widening its power pool. */
internal fun visibleReaderPowers(options: PickerOptions.Ready, query: String): List<BuilderOptionRow> {
    val visible = options.visible
    val search = query.trim()
    return visible.filter {
        search.isEmpty() || it.metadata.metadata.title.contains(search, ignoreCase = true) ||
            it.option?.entry?.entry?.presentation?.description?.contains(search, ignoreCase = true) == true
    }
}

/** Resolve the preview against the current visible results. */
internal fun catalogReaderPage(visible: List<BuilderOptionRow>, inspected: String?, selected: String?): BuilderOptionRow? =
    visible.firstOrNull { it.metadata.metadata.id == inspected }
        ?: visible.firstOrNull { it.metadata.metadata.id == selected }
        ?: visible.firstOrNull()

/** An explicit row tap can draft a visible power after any required replacement target is set. */
internal fun BuilderOptionRow.powerDraftOnTap(
    taken: Set<String>, selected: String?, replacementReady: Boolean, allowIneligible: Boolean = false,
): BuilderOption? = catalogReaderDraft(taken, selected, allowIneligible).takeIf { replacementReady }

/** Return a different, checked option when the reader's selection action is invoked. */
internal fun BuilderOptionRow.catalogReaderDraft(
    taken: Set<String>, selected: String?, allowIneligible: Boolean = false,
): BuilderOption? = option.takeIf {
    checked && metadata.metadata.id != selected && (allowIneligible || pickerSelectable(taken))
}
