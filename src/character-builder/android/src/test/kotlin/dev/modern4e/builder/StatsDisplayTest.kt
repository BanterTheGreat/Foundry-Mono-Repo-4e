package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.EquipmentCategory
import dev.modern4e.builder.ui.screens.defenseDisplay
import dev.modern4e.builder.ui.screens.equipmentByCategory
import dev.modern4e.builder.ui.screens.maxHpDisplay
import org.junit.Assert.assertEquals
import org.junit.Test

class StatsDisplayTest {
    private val slot = ChoiceSlotId("class", "proficiency", 0)

    private fun rules(
        proficiencies: List<String> = emptyList(),
        profile: Map<String, List<String>>? = null,
        choices: List<EngineChoice> = emptyList(),
        hp: StatisticCalculation? = null,
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
        return EngineResult(listOfNotNull(hp?.let { ModifierTarget(Statistic.HIT_POINTS) to it }).toMap(), listOfNotNull(classEntry), choices,
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
