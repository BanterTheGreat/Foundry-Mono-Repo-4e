package dev.modern4e.builder

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
)

@Serializable
enum class EntryCategory { CLASS, ANCESTRY, BACKGROUND, THEME, FEAT, FEATURE, POWER, PARAGON_PATH, EPIC_DESTINY, ITEM }

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
)

@Serializable
sealed class Prerequisite {
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
    data class Entry(val grantId: String, val entryId: String) : Grant()
    @Serializable @SerialName("proficiency")
    data class Proficiency(val grantId: String, val skill: Skill) : Grant()
}

@Serializable
sealed class ChoiceDefinition {
    @Serializable @SerialName("entries")
    data class Entries(val id: String, val count: Int, val entryIds: List<String>) : ChoiceDefinition()
    @Serializable @SerialName("proficiencies")
    data class Proficiencies(val id: String, val count: Int, val skills: List<Skill>) : ChoiceDefinition()
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
