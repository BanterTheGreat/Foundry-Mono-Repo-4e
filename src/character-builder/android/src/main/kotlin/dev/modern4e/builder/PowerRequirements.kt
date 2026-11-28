package dev.modern4e.builder

/** Authored requirements and the failures reported for this exact acquisition-time candidate. */
internal data class PowerRequirementPreview(val requirements: String?, val unmet: List<String>)

/** Keep the power preview API while sharing requirement explanations with advancement entries. */
internal fun powerRequirementPreview(row: BuilderOptionRow, titles: Map<String, String>,
    classIds: Set<String> = emptySet()): PowerRequirementPreview = entryRequirementPreview(row, titles, classIds)

/**
 * Explain checked historical requirements from the engine's typed unmet conditions, never from diagnostic wording.
 * Power class and level are already represented by their picker.
 */
internal fun entryRequirementPreview(row: BuilderOptionRow, titles: Map<String, String>,
    classIds: Set<String> = emptySet()): PowerRequirementPreview {
    val option = row.option ?: return PowerRequirementPreview(null, emptyList())
    val entry = option.entry.entry
    val conditions = listOfNotNull(entry.mechanics.access) + entry.mechanics.prerequisites
    val omit: (Prerequisite) -> Boolean = { condition -> entry.category == EntryCategory.POWER &&
        (condition is Prerequisite.Level || condition is Prerequisite.Entry && condition.entryId in classIds) }
    val authored = conditions.mapNotNull { it.requirementText(titles, omit) }
    val unmet = option.unmet.mapNotNull { condition ->
        when (condition) {
            is UnmetCondition.Failed -> condition.leaf.takeUnless(omit)?.requirementText(titles, omit)
            is UnmetCondition.Unavailable -> "Unavailable: ${condition.leaf.text}"
            is UnmetCondition.Unresolved -> "Not confirmed: ${condition.leaf.text}"
            is UnmetCondition.Unadapted -> "Not confirmed: ${condition.leaf.sourceText}"
            is UnmetCondition.Unchecked -> "Some requirements could not be checked."
        }
    }.distinct()
    return PowerRequirementPreview(authored.distinct().joinToString("; ").ifBlank { null }, unmet)
}

/** Keep alternative access routes grouped instead of making every branch look mandatory. */
private fun Prerequisite.requirementText(titles: Map<String, String>, omit: (Prerequisite) -> Boolean): String? {
    if (omit(this)) {
        return null
    }
    return when (this) {
        Prerequisite.Always -> null
        is Prerequisite.Level -> "Level $minimum+"
        is Prerequisite.Proficiency -> "Trained in ${(skill.current ?: skill).title}"
        is Prerequisite.ClassPowerSource -> "${powerSource.readable()} power source"
        is Prerequisite.EquipmentProficiency -> "Proficient with ${equipment.replace('-', '_').readable()}"
        is Prerequisite.AbilityPoints -> "${ability.name.readable()} $minimum+"
        is Prerequisite.Entry -> titles[entryId] ?: entryId.substringAfterLast('.').replace('-', '_').readable()
        is Prerequisite.Size -> "${size.name.readable()} size"
        is Prerequisite.Selected -> when (category) {
            EntryCategory.FEAT -> "A class-specific multiclass feat"
            EntryCategory.POWER -> "A selected encounter power with a level"
            else -> null
        }
        is Prerequisite.Unavailable -> text
        is Prerequisite.Unresolved -> text
        is Prerequisite.Unadapted -> sourceText
        is Prerequisite.AllOf -> conditions.mapNotNull { it.requirementText(titles, omit) }.distinct().let {
            if (it.isEmpty()) null else if (it.size == 1) it.single() else "(${it.joinToString(" and ")})"
        }
        is Prerequisite.AnyOf -> {
            if (conditions.any { it.isUnconditional(omit) }) {
                null
            } else {
                conditions.mapNotNull { it.requirementText(titles, omit) }.distinct().let {
                    if (it.isEmpty()) null else if (it.size == 1) it.single() else "(${it.joinToString(" or ")})"
                }
            }
        }
    }
}

/** Nested empty/always conjunctions cannot make the other side of an alternative mandatory. */
private fun Prerequisite.isUnconditional(omit: (Prerequisite) -> Boolean): Boolean = omit(this) || when (this) {
    Prerequisite.Always -> true
    is Prerequisite.AllOf -> conditions.all { it.isUnconditional(omit) }
    is Prerequisite.AnyOf -> conditions.any { it.isUnconditional(omit) }
    else -> false
}
