package dev.modern4e.builder

/** Pending and unavailable rows never become selectable merely because their titles are visible. */
internal fun BuilderOptionRow.pickerSelectable(taken: Set<String>): Boolean = checked &&
    metadata.metadata.id !in taken && option?.eligibility?.let {
        it != Eligibility.INELIGIBLE && it != Eligibility.UNRESOLVED
    } == true

/** Pending rows stay visible while checked ineligible rows follow the existing toggle. */
internal fun BuilderOptionRow.pickerVisible(taken: Set<String>, showIneligible: Boolean): Boolean =
    !checked || pickerSelectable(taken) || showIneligible
