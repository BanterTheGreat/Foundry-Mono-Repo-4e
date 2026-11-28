package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.EquipmentCategory
import dev.modern4e.builder.ui.screens.defenseDisplay
import dev.modern4e.builder.ui.screens.defenseBreakdown
import dev.modern4e.builder.ui.screens.equipmentByCategory
import dev.modern4e.builder.ui.screens.maxHpDisplay
import dev.modern4e.builder.ui.screens.maxSurgesDisplay
import org.junit.Assert.assertEquals
import org.junit.Test

class StatsDisplayTest {
    @Test fun defenseBreakdownIncludesClassAndOtherAppliedBonusesAndPenalties() {
        val contributors = listOf(Contributor("Defense base", 10), Contributor("Fighter defense bonus", 3),
            Contributor("CONSTITUTION points", 4), Contributor("Half level", 5), Contributor("Tier bonus", 2),
            Contributor("Neck enhancement", 3), Contributor("Penalty", -2), Contributor("Unused", 0))
        val result = rules().copy(statistics = mapOf(ModifierTarget(Statistic.FORTITUDE) to
            StatisticCalculation(ContractResult.Available(CalculatedValue(25, contributors)), emptyList())))
        assertEquals("Defense base +10, Fighter defense bonus +3, CONSTITUTION points +4, Half level +5, Tier bonus +2, Neck enhancement +3, Penalty -2",
            result.defenseBreakdown(Statistic.FORTITUDE))
        assertEquals("—", result.defenseBreakdown(Statistic.AC))
    }

    private val slot = ChoiceSlotId("class", "proficiency", 0)

    private fun rules(
        proficiencies: List<String> = emptyList(),
        profile: Map<String, List<String>>? = null,
        choices: List<EngineChoice> = emptyList(),
        hp: StatisticCalculation? = null,
        surges: StatisticCalculation? = null,
    ): EngineResult {
        val classEntry = profile?.let {
            val formula = ClassFormula(10)
            val classProfile = ClassProfile("STRIKER", listOf("ARCANE"), listOf(Ability.INTELLIGENCE), emptyList(), it,
                mapOf(Statistic.FORTITUDE to formula, Statistic.REFLEX to formula, Statistic.WILL to formula,
                    Statistic.HIT_POINTS to formula, Statistic.HEALING_SURGES to formula))
            val entry = ContentEntry("class", EntryCategory.CLASS, Presentation("Class"), Mechanics(version = 2, classProfile = classProfile),
                Coverage(CoverageStatus.SUPPORTED))
            EngineEntry("class", slot, ResolvedEntry(entry, PackageRevision("standard", "1"), "fingerprint"), granted = true)
        }
        return EngineResult(listOfNotNull(
            hp?.let { ModifierTarget(Statistic.HIT_POINTS) to it },
            surges?.let { ModifierTarget(Statistic.HEALING_SURGES) to it },
        ).toMap(), listOfNotNull(classEntry), choices,
            emptyMap(), emptyMap(), emptyList(), equipmentProficiencies = proficiencies.associateWith { listOf(slot) })
    }

    @Test fun maxHpShowsTheClassTotalAndADashWithoutABase() {
        val available = StatisticCalculation(ContractResult.Available(CalculatedValue(67, listOf(Contributor("Fighter base", 18)))), emptyList())
        assertEquals("67", rules(hp = available).maxHpDisplay())
        val missing = StatisticCalculation(ContractResult.Unavailable(listOf(Diagnostic("engine.missingBase",
            DiagnosticKind.INCOMPLETE_AUTOMATION, "HIT_POINTS has no authored base."))), emptyList())
        assertEquals("—", rules(hp = missing).maxHpDisplay())
        assertEquals("—", rules().maxHpDisplay())
    }

    @Test fun maxSurgesShowsTheHealingSurgeTotalOrADash() {
        val available = StatisticCalculation(ContractResult.Available(CalculatedValue(9, emptyList())), emptyList())
        val unavailable = StatisticCalculation(ContractResult.Unavailable(listOf(Diagnostic("engine.missingBase",
            DiagnosticKind.INCOMPLETE_AUTOMATION, "HEALING_SURGES has no authored base."))), emptyList())
        assertEquals("9", rules(surges = available).maxSurgesDisplay())
        assertEquals("—", rules(surges = unavailable).maxSurgesDisplay())
        assertEquals("—", rules(hp = available).maxSurgesDisplay())
    }

    @Test fun unavailableDefenseDisplaysADash() {
        assertEquals("—", rules().defenseDisplay(Statistic.WILL))
    }

    @Test fun noProficienciesLeavesEveryCategoryEmpty() {
        assertEquals(EquipmentCategory.entries.associateWith { emptyList<String>() }, rules().equipmentByCategory())
    }

    @Test fun idsWithoutAClassProfileFallBackToTheirNaturalCategory() {
        val grouped = rules(listOf("LIGHT", "HEAVY_SHIELD", "SIMPLE_MELEE", "WAND", "modern4e.weapon.bastard-sword")).equipmentByCategory()
        assertEquals(listOf("Light", "Heavy Shield"), grouped.getValue(EquipmentCategory.ARMOR))
        assertEquals(listOf("Simple Melee", "Bastard Sword"), grouped.getValue(EquipmentCategory.WEAPONS))
        assertEquals(listOf("Wand"), grouped.getValue(EquipmentCategory.IMPLEMENTS))
    }

    @Test fun classProfileDecidesAmbiguousValuesAndShieldsJoinArmor() {
        val profile = mapOf("armor" to listOf("CLOTH"), "shields" to listOf("LIGHT_SHIELD"), "weapons" to listOf("DAGGER", "STAFF"),
            "implements" to listOf("STAFF", "DAGGER"))
        val grouped = rules(listOf("CLOTH", "LIGHT_SHIELD", "DAGGER", "STAFF"), profile).equipmentByCategory()
        assertEquals(listOf("Cloth", "Light Shield"), grouped.getValue(EquipmentCategory.ARMOR))
        assertEquals(listOf("Dagger", "Staff"), grouped.getValue(EquipmentCategory.WEAPONS))
        assertEquals(listOf("Dagger", "Staff"), grouped.getValue(EquipmentCategory.IMPLEMENTS))
    }

    @Test fun chosenProficiencyUsesItsOptionTitleAndRepeatsAreDropped() {
        val choice = EngineChoice(slot, values = listOf(ValueOption("modern4e.weapon.execution-axe", "Execution Axe")), valueKind = FactKind.EQUIPMENT_PROFICIENCY)
        val grouped = rules(listOf("modern4e.weapon.execution-axe", "SIMPLE_MELEE"), choices = listOf(choice)).equipmentByCategory()
        assertEquals(listOf("Execution Axe", "Simple Melee"), grouped.getValue(EquipmentCategory.WEAPONS))
    }
}
