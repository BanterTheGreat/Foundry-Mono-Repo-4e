package dev.modern4e.builder

/** How much of a character an entry's own mechanics can change once it is selected. */
enum class EffectKind {
    /** Only requirements and limits: selecting it supplies nothing beyond its identity. */
    PASSIVE,

    /** A passive entry with an authored power profile: it also supplies that profile's usage. */
    PLAIN_POWER,

    /** Anything else, including mechanics of an unknown version. */
    ACTIVE,
}

/** A kind of character fact a selected entry can supply to the rest of the character. */
enum class SuppliedFact {
    /** Its own identity as a selected entry. Every entry supplies it. */
    IDENTITY,

    /** A selected power's authored usage, read by selected-power requirements. */
    POWER_PROFILE,

    /** Further occurrences: entry grants, progression rows, entry choices or a class profile. */
    ENTRIES,

    /** Facts, fact links and non-entry choices. */
    FACTS,

    /** Skill proficiency grants. */
    PROFICIENCIES,

    /** Ability point modifiers, including conditional modifiers whose targets are not known up front. */
    ABILITY_POINTS,

    /** Equipment proficiencies or armor advancement. */
    EQUIPMENT_PROFICIENCY,

    /** Multiclass access to another class and its power source. */
    CLASS_ACCESS,

    /** A creature size. */
    SIZE,

    /** Power pool rules: selection modifiers or collections. */
    POOL_RULES,
}

/**
 * What kinds of facts an entry can supply to the rest of a character, read from its own mechanics alone. Listing
 * fast paths and listing retention ask it whether an entry is passive or a plain power, and whether selecting or
 * removing it can change one requirement leaf of another entry. It never reports coverage or slot conflicts.
 */
class EffectProfile private constructor(private val entry: ContentEntry) {
    private val mechanics = entry.mechanics

    val kind: EffectKind = when {
        mechanics.version != 2 -> EffectKind.ACTIVE
        mechanics.copy(prerequisites = emptyList(), access = null, maximumSelections = null, unsupported = emptyList(),
            powerProfile = null) != Mechanics(version = 2) -> EffectKind.ACTIVE
        mechanics.powerProfile == null -> EffectKind.PASSIVE
        else -> EffectKind.PLAIN_POWER
    }

    val supplies: Set<SuppliedFact> = buildSet {
        add(SuppliedFact.IDENTITY)
        if (entry.category == EntryCategory.POWER && mechanics.powerProfile != null) {
            add(SuppliedFact.POWER_PROFILE)
        }
        if (mechanics.grants.any { it is Grant.Entry } || mechanics.progression.isNotEmpty() ||
            mechanics.choices.any { it is ChoiceDefinition.Entries } || mechanics.classProfile != null) {
            add(SuppliedFact.ENTRIES)
        }
        if (mechanics.facts.isNotEmpty() || mechanics.factLinks.isNotEmpty() ||
            mechanics.choices.any { it !is ChoiceDefinition.Entries }) {
            add(SuppliedFact.FACTS)
        }
        if (mechanics.grants.any { it is Grant.Proficiency }) {
            add(SuppliedFact.PROFICIENCIES)
        }
        if (mechanics.conditionalModifiers.isNotEmpty() ||
            mechanics.modifiers.any { it.target.statistic == Statistic.ABILITY_POINTS }) {
            add(SuppliedFact.ABILITY_POINTS)
        }
        if (mechanics.equipmentProficiencies.isNotEmpty() || mechanics.armorAdvancement != null) {
            add(SuppliedFact.EQUIPMENT_PROFICIENCY)
        }
        if (mechanics.multiclassFor != null) {
            add(SuppliedFact.CLASS_ACCESS)
        }
        if (mechanics.size != null) {
            add(SuppliedFact.SIZE)
        }
        if (mechanics.selectionModifiers.isNotEmpty() || mechanics.collections.isNotEmpty()) {
            add(SuppliedFact.POOL_RULES)
        }
    }

    /** Whether it can supply further occurrences or facts, whose own effects are not visible from this entry. */
    val cascades: Boolean get() = SuppliedFact.ENTRIES in supplies || SuppliedFact.FACTS in supplies

    /**
     * Whether selecting or removing this entry can change the outcome of one requirement [leaf]. [referenceCategory]
     * is the category of an entry leaf's target; when it is unknown only cascading effects are assumed to reach it,
     * so callers that cannot rule out other paths add their own guard. Grouped conditions are always affected: ask
     * about their leaves instead.
     */
    fun canAffect(leaf: Prerequisite, referenceCategory: EntryCategory? = null): Boolean = when (leaf) {
        is Prerequisite.Always, is Prerequisite.Level, is Prerequisite.Unavailable,
        is Prerequisite.Unresolved, is Prerequisite.Unadapted -> false
        is Prerequisite.Entry -> leaf.entryId == entry.id || when (referenceCategory) {
            EntryCategory.CLASS -> SuppliedFact.ENTRIES in supplies || mechanics.multiclassFor == leaf.entryId
            else -> cascades
        }
        is Prerequisite.Proficiency -> cascades || mechanics.grants.any {
            it is Grant.Proficiency && it.skill == leaf.skill
        }
        is Prerequisite.AbilityPoints -> cascades || mechanics.conditionalModifiers.isNotEmpty() ||
            mechanics.modifiers.any { it.target.statistic == Statistic.ABILITY_POINTS && it.target.ability == leaf.ability }
        is Prerequisite.EquipmentProficiency -> cascades || mechanics.armorAdvancement != null ||
            leaf.equipment in mechanics.equipmentProficiencies
        is Prerequisite.ClassPowerSource -> cascades || SuppliedFact.CLASS_ACCESS in supplies
        is Prerequisite.Size -> cascades || SuppliedFact.SIZE in supplies
        is Prerequisite.Selected -> cascades ||
            leaf.category == EntryCategory.FEAT && SuppliedFact.CLASS_ACCESS in supplies ||
            leaf.category == EntryCategory.POWER && SuppliedFact.POWER_PROFILE in supplies &&
            leaf.filters.usage == mechanics.powerProfile?.usage
        is Prerequisite.AllOf, is Prerequisite.AnyOf -> true
    }

    companion object {
        fun of(entry: ContentEntry): EffectProfile = EffectProfile(entry)
    }
}
