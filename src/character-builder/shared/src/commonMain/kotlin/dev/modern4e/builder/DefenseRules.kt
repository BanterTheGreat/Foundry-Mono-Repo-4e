package dev.modern4e.builder

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

internal val defenseStatistics = setOf(Statistic.AC, Statistic.FORTITUDE, Statistic.REFLEX, Statistic.WILL)

/** Armor proficiency can cover an entire category or a specific armor type. */
fun isArmorProficient(proficiencyKey: String?, armorCategory: String?, proficiencies: Set<String>): Boolean =
    proficiencyKey in proficiencies || (armorCategory in setOf("LIGHT", "HEAVY") && armorCategory in proficiencies)

/** Static equipment contributions to defenses. Equipment proficiency never equips an item. */
internal class DefenseEquipment(entries: List<EngineEntry>, proficiencies: Set<String>) {
    private data class Equipped(val entry: EngineEntry, val data: JsonObject) {
        val kind get() = data.string("kind")
        val proficiency get() = data.string("proficiencyKey")
        val category get() = data.string("armorCategory")
        val armorBonus get() = (data["armorBonus"] as? JsonPrimitive)?.intOrNull
        val shieldBonus get() = (data["shieldBonus"] as? JsonPrimitive)?.intOrNull
        val title get() = entry.definition.entry.presentation.title
        val slot get() = entry.slot
    }

    private val equipped = entries.filter { it.slot == ChoiceSlotId(it.instanceId, "equipment", 0) && !it.granted && it.definition.entry.category == EntryCategory.ITEM }
        .mapNotNull { entry -> (entry.definition.entry.sharedData?.get("equipment") as? JsonObject)?.let { Equipped(entry, it) } }
    private val armor = equipped.filter { it.kind == "ARMOR" }
    private val shields = equipped.filter { it.kind == "SHIELD" }
    private val wornArmor = armor.singleOrNull()
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

    /** Use the higher direct Dexterity or Intelligence score unless heavy armor replaces it. */
    fun armorClassBase(abilityValue: (Ability) -> ContractResult<CalculatedValue>): ContractResult<CalculatedValue> {
        reflexUnavailable?.let { return it }
        val base = Contributor("Armor Class base", 10)
        if (wornArmor?.category == "HEAVY") {
            return ContractResult.Available(CalculatedValue(base.value, listOf(base)))
        }
        val abilities = listOf(Ability.DEXTERITY, Ability.INTELLIGENCE).map { ability ->
            when (val result = abilityValue(ability)) {
                is ContractResult.Unavailable -> return result
                is ContractResult.Available -> Contributor("${ability.name} points", result.value.total)
            }
        }
        val higher = abilities.maxBy { it.value }
        val total = base.value.toLong() + higher.value
        if (total > Int.MAX_VALUE) {
            return unavailable("Armor Class exceeds the supported integer range.")
        }
        return ContractResult.Available(CalculatedValue(total.toInt(), listOf(base, higher)))
    }

    /** Fortitude, Reflex and Will get the tier bonus; AC gets half the level, rounded down, instead. */
    fun modifiers(statistic: Statistic, level: Int): List<ModifierContribution> = buildList {
        fun addDefense(value: Int, title: String, key: String, source: ChoiceSlotId? = null) {
            add(ModifierContribution(TypedModifier(ModifierTarget(statistic), ModifierOperation.ADD, value), title, key, source))
        }
        if (statistic != Statistic.AC) {
            addDefense((level - 1) / 10 + 1, "Tier bonus", "modern.defense-tier")
        }
        if (statistic == Statistic.AC) {
            addDefense(level / 2, "Half level", "modern.armor-half-level")
            wornArmor?.armorBonus?.let { addDefense(it, wornArmor.title, "modern.armor-bonus", wornArmor.slot) }
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
