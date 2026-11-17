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
) {
    init {
        require(level in 1..30)
        require(levels.all { it.level <= level })
        require(levels.map { it.level }.distinct().size == levels.size)
    }
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
)

@Serializable
enum class Ability { STRENGTH, DEXTERITY, CONSTITUTION, INTELLIGENCE, WISDOM, CHARISMA }

/** Default mapping; the GM may request another ability for an individual check. */
@Serializable
enum class Skill(val ability: Ability) {
    ATHLETICS(Ability.STRENGTH),
    ACROBATICS(Ability.DEXTERITY), STEALTH(Ability.DEXTERITY), THIEVERY(Ability.DEXTERITY),
    ENDURANCE(Ability.CONSTITUTION),
    ARCANA(Ability.INTELLIGENCE), CRAFTING(Ability.INTELLIGENCE),
    SOCIETY(Ability.INTELLIGENCE), MEDICINE(Ability.INTELLIGENCE),
    INSIGHT(Ability.WISDOM), NATURE(Ability.WISDOM), PERCEPTION(Ability.WISDOM), RELIGION(Ability.WISDOM),
    BLUFF(Ability.CHARISMA), DIPLOMACY(Ability.CHARISMA), INTIMIDATE(Ability.CHARISMA),
}

@Serializable
data class ProficiencyChoice(val slot: ChoiceSlotId, val skill: Skill)

@Serializable
data class AbilityAdvancement(val slot: ChoiceSlotId, val increases: Map<Ability, Int>)

@Serializable
data class LevelDecisions(
    val level: Int,
    val entries: List<EntryChoice> = emptyList(),
    val proficiencies: List<ProficiencyChoice> = emptyList(),
    val abilityAdvancements: List<AbilityAdvancement> = emptyList(),
    val replacements: List<Replacement> = emptyList(),
) {
    init {
        require(level in 1..30)
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

@Serializable
data class ManualAdjustment(@OpaqueIdentifier val id: String, val modifier: TypedModifier, val reason: String = "")
