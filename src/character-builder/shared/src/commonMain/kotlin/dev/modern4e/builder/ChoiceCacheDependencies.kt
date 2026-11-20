package dev.modern4e.builder

/**
 * Proves that an already checked row is independent of changed entry selections. The caller must
 * establish unchanged content, acquisition level, slot identity and pool rules first. Unknown or
 * active candidates are checked again rather than guessing which effects could change their proof.
 */
object ChoiceCacheDependencies {
    /** Changes include both removed and added definitions, including displaced replacement powers. */
    fun canRetain(candidate: ContentEntry, changes: List<ContentEntry>, categories: Map<String, EntryCategory>): Boolean {
        if (!passive(candidate)) {
            return false
        }
        val requirements = (candidate.mechanics.prerequisites + listOfNotNull(candidate.mechanics.access))
            .flatMap { it.leaves() }
        return changes.all { changed ->
            candidate.id != changed.id && changed.mechanics.version == 2 && when (changed.category) {
                EntryCategory.POWER -> passive(changed) &&
                    !samePowerFamily(candidate.mechanics.powerProfile, changed.mechanics.powerProfile) &&
                    requirements.all { independentOfPower(it, changed) }
                EntryCategory.FEAT -> changed.mechanics.selectionModifiers.isEmpty() &&
                    changed.mechanics.collections.isEmpty() &&
                    requirements.all { independentOfFeat(it, changed, categories) }
                else -> false
            }
        }
    }

    /** Passive selections cannot supply facts that change the candidate's dependency exclusions. */
    private fun passive(entry: ContentEntry): Boolean {
        val mechanics = entry.mechanics
        return entry.category in setOf(EntryCategory.FEAT, EntryCategory.POWER) && mechanics.version == 2 &&
            (entry.category != EntryCategory.POWER || mechanics.powerProfile != null) &&
            mechanics.copy(prerequisites = emptyList(), access = null, maximumSelections = null,
                unsupported = emptyList(), powerProfile = null) == Mechanics(version = 2)
    }

    /** Utilities form one family even when their activation usages differ. */
    private fun samePowerFamily(left: PowerProfile?, right: PowerProfile?): Boolean =
        left != null && right != null && left.powerKind == right.powerKind &&
            (left.powerKind == "UTILITY" || left.usage == right.usage)

    /** A passive power only supplies its selected identity and its authored usage profile. */
    private fun independentOfPower(condition: Prerequisite, power: ContentEntry): Boolean = when (condition) {
        is Prerequisite.Entry -> condition.entryId != power.id
        is Prerequisite.Selected -> condition.category != EntryCategory.POWER ||
            condition.filters.usage != power.mechanics.powerProfile?.usage
        is Prerequisite.AllOf, is Prerequisite.AnyOf -> false
        else -> true
    }

    /** Match each prerequisite against the kinds of facts a changed feat can supply. */
    private fun independentOfFeat(condition: Prerequisite, feat: ContentEntry,
        categories: Map<String, EntryCategory>): Boolean {
        val mechanics = feat.mechanics
        val indirect = mechanics.grants.any { it is Grant.Entry } || mechanics.progression.isNotEmpty() ||
            mechanics.choices.isNotEmpty() || mechanics.facts.isNotEmpty() || mechanics.factLinks.isNotEmpty() ||
            mechanics.classProfile != null
        val indirectEntries = mechanics.grants.any { it is Grant.Entry } || mechanics.progression.isNotEmpty() ||
            mechanics.choices.any { it is ChoiceDefinition.Entries } || mechanics.classProfile != null
        return when (condition) {
            is Prerequisite.Always, is Prerequisite.Level, is Prerequisite.Unavailable,
            is Prerequisite.Unresolved, is Prerequisite.Unadapted -> true
            is Prerequisite.Entry -> condition.entryId != feat.id && when (categories[condition.entryId]) {
                EntryCategory.CLASS -> !indirectEntries && mechanics.multiclassFor != condition.entryId
                null -> false
                else -> !indirect
            }
            is Prerequisite.Proficiency -> !indirect && mechanics.grants.none {
                it is Grant.Proficiency && it.skill == condition.skill
            }
            is Prerequisite.AbilityPoints -> !indirect && mechanics.conditionalModifiers.isEmpty() &&
                mechanics.modifiers.none {
                    it.target.statistic == Statistic.ABILITY_POINTS && it.target.ability == condition.ability
                }
            is Prerequisite.EquipmentProficiency -> !indirect && mechanics.armorAdvancement == null &&
                condition.equipment !in mechanics.equipmentProficiencies
            is Prerequisite.ClassPowerSource -> !indirect && mechanics.multiclassFor == null
            is Prerequisite.Size -> !indirect && mechanics.size == null
            is Prerequisite.Selected -> !indirect &&
                (condition.category != EntryCategory.FEAT || mechanics.multiclassFor == null)
            is Prerequisite.AllOf, is Prerequisite.AnyOf -> false
        }
    }
}
