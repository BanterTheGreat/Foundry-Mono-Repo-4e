package dev.modern4e.builder

/** Authored requirements and the failures reported for this exact acquisition-time candidate. */
internal data class PowerRequirementPreview(val requirements: String?, val unmet: List<String>)

/** Keep the power preview API while sharing requirement explanations with advancement entries. */
internal fun powerRequirementPreview(row: BuilderOptionRow, titles: Map<String, String>,
    classIds: Set<String> = emptySet()): PowerRequirementPreview = entryRequirementPreview(row, titles, classIds)

/** Explain checked historical requirements; power class and level are already represented by their picker. */
internal fun entryRequirementPreview(row: BuilderOptionRow, titles: Map<String, String>,
    classIds: Set<String> = emptySet()): PowerRequirementPreview {
    val option = row.option ?: return PowerRequirementPreview(null, emptyList())
    val entry = option.entry.entry
    val conditions = listOfNotNull(entry.mechanics.access) + entry.mechanics.prerequisites
    val leaves = conditions.flatMap { it.requirementLeaves() }
    val omit: (Prerequisite) -> Boolean = { condition -> entry.category == EntryCategory.POWER &&
        (condition is Prerequisite.Level || condition is Prerequisite.Entry && condition.entryId in classIds) }
    val authored = conditions.mapNotNull { it.requirementText(titles, omit) }
    val diagnostics = (option.diagnostics + row.diagnostics).distinct()
    val unmet = diagnostics.mapNotNull { diagnostic ->
        when (diagnostic.code) {
            "engine.prerequisite" -> leaves.firstOrNull {
                diagnostic.message == "Unsatisfied prerequisite: $it"
            }?.takeUnless(omit)?.requirementText(titles, omit)
            "engine.unavailableCondition" -> leaves.filterIsInstance<Prerequisite.Unavailable>().firstOrNull {
                diagnostic.message == "${it.text}: ${it.reason}"
            }?.text?.let { "Unavailable: $it" }
            "engine.unresolvedCondition" -> leaves.filterIsInstance<Prerequisite.Unresolved>().firstOrNull {
                diagnostic.message == "${it.text}: ${it.reason}"
            }?.text?.let { "Not confirmed: $it" }
            "engine.unadaptedPrerequisite" -> leaves.filterIsInstance<Prerequisite.Unadapted>().firstOrNull {
                diagnostic.message == "Prerequisite needs adaptation: ${it.sourceText}"
            }?.sourceText?.let { "Not confirmed: $it" }
            "engine.prerequisiteUnavailable", "engine.classFactsUnavailable", "engine.sizeFactsUnavailable",
            "engine.selectedFactsUnavailable", "engine.prerequisiteDependency" -> "Some requirements could not be checked."
            else -> null
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
        is Prerequisite.Proficiency -> "Proficient in ${skill.name.readable()}"
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

/** Enumerate the authored leaves so engine failures can be matched without parsing data-class strings. */
private fun Prerequisite.requirementLeaves(): List<Prerequisite> = when (this) {
    is Prerequisite.AllOf -> conditions.flatMap { it.requirementLeaves() }
    is Prerequisite.AnyOf -> conditions.flatMap { it.requirementLeaves() }
    else -> listOf(this)
}

/** Nested empty/always conjunctions cannot make the other side of an alternative mandatory. */
private fun Prerequisite.isUnconditional(omit: (Prerequisite) -> Boolean): Boolean = omit(this) || when (this) {
    Prerequisite.Always -> true
    is Prerequisite.AllOf -> conditions.all { it.isUnconditional(omit) }
    is Prerequisite.AnyOf -> conditions.any { it.isUnconditional(omit) }
    else -> false
}
