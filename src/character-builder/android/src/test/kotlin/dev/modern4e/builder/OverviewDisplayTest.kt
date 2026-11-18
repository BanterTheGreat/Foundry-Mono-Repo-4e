package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.languageNames
import dev.modern4e.builder.ui.screens.speedDisplay
import org.junit.Assert.assertEquals
import org.junit.Test

class OverviewDisplayTest {
    private val slot = ChoiceSlotId("ancestry", "languages", 0)

    private fun rules(
        facts: List<StructuredFact> = emptyList(),
        choices: List<EngineChoice> = emptyList(),
        speed: StatisticCalculation? = null,
    ) = EngineResult(listOfNotNull(speed?.let { ModifierTarget(Statistic.SPEED) to it }).toMap(), emptyList(), choices,
        emptyMap(), emptyMap(), emptyList(), facts = facts)

    private fun language(value: String, target: String? = null) = StructuredFact(FactKind.LANGUAGE, value, target, slot)

    @Test fun languagesListFixedAndChosenCharacterFactsWithoutDuplicatesOrScopedFacts() {
        val choice = EngineChoice(slot, values = listOf(ValueOption("DEEP_SPEECH", "Deep Speech")), valueKind = FactKind.LANGUAGE)
        val result = rules(
            facts = listOf(language("COMMON"), language("DEEP_SPEECH"), language("COMMON"), language("ELVEN", "some.power"),
                StructuredFact(FactKind.DAMAGE_TYPE, "FIRE", null, slot)),
            choices = listOf(choice))
        assertEquals(listOf("Common", "Deep Speech"), result.languageNames())
    }

    @Test fun noLanguageFactsListNothing() {
        assertEquals(emptyList<String>(), rules().languageNames())
    }

    @Test fun speedShowsTheAncestryBaseAndADashWithoutOne() {
        val available = StatisticCalculation(ContractResult.Available(CalculatedValue(6, listOf(Contributor("Dwarf", 6)))), emptyList())
        assertEquals("6", rules(speed = available).speedDisplay())
        val missing = StatisticCalculation(ContractResult.Unavailable(listOf(Diagnostic("engine.missingBase",
            DiagnosticKind.INCOMPLETE_AUTOMATION, "SPEED has no authored base."))), emptyList())
        assertEquals("—", rules(speed = missing).speedDisplay())
        assertEquals("—", rules().speedDisplay())
    }
}
