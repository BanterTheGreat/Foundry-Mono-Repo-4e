package dev.modern4e.builder

import kotlinx.serialization.Serializable
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi

/** Portable decisions only. Totals, descriptions and runtime state belong elsewhere. */
@Serializable
data class CharacterDocument(
    val formatVersion: Int = 1,
    @OpaqueIdentifier val id: String,
    val savedAt: String,
    val identity: CharacterIdentity,
    val packages: List<PackageRevision>,
    val level: Int,
    val abilities: AbilityAllocation,
    val levels: List<LevelDecisions> = emptyList(),
    val equipment: List<EquipmentSelection> = emptyList(),
    val manualAdjustments: List<ManualAdjustment> = emptyList(),
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER) val contentMigrations: List<ContentMigrationRecord> = emptyList(),
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER) val craftKnowledge: List<SavedSelection> = emptyList(),
) {
    init {
        require(level in 1..30)
        require(levels.map { it.level }.distinct().size == levels.size)
        require(craftKnowledge.map { it.entryId }.distinct().size == craftKnowledge.size)
        require(craftKnowledge.all { saved -> CraftKnowledgeKind.entries.any { it.matches(saved.entryId) } })
    }

    internal val activeLevels: List<LevelDecisions> get() = levels.filter { it.level <= level }

    /** Scope evaluation to decisions the character has reached. */
    internal fun atLevel(level: Int): CharacterDocument =
        if (this.level == level && levels.none { it.level > level }) this
        else copy(level = level, levels = levels.filter { it.level <= level })

    /** The class definitions this character chose; power pools are scoped to them. */
    fun classEntryIds(): Set<String> = activeLevels.flatMap { it.entries }
        .filter { it.slot == AdvancementRules.classSlot }.map { it.selection.entryId }.toSet()

    /** The ancestry chosen at character creation. */
    fun ancestryEntryIds(): Set<String> = activeLevels.flatMap { it.entries }
        .filter { it.slot == AdvancementRules.ancestrySlot }.map { it.selection.entryId }.toSet()
}

@Serializable
@OptIn(ExperimentalSerializationApi::class)
data class CharacterIdentity(
    val name: String,
    val player: String = "",
    val notes: String = "",
    // Descriptive decisions, independent of calculated combat statistics. Omit empty additions
    // so existing v1 documents retain their original serialized representation.
    @EncodeDefault(EncodeDefault.Mode.NEVER) val gender: String = "",
    @EncodeDefault(EncodeDefault.Mode.NEVER) val age: String = "",
    @EncodeDefault(EncodeDefault.Mode.NEVER) val deity: String = "",
    @EncodeDefault(EncodeDefault.Mode.NEVER) val languages: String = "",
    @EncodeDefault(EncodeDefault.Mode.NEVER) val size: String = "",
    @EncodeDefault(EncodeDefault.Mode.NEVER) val environment: String = "",
    @EncodeDefault(EncodeDefault.Mode.NEVER) val upbringing: String = "",
)

@Serializable
data class PackageRevision(@OpaqueIdentifier val packageId: String, @OpaqueIdentifier val revision: String)

/** The fingerprint is an acknowledgment baseline, never a historical rules pin. */
@Serializable
data class SavedSelection(
    @OpaqueIdentifier val entryId: String,
    val savedTitle: String,
    @OpaqueIdentifier val supplierPackageId: String,
    @OpaqueIdentifier val acknowledgedFingerprint: String,
)

/** Opaque, persistent source-instance ID distinguishes two grants of the same entry. */
@Serializable
data class ChoiceSlotId(@OpaqueIdentifier val sourceInstanceId: String, @OpaqueIdentifier val choiceId: String, val ordinal: Int) {
    init {
        require(sourceInstanceId.isNotBlank() && choiceId.isNotBlank() && ordinal >= 0)
    }
}

@Serializable
/** instanceId identifies this occurrence when it becomes the source of child grants. */
data class EntryChoice(@OpaqueIdentifier val instanceId: String, val slot: ChoiceSlotId, val selection: SavedSelection)

@Serializable
data class AbilityAllocation(
    val source: ChoiceSlotId,
    val mainAbility: Ability,
    val points: Map<Ability, Int>,
) {
    /** Checks the point budget independently of the class that offers the main ability. */
    fun hasValidPoints(): Boolean {
        val nonMain = Ability.entries.filter { it != mainAbility }.map { points[it] ?: 0 }
        if (points[mainAbility] != 4 || nonMain.sum() != 5) {
            return false
        }
        val standard = nonMain.all { it in 0..2 }
        // The transferred point can bring another score to 1, 2 or 3.
        val trade = nonMain.count { it == -1 } == 1 && nonMain.all { it in -1..3 } &&
            nonMain.count { it == 3 } <= 1
        return standard || trade
    }
}

@Serializable
enum class Ability { STRENGTH, DEXTERITY, CONSTITUTION, INTELLIGENCE, WISDOM, CHARISMA }

/**
 * The 2.0 skills in their printed group order, followed by retired identifiers.
 *
 * A skill has no ability of its own: the approach picks the ability when a check is made.
 * Retired identifiers stay decodable so older saves and unadapted content round-trip unchanged.
 * Rules read them through [current].
 */
@Serializable
enum class Skill {
    ATHLETICS, ACROBATICS, ENDURANCE,
    STEALTH, FINESSE,
    ARCANA, OCCULTISM, CRAFTING, MEDICINE, NATURE, CULTURE, RELIGION,
    INSIGHT, STREETWISE, DECEPTION, COMMAND,

    // Retired by the 2.0 list.
    THIEVERY, SOCIETY, BLUFF, INTIMIDATE, PERCEPTION, DIPLOMACY;

    /** The 2.0 skill this identifier stands for: itself, its renamed successor, or null when 2.0 removed it. */
    val current: Skill?
        get() = when (this) {
            THIEVERY -> FINESSE
            SOCIETY -> CULTURE
            BLUFF -> DECEPTION
            INTIMIDATE -> COMMAND
            PERCEPTION, DIPLOMACY -> null
            else -> this
        }

    /** The printed name. */
    val title: String get() = name.lowercase().replaceFirstChar { it.uppercase() }

    companion object {
        /** The skills a 2.0 character can hold, in printed order. */
        val catalog: List<Skill> get() = entries.filter { it.current == it }
    }
}

/** Skill Points with Novice ranks; [bonus] is the total bonus the rank adds to a check. */
@Serializable
enum class SkillRank(val bonus: Int) {
    UNTRAINED(0), NOVICE(1), TRAINED(3), EXPERT(5), ADEPT(7), MASTER(9);

    /** The printed name. */
    val title: String get() = name.lowercase().replaceFirstChar { it.uppercase() }
}

@Serializable
data class ProficiencyChoice(val slot: ChoiceSlotId, val skill: Skill)

@Serializable
data class AbilityAdvancement(val slot: ChoiceSlotId, val increases: Map<Ability, Int>)

/** One skill raised with a milestone's Skill Points, saved as the [rank] it reaches. */
@Serializable
data class SkillIncrease(val skill: Skill, val rank: SkillRank)

@Serializable
data class LevelDecisions(
    val level: Int,
    val entries: List<EntryChoice> = emptyList(),
    val proficiencies: List<ProficiencyChoice> = emptyList(),
    val abilityAdvancements: List<AbilityAdvancement> = emptyList(),
    val replacements: List<Replacement> = emptyList(),
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER) val values: List<ValueChoice> = emptyList(),
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER) val skillIncreases: List<SkillIncrease> = emptyList(),
) {
    init {
        require(level in 1..30)
        require(skillIncreases.map { it.skill }.distinct().size == skillIncreases.size)
    }
}

/** Targets a particular earlier choice, rather than every occurrence of an entry. */
@Serializable
data class Replacement(val replaces: ChoiceSlotId, val replacement: EntryChoice, val kind: ReplacementKind)

@Serializable
enum class ReplacementKind { PROGRESSION, RETRAINING }

@Serializable
data class EquipmentSelection(
    @OpaqueIdentifier val instanceId: String,
    val selection: SavedSelection,
    val quantity: Int = 1,
    val equipped: Boolean = false,
    val configuration: Map<String, String> = emptyMap(),
) {
    init {
        require(quantity > 0)
    }
}

private const val DefenseEnhancementKey = "builder.equipment.defense-enhancement"
val DefenseEnhancementValues = 0..6

/** Read the per-item enhancement. Old selections without one retain a +0 bonus. */
val EquipmentSelection.defenseEnhancement: Int
    get() = configuration[DefenseEnhancementKey].parseDefenseEnhancement() ?: 0

/** Report any configured option the engine cannot apply to this item. */
internal fun EquipmentSelection.hasUnsupportedConfiguration(kind: String?): Boolean =
    configuration.any { (key, value) ->
        key != DefenseEnhancementKey || (kind != "ARMOR" && kind != "NECK") || value.parseDefenseEnhancement() == null
    }

private fun String?.parseDefenseEnhancement(): Int? = this?.toIntOrNull()?.takeIf { it in DefenseEnhancementValues }

/** Update the enhancement without discarding other saved item configuration. */
fun EquipmentSelection.withDefenseEnhancement(value: Int): EquipmentSelection {
    require(value in DefenseEnhancementValues)
    return if (value == 0) {
        copy(configuration = configuration - DefenseEnhancementKey)
    } else {
        copy(configuration = configuration + (DefenseEnhancementKey to value.toString()))
    }
}

@Serializable
data class ManualAdjustment(@OpaqueIdentifier val id: String, val modifier: TypedModifier, val reason: String = "")

@Serializable
data class ValueChoice(val slot: ChoiceSlotId, @OpaqueIdentifier val value: String)
