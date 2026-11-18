package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Current authored rules, real package provenance and portable level 1/2 decisions on JVM and JS. */
class CurrentDataSampleTest {
    @Test
    fun samplesResolveCurrentFingerprintsAndRetainAccuratePartialCoverage() = synchronous {
        for (level in 1..2) {
            for (custom in listOf(false, true)) {
                val document = CurrentDataFixtures.sample(level, custom)
                val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
                    ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", document.packages)).value
                for (selection in document.levels.flatMap { it.entries.map { it.selection } } + document.equipment.map { it.selection }) {
                    val resolved = assertIs<ContractResult.Available<ResolvedEntry>>(catalog.resolve(selection)).value
                    assertFalse(resolved.acknowledgmentRequired, selection.entryId)
                }
                val result = RulesEngine.evaluate(document, RulesContent.load(document, catalog))
                assertEquals(4, result.overviewAbilityTotals.getValue(Ability.STRENGTH))
                assertEquals(9, total(result.displayedSkill(Skill.ATHLETICS)))
                assertEquals(7, total(result.displayedSkill(Skill.ENDURANCE)))
                assertEquals(setOf(Skill.SOCIETY, Skill.CRAFTING, Skill.MEDICINE, Skill.RELIGION, Skill.ATHLETICS, Skill.ENDURANCE), result.proficiencies.keys)
                assertTrue(result.diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION })
                assertFalse(result.diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT || it.kind == DiagnosticKind.INVALID_SELECTION }, result.diagnostics.toString())
                // Equipment and vision stay descriptive; the ancestry's authored base speed is its only modifier.
                assertTrue(result.diagnostics.any { it.entryId == "modern4e.ancestry.dwarf" && it.code == "engine.coverage" })
                assertTrue(result.choices.any { it.slot.choiceId == "modern4e.choice.class-attack-at-will" })
                assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
            }
        }
    }

    @Test
    fun missingOverridePreservesSavedDecisionsWithoutSilentFallback() = synchronous {
        val document = CurrentDataFixtures.sample(2, true)
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(CurrentDataFixtures,
            "modern4e.classes", document.packages.filterNot { it.packageId == CurrentDataFixtures.overrideId })).value
        val saved = document.levels.first().entries.first().selection
        assertIs<ContractResult.Unavailable>(catalog.resolve(saved))
        assertTrue(RulesEngine.evaluate(document, RulesContent.load(document, catalog)).diagnostics.any { it.code == "catalog.expectedSupplier" })
        assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
    }

    private fun total(value: ContractResult<CalculatedValue>) = assertIs<ContractResult.Available<CalculatedValue>>(value).value.total
    private fun synchronous(block: suspend () -> Unit) {
        var completed = false
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) { result.getOrThrow(); completed = true }
        })
        assertTrue(completed)
    }
}
