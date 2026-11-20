package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.languageNames
import dev.modern4e.builder.ui.screens.speedDisplay
import dev.modern4e.builder.ui.screens.sizeDisplay
import dev.modern4e.builder.ui.screens.visionNames
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
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

    private fun ancestry(id: String, size: CreatureSize?): EngineEntry {
        val entry = ContentEntry(id, EntryCategory.ANCESTRY, Presentation(id), Mechanics(version = 2, size = size),
            Coverage(CoverageStatus.SUPPORTED))
        return EngineEntry(id, ChoiceSlotId("creation", "ancestry", 0),
            ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry)), granted = false)
    }

    private fun sizeState(vararg ancestries: EngineEntry): BuilderState {
        val document = CharacterDocument(id = "size", savedAt = "2026-11-19T00:00:00Z",
            identity = CharacterIdentity("Ancestry size", size = "Legacy enormous override"), packages = emptyList(), level = 1,
            abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()))
        return BuilderState(document, rules().copy(entries = ancestries.toList()))
    }

    @Test fun sizeComesFromCurrentAncestryAndIgnoresLegacyIdentityOverride() {
        val medium = sizeState(ancestry("dwarf", CreatureSize.MEDIUM))
        assertEquals("Medium", medium.sizeDisplay())
        val small = medium.copy(rules = medium.rules.copy(entries = listOf(ancestry("halfling", CreatureSize.SMALL))))
        assertEquals("Small", small.sizeDisplay())
        assertEquals("Legacy enormous override", small.document.identity.size)
    }

    @Test fun missingUnknownAndConflictingAncestrySizesNeverUseManualFallback() {
        assertEquals("Size —", sizeState().sizeDisplay())
        assertEquals("Size —", sizeState(ancestry("unknown", null)).sizeDisplay())
        assertEquals("Size —", sizeState(ancestry("medium", CreatureSize.MEDIUM), ancestry("small", CreatureSize.SMALL)).sizeDisplay())
        assertEquals("Size —", sizeState(ancestry("medium", CreatureSize.MEDIUM), ancestry("unknown", null)).sizeDisplay())
        assertEquals("Medium", sizeState(ancestry("first", CreatureSize.MEDIUM), ancestry("second", CreatureSize.MEDIUM)).sizeDisplay())
    }

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

    @Test fun visionListsDistinctAuthoredModesAndIsEmptyWithoutASource() {
        fun withVision(id: String, vision: String): EngineEntry {
            val occurrence = ancestry(id, CreatureSize.MEDIUM)
            val data = buildJsonObject { put("attributes", buildJsonObject { put("vision", vision) }) }
            return occurrence.copy(definition = occurrence.definition.copy(entry = occurrence.definition.entry.copy(sharedData = data)))
        }
        val current = rules().copy(entries = listOf(withVision("one", "LOW_LIGHT"), withVision("two", "Darkvision"),
            withVision("three", "Low-Light"), ancestry("no-vision", null)))
        assertEquals(listOf("Low-Light", "Darkvision"), current.visionNames())
        assertEquals(emptyList<String>(), rules().visionNames())
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
