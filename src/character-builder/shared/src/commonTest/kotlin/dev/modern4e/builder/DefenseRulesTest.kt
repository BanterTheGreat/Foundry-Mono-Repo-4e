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
                for (level in (1..30)) {
                    val modifiers = equipment.modifiers(Statistic.AC, level)
                    val value = assertIs<ContractResult.Available<CalculatedValue>>(
                        ModifierCalculator.calculate(ContractResult.Available(base), modifiers).value).value
                    val ability = if (category == "HEAVY") 0 else maxOf(dexterity, intelligence).coerceAtMost(3)
                    assertEquals(10 + ability + armorBonus + level / 2 +
                        listOf(5, 9, 13, 17, 19, 25, 27, 29).count { it <= level }, value.total,
                        "category=$category level=$level Dex=$dexterity Int=$intelligence")
                    assertEquals(value.total, value.contributors.sumOf { it.value })
                }
            }
        }
    }

    @Test
    fun classSubstitutionsUseTheBestEligibleAbilityOnlyInLightOrNoArmor() {
        val alternatives = mapOf(
            "modern4e.feature.barbarian-barbarian-agility" to Ability.STRENGTH,
            "modern4e.feature.primal-guardian" to Ability.CONSTITUTION,
            "modern4e.feature.world-speaker-spirit" to Ability.CONSTITUTION,
        )
        for ((id, ability) in alternatives) {
            val entry = ContentEntry(id, EntryCategory.FEATURE, Presentation(id), Mechanics(), Coverage(CoverageStatus.SUPPORTED))
            val feature = EngineEntry(id, ChoiceSlotId("class", "feature", 0),
                ResolvedEntry(entry, PackageRevision("test", "1"), ContractCodec.fingerprint(entry)), true)
            for (equipped in listOf(emptyList(), listOf(armor("LIGHT", 2)), listOf(armor("HEAVY", 5)))) {
                val equipment = DefenseEquipment(equipped + feature, setOf("TEST_ARMOR"))
                val result = assertIs<ContractResult.Available<CalculatedValue>>(equipment.armorClassBase {
                    ContractResult.Available(CalculatedValue(if (it == ability) 4 else 1, emptyList()))
                }).value
                val heavy = equipped.singleOrNull() == armor("HEAVY", 5)
                assertEquals(if (heavy) 10 else 13, result.total)
                assertEquals(!heavy, result.contributors.any { it.label.startsWith(ability.name) })
            }
        }
    }

    @Test
    fun abilityTiesCountOneTermAndTheContributionFollowsTheHigherScore() {
        for (abilities in nonArmorDefenseAbilities.values) {
            for ((first, second) in listOf(2 to 2, 3 to 2, 2 to 4)) {
                val best = assertIs<ContractResult.Available<Contributor>>(defenseAbility(abilities, {
                    ContractResult.Available(CalculatedValue(if (it == abilities.first()) first else second, emptyList()))
                })).value
                assertEquals(maxOf(first, second), best.value)
                assertEquals("${if (first >= second) abilities.first() else abilities.last()} points", best.label)
            }
        }
    }

    @Test
    fun allDefensesReceiveHalfLevelAndOnlyNonAcDefensesReceiveTierBonus() {
        val equipment = DefenseEquipment(emptyList(), emptySet())
        for ((level, tier) in listOf(1 to 1, 10 to 1, 11 to 2, 20 to 2, 21 to 3, 30 to 3)) {
            for (statistic in defenseStatistics) {
                val contributions = equipment.modifiers(statistic, level)
                if (statistic == Statistic.AC) {
                    assertTrue(contributions.none { it.label == "Tier bonus" }, "AC level=$level")
                } else {
                    assertEquals(tier, contributions.single { it.label == "Tier bonus" }.modifier.value)
                }
                assertEquals(level / 2,
                    contributions.filter { it.label == "Half level" }.sumOf { it.modifier.value })
                assertEquals(1,
                    contributions.count { it.label == "Half level" })
            }
        }
    }
}
