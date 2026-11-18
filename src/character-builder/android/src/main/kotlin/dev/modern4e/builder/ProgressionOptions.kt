package dev.modern4e.builder

/** Only checked options with usable eligibility and no duplicate selection can be picked. */
internal fun BuilderOptionRow.pickerSelectable(taken: Set<String>): Boolean = checked &&
    metadata.metadata.id !in taken && option?.eligibility?.let {
        it != Eligibility.INELIGIBLE && it != Eligibility.UNRESOLVED
    } == true

/** Either progress for an unfinished check or the final list, with blocked options grouped last. */
internal sealed interface PickerOptions {
    data class Loading(val checked: Int = 0, val total: Int? = null, val eligible: Int = 0) : PickerOptions
    data class Ready(val eligible: List<BuilderOptionRow>, val ineligible: List<BuilderOptionRow>) : PickerOptions
}

/** Keep partial results out of the picker until all options in the current category are checked. */
internal fun pickerOptions(rows: List<BuilderOptionRow>?, taken: Set<String>): PickerOptions {
    if (rows == null) {
        return PickerOptions.Loading()
    }
    val (eligible, ineligible) = rows.partition { it.pickerSelectable(taken) }
    val pending = ineligible.count { !it.checked }
    return if (pending > 0) {
        PickerOptions.Loading(rows.size - pending, rows.size, eligible.count { it.option?.eligibility == Eligibility.ELIGIBLE })
    } else {
        PickerOptions.Ready(eligible, ineligible)
    }
}
