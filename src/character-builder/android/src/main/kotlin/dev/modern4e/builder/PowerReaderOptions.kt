package dev.modern4e.builder

/** A reading target is separate from the draft choice; only eligible new choices enable Choose. */
internal data class PowerReaderPage(val row: BuilderOptionRow, val canChoose: Boolean)

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

/** Resolve browsing against the current visible results, so hidden or removed entries cannot be chosen. */
internal fun powerReaderPage(
    options: PickerOptions, inspected: String?, selected: String?, taken: Set<String>, showIneligible: Boolean,
    query: String = "",
): PowerReaderPage? {
    if (options !is PickerOptions.Ready) {
        return null
    }
    val visible = visibleReaderPowers(options, showIneligible, query)
    val row = visible.firstOrNull { it.metadata.metadata.id == inspected }
        ?: visible.firstOrNull { it.metadata.metadata.id == selected }
        ?: visible.firstOrNull()
        ?: return null
    return PowerReaderPage(row, row.pickerSelectable(taken) && row.metadata.metadata.id != selected)
}
