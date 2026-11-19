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

/** Eligibility remains available for styling and selection while every checked row is visible. */
internal sealed interface PickerOptions {
    data class Loading(val checked: Int = 0, val total: Int? = null, val eligible: Int = 0) : PickerOptions
    data class Ready(val eligible: List<BuilderOptionRow>, val ineligible: List<BuilderOptionRow>) : PickerOptions {
        val visible: List<BuilderOptionRow>
            get() {
                fun ordered(rows: List<BuilderOptionRow>): List<BuilderOptionRow> {
                    return if (rows.all { it.metadata.metadata.category == EntryCategory.FEAT } ||
                        rows.all { it.metadata.metadata.category == EntryCategory.POWER }) {
                        rows.sortedPickerRows()
                    } else {
                        rows.sortedWith(compareBy<BuilderOptionRow> { it.metadata.metadata.title.lowercase() }
                            .thenBy { it.metadata.metadata.id })
                    }
                }
                return ordered(eligible) + ordered(ineligible)
            }
    }
}

/** Keep partial results hidden and omit feats above the tier of the choice being filled. */
internal fun pickerOptions(rows: List<BuilderOptionRow>?, taken: Set<String>, featLevel: Int? = null): PickerOptions {
    if (rows == null) {
        return PickerOptions.Loading()
    }
    val offered = rows.filter { row ->
        val entry = row.option?.entry?.entry
        featLevel == null || !row.checked || entry == null || entry.category != EntryCategory.FEAT ||
            when (entry.featTierBadge()) {
                "E" -> featLevel >= 21
                "P" -> featLevel >= 11
                else -> true
            }
    }
    val (eligible, ineligible) = offered.partition { it.pickerSelectable(taken) }
    val pending = ineligible.count { !it.checked }
    return if (pending > 0) {
        PickerOptions.Loading(offered.size - pending, offered.size, eligible.count { it.option?.eligibility == Eligibility.ELIGIBLE })
    } else {
        PickerOptions.Ready(eligible.sortedPickerRows(), ineligible.sortedPickerRows())
    }
}

/** Sort catalog feats and powers within their eligibility groups using the displayed tier or level. */
private fun List<BuilderOptionRow>.sortedPickerRows(): List<BuilderOptionRow> {
    if (isEmpty()) {
        return this
    }
    val category = first().metadata.metadata.category
    if (category !in setOf(EntryCategory.FEAT, EntryCategory.POWER) || any { it.metadata.metadata.category != category }) {
        return this
    }
    return sortedWith(compareByDescending<BuilderOptionRow> { row ->
        val entry = row.option?.entry?.entry
        if (category == EntryCategory.FEAT) {
            when (entry?.featTierBadge()) { "E" -> 3; "P" -> 2; "H" -> 1; else -> 0 }
        } else {
            entry?.mechanics?.powerProfile?.level ?: 0
        }
    }.thenBy { it.metadata.metadata.title.lowercase() }.thenBy { it.metadata.metadata.id })
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
