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
data class EntryMetadata(val id: String, val category: EntryCategory, val title: String, val chunkId: String)

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

@Serializable
data class Presentation(
    val title: String,
    val description: String = "",
    val publications: List<String> = emptyList(),
    val references: List<String> = emptyList(),
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
        @EncodeDefault(EncodeDefault.Mode.NEVER) val atLevel: Int = 1) : Grant() {
        init {
            require(atLevel in 1..30)
        }
    }
    @Serializable @SerialName("proficiency")
    data class Proficiency(val grantId: String, val skill: Skill) : Grant()
}

@Serializable
sealed class ChoiceDefinition {
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
        @EncodeDefault(EncodeDefault.Mode.NEVER) val distinctAgainstCharacter: Boolean = false) : ChoiceDefinition()
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
