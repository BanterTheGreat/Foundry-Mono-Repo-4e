package dev.modern4e.builder

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Combine named class or ancestry access with the feat's canonical prerequisite text. */
internal fun ContentEntry.featPrerequisiteText(accessTitles: Map<String, String>): String? {
    val requirement = (sharedData?.get("runtimeRequirementText") as? JsonPrimitive)?.contentOrNull
        ?.takeIf { it.isNotBlank() }
    val access = mechanics.access?.featAccessText(accessTitles, nested = requirement != null)
    return listOfNotNull(access, requirement).joinToString(", ").ifBlank { null }
}

/** Preserve grouped access alternatives when displaying them alongside other prerequisites. */
private fun Prerequisite.featAccessText(titles: Map<String, String>, nested: Boolean): String? {
    val group = when (this) {
        is Prerequisite.Entry -> return titles[entryId] ?: entryId
        is Prerequisite.Unavailable -> return text
        is Prerequisite.Unresolved -> return text
        is Prerequisite.AllOf -> conditions.mapNotNull { it.featAccessText(titles, true) }.joinToString(" and ")
        is Prerequisite.AnyOf -> conditions.mapNotNull { it.featAccessText(titles, true) }.joinToString(" or ")
        else -> return null
    }
    if (group.isBlank()) {
        return null
    }
    return if (nested) "($group)" else group
}

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

/** Display the earliest tier allowed by a feat's level requirements. */
internal fun ContentEntry.featTierBadge(): String {
    val minimumLevel = maxOf(
        mechanics.access?.minimumFeatLevel() ?: 0,
        mechanics.prerequisites.maxOfOrNull { it.minimumFeatLevel() } ?: 0,
    )
    return when {
        minimumLevel >= 21 -> "E"
        minimumLevel >= 11 -> "P"
        else -> "H"
    }
}

/** All requirements must hold in a conjunction, and any branch can satisfy a disjunction. */
private fun Prerequisite.minimumFeatLevel(): Int = when (this) {
    is Prerequisite.Level -> minimum
    is Prerequisite.AllOf -> conditions.maxOfOrNull { it.minimumFeatLevel() } ?: 0
    is Prerequisite.AnyOf -> conditions.minOfOrNull { it.minimumFeatLevel() } ?: 0
    else -> 0
}
