package dev.modern4e.builder

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

internal val defenseStatistics = setOf(Statistic.AC, Statistic.FORTITUDE, Statistic.REFLEX, Statistic.WILL)

internal val nonArmorDefenseAbilities = mapOf(
    Statistic.FORTITUDE to listOf(Ability.STRENGTH, Ability.CONSTITUTION),
    Statistic.REFLEX to listOf(Ability.DEXTERITY, Ability.INTELLIGENCE),
    Statistic.WILL to listOf(Ability.WISDOM, Ability.CHARISMA),
)

private val armorClassMilestones = listOf(5, 9, 13, 17, 19, 25, 27, 29)
private const val barbarianAgility = "modern4e.feature.barbarian-barbarian-agility"
private val armorAbilitySubstitutions = mapOf(
    barbarianAgility to Ability.STRENGTH,
    "modern4e.feature.primal-guardian" to Ability.CONSTITUTION,
    "modern4e.feature.world-speaker-spirit" to Ability.CONSTITUTION,
)

/** Resolve the best available ability and apply a cap when the defense calls for one. */
internal fun defenseAbility(
    abilities: List<Ability>,
    abilityValue: (Ability) -> ContractResult<CalculatedValue>,
    cap: Int = Int.MAX_VALUE,
): ContractResult<Contributor> {
    val terms = abilities.map { ability ->
        when (val result = abilityValue(ability)) {
            is ContractResult.Unavailable -> return result
            is ContractResult.Available -> Contributor("${ability.name} points", result.value.total)
        }
    }
    val best = terms.maxBy { it.value }
    return ContractResult.Available(if (best.value > cap) {
        best.copy(label = "${best.label} (capped at $cap)", value = cap)
    } else {
        best
    })
}

/** Armor proficiency can cover an entire category or a specific armor type. */
fun isArmorProficient(proficiencyKey: String?, armorCategory: String?, proficiencies: Set<String>): Boolean =
    proficiencyKey in proficiencies || (armorCategory in setOf("LIGHT", "HEAVY") && armorCategory in proficiencies)

/** Static equipment contributions to defenses. Equipment proficiency never equips an item. */
internal class DefenseEquipment(
    entries: List<EngineEntry>,
    proficiencies: Set<String>,
    selections: List<EquipmentSelection> = emptyList(),
) {
    private data class Equipped(val entry: EngineEntry, val data: JsonObject) {
        val kind get() = data.string("kind")
        val proficiency get() = data.string("proficiencyKey")
        val category get() = data.string("armorCategory")
        val armorBonus get() = (data["armorBonus"] as? JsonPrimitive)?.intOrNull
        val shieldBonus get() = (data["shieldBonus"] as? JsonPrimitive)?.intOrNull
        val armorAbilityCap get() = (data["acAbilityCap"] as? JsonPrimitive)?.intOrNull ?: 3
        val title get() = entry.definition.entry.presentation.title
        val slot get() = entry.slot
    }

    private val equipped = entries.filter { it.slot == ChoiceSlotId(it.instanceId, "equipment", 0) && !it.granted && it.definition.entry.category == EntryCategory.ITEM }
        .mapNotNull { entry -> (entry.definition.entry.sharedData?.get("equipment") as? JsonObject)?.let { Equipped(entry, it) } }
    private val armor = equipped.filter { it.kind == "ARMOR" }
    private val shields = equipped.filter { it.kind == "SHIELD" }
    private val wornArmor = armor.singleOrNull()
    private val neck = equipped.filter { it.kind == "NECK" }.singleOrNull()
    private val enhancements = selections.filter { it.equipped }.associate { it.instanceId to it.defenseEnhancement }
    private val classFeatures = entries.filter { it.definition.entry.id in armorAbilitySubstitutions }
    private val proficientArmor = isArmorProficient(wornArmor?.proficiency, wornArmor?.category, proficiencies)
    private val shield = shields.filter { it.proficiency in proficiencies }.maxByOrNull { it.shieldBonus ?: 0 }
    private val armorUnavailable = if (
        armor.size > 1 || wornArmor?.let { it.category !in setOf("LIGHT", "HEAVY") || it.armorBonus == null || it.proficiency == null } == true
    ) {
        unavailable("Cannot determine defenses from the equipped armor.")
    } else null
    private val shieldUnavailable = if (shields.any { it.shieldBonus == null || it.proficiency == null }) {
        unavailable("Cannot determine defenses from the equipped shield.")
    } else null
    val reflexUnavailable get() = armorUnavailable ?: shieldUnavailable

    /** Choose the best eligible ability for light or unarmored AC. */
    fun armorClassBase(abilityValue: (Ability) -> ContractResult<CalculatedValue>): ContractResult<CalculatedValue> {
        reflexUnavailable?.let { return it }
        val base = Contributor("Armor Class base", 10)
        if (wornArmor?.category == "HEAVY") {
            return ContractResult.Available(CalculatedValue(base.value, listOf(base)))
        }
        val abilities = listOf(Ability.DEXTERITY, Ability.INTELLIGENCE) +
            classFeatures.map { armorAbilitySubstitutions.getValue(it.definition.entry.id) }
        return when (val ability = defenseAbility(abilities.distinct(), abilityValue, wornArmor?.armorAbilityCap ?: 3)) {
            is ContractResult.Unavailable -> ability
            is ContractResult.Available -> ContractResult.Available(
                CalculatedValue(base.value + ability.value.value, listOf(base, ability.value)),
            )
        }
    }

    /** Supply defense progression and equipped item contributions. */
    fun modifiers(statistic: Statistic, level: Int): List<ModifierContribution> = buildList {
        fun addDefense(value: Int, title: String, key: String, source: ChoiceSlotId? = null, type: BonusType = BonusType.UNTYPED) {
            add(ModifierContribution(TypedModifier(ModifierTarget(statistic), ModifierOperation.ADD, value, type), title, key, source))
        }
        addDefense(level / 2, "Half level", "modern.defense-half-level")
        if (statistic == Statistic.AC) {
            addDefense(armorClassMilestones.count { it <= level }, "AC advancement", "modern.armor-advancement")
            wornArmor?.armorBonus?.let { addDefense(it, wornArmor.title, "modern.armor-bonus", wornArmor.slot) }
        } else {
            addDefense((level - 1) / 10 + 1, "Tier bonus", "modern.defense-tier")
        }
        val enhancedItem = if (statistic == Statistic.AC) wornArmor else neck
        if (enhancedItem != null) {
            val enhancement = enhancements[enhancedItem.entry.instanceId] ?: 0
            if (enhancement > 0) {
                val label = if (statistic == Statistic.AC) "Armor enhancement" else "Neck enhancement"
                addDefense(enhancement, label, "modern.defense-enhancement", enhancedItem.slot, BonusType.ENHANCEMENT)
            }
        }
        if (statistic == Statistic.REFLEX && wornArmor?.category != "HEAVY") {
            classFeatures.firstOrNull { it.definition.entry.id == barbarianAgility }?.let {
                addDefense(1, it.definition.entry.presentation.title, barbarianAgility, it.slot)
            }
        }
        if (statistic == Statistic.REFLEX && wornArmor?.proficiency != null && !proficientArmor) {
            addDefense(-2, "${wornArmor.title} nonproficiency", "modern.armor-nonproficiency", wornArmor.slot)
        }
        if (statistic == Statistic.AC || statistic == Statistic.REFLEX) {
            shield?.shieldBonus?.let { addDefense(it, shield.title, "modern.shield-bonus", shield.slot) }
        }
    }

    private fun unavailable(message: String) = ContractResult.Unavailable(listOf(
        Diagnostic("engine.defenseEquipment", DiagnosticKind.INCOMPLETE_AUTOMATION, message)))
}

private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
