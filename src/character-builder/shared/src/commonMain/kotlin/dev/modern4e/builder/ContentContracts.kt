@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package dev.modern4e.builder

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.EncodeDefault

@Serializable
data class PackageManifest(
    val formatVersion: Int = 1,
    val id: String,
    val revision: String,
    val title: String,
    val dependencies: List<PackageRevision> = emptyList(),
    val indexes: List<String>,
    val chunks: List<String>,
)

@Serializable
data class ContentIndex(val entries: List<EntryMetadata>)

@Serializable
data class EntryMetadata(
    val id: String,
    val category: EntryCategory,
    val title: String,
    val chunkId: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val featGroup: FeatGroup? = null,
    /** The class whose power this is selectable by; loaders skip other classes' powers and chunks. Never an eligibility result. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val classId: String? = null,
    /** For a Class feat, at least one of these access routes is required. Empty means unscoped. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val featClassIds: List<String> = emptyList(),
    /** For an Ancestry feat, at least one of these access routes is required. Empty means unscoped. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val featAncestryIds: List<String> = emptyList(),
    /** Classes that can access this path. Empty preserves unscoped and older package rows. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val pathClassIds: List<String> = emptyList(),
) {
    /** Unscoped and older index rows always proceed to eligibility checks. */
    fun matchesFeatClasses(classes: Set<String>): Boolean = featClassIds.isEmpty() || featClassIds.any { it in classes }

    /** Keep unscoped rows and feats that match a selected or qualifying ancestry. */
    fun matchesFeatAncestries(ancestries: Set<String>): Boolean =
        featAncestryIds.isEmpty() || featAncestryIds.any { it in ancestries }

    /** Metadata narrows path candidates before their definitions and eligibility are evaluated. */
    fun matchesPathClasses(classes: Set<String>): Boolean =
        pathClassIds.isEmpty() || pathClassIds.any { it in classes }
}

/** Authored access grouping for feat browsing; never an eligibility result. */
@Serializable
enum class FeatGroup { GENERAL, ANCESTRY, CLASS }

@Serializable
data class EntryChunk(val id: String, val entries: List<ContentEntry>)

@Serializable
data class ContentEntry(
    val id: String,
    val category: EntryCategory,
    val presentation: Presentation,
    val mechanics: Mechanics,
    val coverage: Coverage,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val sharedData: kotlinx.serialization.json.JsonObject? = null,
)

@Serializable
enum class EntryCategory { CLASS, ANCESTRY, BACKGROUND, THEME, FEAT, FEATURE, POWER, PARAGON_PATH, EPIC_DESTINY, ITEM, TECHNIQUE }

/** Controls how an automatically granted feature is presented in Levels. */
@Serializable
enum class GrantDisplay { STANDALONE, CHOICE_INTRODUCTION, GRANT_SUMMARY }

@Serializable
data class Presentation(
    val title: String,
    val description: String = "",
    val publications: List<String> = emptyList(),
    val references: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val grantDisplay: GrantDisplay = GrantDisplay.STANDALONE,
)

@Serializable
data class Coverage(val status: CoverageStatus, val limitations: List<String> = emptyList())

@Serializable
enum class CoverageStatus { SUPPORTED, PARTIAL, UNIMPLEMENTED }

/** Closed data vocabulary. New mechanics require a shared engine release. */
@Serializable
data class Mechanics(
    val prerequisites: List<Prerequisite> = emptyList(),
    val grants: List<Grant> = emptyList(),
    val choices: List<ChoiceDefinition> = emptyList(),
    val modifiers: List<TypedModifier> = emptyList(),
    val progression: List<ClassProgression> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val version: Int = 1,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val access: Prerequisite? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val classProfile: ClassProfile? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val conditionalModifiers: List<ConditionalModifier> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val unsupported: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val multiclassFor: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val maximumSelections: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val weaponAbilities: Map<WeaponGroup, Ability> = emptyMap(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val selectionModifiers: List<SelectionModifier> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val collections: List<PowerCollection> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val powerProfile: PowerProfile? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val equipmentProficiencies: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val armorAdvancement: ArmorAdvancement? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val size: CreatureSize? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val facts: List<FactGrant> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val factLinks: List<FactLink> = emptyList(),
)

@Serializable
sealed class Prerequisite {
    @Serializable @SerialName("always")
    data object Always : Prerequisite()
    @Serializable @SerialName("allOf")
    data class AllOf(val conditions: List<Prerequisite>) : Prerequisite()
    @Serializable @SerialName("anyOf")
    data class AnyOf(val conditions: List<Prerequisite>) : Prerequisite()
    @Serializable @SerialName("classPowerSource")
    data class ClassPowerSource(val powerSource: String) : Prerequisite()
    @Serializable @SerialName("equipmentProficiency")
    data class EquipmentProficiency(val equipment: String) : Prerequisite()
    @Serializable @SerialName("size")
    data class Size(val size: CreatureSize) : Prerequisite()
    @Serializable @SerialName("selected")
    data class Selected(val category: EntryCategory, val filters: SelectedFilters) : Prerequisite() {
        init {
            require(category == EntryCategory.FEAT && filters == SelectedFilters(multiclass = true, classSpecific = true) ||
                category == EntryCategory.POWER && filters == SelectedFilters(usage = "ENCOUNTER", hasLevel = true))
        }
    }
    @Serializable @SerialName("unavailable")
    data class Unavailable(val text: String, val reason: String) : Prerequisite()
    @Serializable @SerialName("unresolved")
    data class Unresolved(val text: String, val reason: String) : Prerequisite()
    @Serializable @SerialName("level")
    data class Level(val minimum: Int) : Prerequisite()
    @Serializable @SerialName("entry")
    data class Entry(val entryId: String) : Prerequisite()
    @Serializable @SerialName("abilityPoints")
    data class AbilityPoints(val ability: Ability, val minimum: Int) : Prerequisite()
    @Serializable @SerialName("proficiency")
    data class Proficiency(val skill: Skill) : Prerequisite()
    /** Text is never interpreted as a vanilla score or an executable expression. */
    @Serializable @SerialName("unadapted")
    data class Unadapted(val sourceText: String) : Prerequisite()
}

@Serializable
sealed class Grant {
    @Serializable @SerialName("entry")
    data class Entry(val grantId: String, val entryId: String,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val atLevel: Int = 1,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val replacementEntryIds: List<String> = emptyList()) : Grant() {
        init {
            require(atLevel in 1..30)
            require(replacementEntryIds.distinct() == replacementEntryIds && replacementEntryIds.none { it.isBlank() || it == entryId })
        }
    }
    @Serializable @SerialName("proficiency")
    data class Proficiency(val grantId: String, val skill: Skill) : Grant()
}

@Serializable
sealed class ChoiceDefinition {
    /** Finite decisions grant typed facts; targetId scopes power facts without changing character facts. */
    @Serializable @SerialName("values")
    data class Values(val id: String, val count: Int, val kind: FactKind, val options: List<ValueOption>,
        val targetId: String? = null, val distinctScope: FactScope = FactScope.NONE,
        val allowRepeatWhenExhausted: Boolean = false,
        val bonus: Int = 0, val epicBonus: Int = 0) : ChoiceDefinition()

    @Serializable @SerialName("entries")
    data class Entries(val id: String, val count: Int, val entryIds: List<String> = emptyList(),
        @EncodeDefault(EncodeDefault.Mode.NEVER) val atLevel: Int = 1,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val distinct: Boolean = false,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val query: PowerQuery? = null,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val countByLevel: List<ChoiceCount> = emptyList(),
        @EncodeDefault(EncodeDefault.Mode.NEVER) val constraints: List<SelectionConstraint> = emptyList(),
        @EncodeDefault(EncodeDefault.Mode.NEVER) val collection: String? = null,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val requiresCollection: String? = null,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val replacementLevels: List<Int> = emptyList()) : ChoiceDefinition() {
        init {
            require(atLevel in 1..30)
            require(query == null || entryIds.isEmpty())
            require(countByLevel.isEmpty() || countByLevel.first().atLevel == 1 &&
                countByLevel.map { it.atLevel } == countByLevel.map { it.atLevel }.distinct().sorted())
            require(replacementLevels.all { it in 1..30 } && replacementLevels == replacementLevels.distinct().sorted())
        }
    }
    @Serializable @SerialName("proficiencies")
    data class Proficiencies(val id: String, val count: Int, val skills: List<Skill>,
        @EncodeDefault(EncodeDefault.Mode.NEVER) val distinctAgainstCharacter: Boolean = false,
        /** The rank each pick grants. A NOVICE choice is offered only after the four starting Trained skills. */
        @EncodeDefault(EncodeDefault.Mode.NEVER) val rank: SkillRank = SkillRank.TRAINED) : ChoiceDefinition() {
        init {
            require(rank == SkillRank.TRAINED || rank == SkillRank.NOVICE)
        }
    }
    @Serializable @SerialName("mainAbility")
    data class MainAbility(val id: String, val abilities: List<Ability>) : ChoiceDefinition()
}

@Serializable
enum class Statistic { ABILITY_POINTS, SKILL_CHECK, HIT_POINTS, HEALING_SURGES, AC, FORTITUDE, REFLEX, WILL, ATTACK, DAMAGE, SPEED }

@Serializable
data class ModifierTarget(val statistic: Statistic, val ability: Ability? = null, val skill: Skill? = null) {
    init {
        require((statistic == Statistic.ABILITY_POINTS) == (ability != null))
        require((statistic == Statistic.SKILL_CHECK) == (skill != null))
    }
}

@Serializable
enum class ModifierOperation { ADD, SET, MINIMUM }

@Serializable
enum class BonusType { UNTYPED, FEAT, ITEM, POWER, PROFICIENCY, ENHANCEMENT }

/** ADD uses typed stacking; SET and MINIMUM are explicit operations, not scripts. */
@Serializable
data class TypedModifier(val target: ModifierTarget, val operation: ModifierOperation, val value: Int, val bonusType: BonusType = BonusType.UNTYPED)

@Serializable
data class ClassProgression(
    val level: Int,
    val grants: List<Grant> = emptyList(),
    val choices: List<ChoiceDefinition> = emptyList(),
    val modifiers: List<TypedModifier> = emptyList(),
) {
    init {
        require(level in 1..30)
    }
}

/** An authored progression grants only the next category; no initial proficiency is assumed. */
@Serializable
data class ArmorAdvancement(val order: List<String>, val steps: Int) {
    init {
        require(order.size >= 2 && order == order.distinct() && order.none { it.isBlank() })
        require(steps > 0 && steps < order.size)
    }
}

/** Normal is the ancestry author's size identity; descriptions do not establish size facts. */
@Serializable
enum class CreatureSize { TINY, SMALL, NORMAL, MEDIUM, LARGE, HUGE, GARGANTUAN }

/** Closed selected-entry predicates currently authored by Modern 4e feats. */
@Serializable
data class SelectedFilters(
    @EncodeDefault(EncodeDefault.Mode.NEVER) val multiclass: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val classSpecific: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val usage: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val hasLevel: Boolean? = null,
)

/** Closed build-time facts. Descriptive identity text never creates these facts. */
@Serializable
enum class FactKind { LANGUAGE, EQUIPMENT_PROFICIENCY, DAMAGE_TYPE, ANCESTRY_QUALIFICATION, SKILL_BONUS }
@Serializable
enum class FactScope { NONE, CHARACTER, ENTRY, POWER }
@Serializable
data class ValueOption(val id: String, val title: String, val grants: List<String> = emptyList())
@Serializable
data class FactGrant(val kind: FactKind, val values: List<String>, val targetId: String? = null)
@Serializable
data class StructuredFact(val kind: FactKind, val value: String, val targetId: String?, val source: ChoiceSlotId)

@Serializable
data class FactLink(val kind: FactKind, val sourceTargetId: String, val targetId: String)
