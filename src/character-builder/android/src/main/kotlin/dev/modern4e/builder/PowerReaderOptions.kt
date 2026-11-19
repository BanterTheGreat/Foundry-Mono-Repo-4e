package dev.modern4e.builder

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
internal fun visibleReaderPowers(options: PickerOptions.Ready, showIneligible: Boolean, query: String): List<BuilderOptionRow> {
    val visible = options.eligible + if (showIneligible) options.ineligible else emptyList()
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
