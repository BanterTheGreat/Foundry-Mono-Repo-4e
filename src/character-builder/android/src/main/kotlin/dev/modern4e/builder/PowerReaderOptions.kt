package dev.modern4e.builder

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
internal fun powerReaderPage(visible: List<BuilderOptionRow>, inspected: String?, selected: String?): BuilderOptionRow? =
    visible.firstOrNull { it.metadata.metadata.id == inspected }
        ?: visible.firstOrNull { it.metadata.metadata.id == selected }
        ?: visible.firstOrNull()

/** An explicit row tap can draft an eligible power after any required replacement target is set. */
internal fun BuilderOptionRow.powerDraftOnTap(
    taken: Set<String>, selected: String?, replacementReady: Boolean,
): BuilderOption? = option.takeIf { replacementReady && metadata.metadata.id != selected && pickerSelectable(taken) }
