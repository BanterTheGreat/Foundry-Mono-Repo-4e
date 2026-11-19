package dev.modern4e.builder

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.*

class DefenseRulesTest {
    private fun armor(category: String, bonus: Int): EngineEntry {
        val entry = ContentEntry("armor", EntryCategory.ITEM, Presentation("Test armor"), Mechanics(),
            Coverage(CoverageStatus.SUPPORTED), sharedData = buildJsonObject {
                put("equipment", buildJsonObject {
                    put("kind", "ARMOR")
                    put("armorCategory", category)
                    put("proficiencyKey", "TEST_ARMOR")
                    put("armorBonus", bonus)
                })
            })
        return EngineEntry("armor", ChoiceSlotId("armor", "equipment", 0),
            ResolvedEntry(entry, PackageRevision("test", "1"), ContractCodec.fingerprint(entry)), false)
    }

    @Test
    fun lightAndUnarmoredAcUseTheGreaterAbilityWhileHeavyArmorReplacesIt() {
        for ((dexterity, intelligence) in listOf(1 to 5, 6 to 1)) {
            for ((category, armorBonus) in listOf(null to 0, "LIGHT" to 2, "HEAVY" to 7)) {
                val equipment = DefenseEquipment(category?.let { listOf(armor(it, armorBonus)) }.orEmpty(), setOf("TEST_ARMOR"))
                val base = assertIs<ContractResult.Available<CalculatedValue>>(equipment.armorClassBase { ability ->
                    val value = if (ability == Ability.DEXTERITY) dexterity else intelligence
                    ContractResult.Available(CalculatedValue(value, emptyList()))
                }).value
                for (level in listOf(1, 2, 3, 10, 11, 20, 21, 30)) {
                    val modifiers = equipment.modifiers(Statistic.AC, level)
                    val value = assertIs<ContractResult.Available<CalculatedValue>>(
                        ModifierCalculator.calculate(ContractResult.Available(base), modifiers).value).value
                    val ability = if (category == "HEAVY") 0 else maxOf(dexterity, intelligence)
                    assertEquals(10 + ability + armorBonus + level / 2 + (level - 1) / 10 + 1, value.total,
                        "category=$category level=$level Dex=$dexterity Int=$intelligence")
                    assertEquals(value.total, value.contributors.sumOf { it.value })
                }
            }
        }
    }

    @Test
    fun allFourDefensesReceiveExactlyOneTierBonusAndOnlyAcReceivesHalfLevel() {
        val equipment = DefenseEquipment(emptyList(), emptySet())
        for ((level, tier) in listOf(1 to 1, 10 to 1, 11 to 2, 20 to 2, 21 to 3, 30 to 3)) {
            for (statistic in defenseStatistics) {
                val contributions = equipment.modifiers(statistic, level)
                assertEquals(tier, contributions.single { it.label == "Tier bonus" }.modifier.value)
                assertEquals(if (statistic == Statistic.AC) level / 2 else 0,
                    contributions.filter { it.label == "Half level" }.sumOf { it.modifier.value })
                assertEquals(if (statistic == Statistic.AC) 1 else 0,
                    contributions.count { it.label == "Half level" })
            }
        }
    }
}
