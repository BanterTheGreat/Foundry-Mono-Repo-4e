package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** An authored Fighter completes the supported acquisition slice using production definitions only. */
class SharedContentAcceptanceTest {
    @Test
    fun completeLevelOneAndTwoCharactersRetainHonestPartialAutomation() = synchronous {
        for ((level, suffix) in listOf(1 to "", 2 to "", 2 to "-non-combat")) {
            val document = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(
                contractFixtures.getValue("sample-accepted-fighter-$level$suffix.json"))).value
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
                ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", document.packages)).value
            val selected = document.levels.flatMap { row -> row.entries.map { it.selection } } +
                document.equipment.map { it.selection }
            for (selection in selected) {
                assertTrue(selection.entryId.startsWith("modern4e."))
                val resolved = assertIs<ContractResult.Available<ResolvedEntry>>(catalog.resolve(selection)).value
                assertFalse(resolved.acknowledgmentRequired, selection.entryId)
            }
            val result = RulesEngine.evaluate(document, RulesContent.load(document, catalog))
            assertFalse(result.diagnostics.any {
                it.kind == DiagnosticKind.INVALID_SELECTION || it.kind == DiagnosticKind.UNRESOLVED_CONTENT
            }, result.diagnostics.joinToString("\n"))
            assertFalse(result.diagnostics.any { it.code == "engine.missingChoice" })
            assertTrue(result.entryEligibility.isNotEmpty())
            assertTrue(result.entryEligibility.values.all {
                it.status == Eligibility.ELIGIBLE
            }, result.entryEligibility.toString())
            assertTrue(result.diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION && it.code == "engine.coverage" })
            assertEquals(4, result.overviewAbilityTotals.getValue(Ability.STRENGTH))
            assertEquals(22 + 7 * level, total(result, Statistic.HIT_POINTS))
            assertEquals(11, total(result, Statistic.HEALING_SURGES))
            assertEquals(19, total(result, Statistic.FORTITUDE))
            assertEquals(14, total(result, Statistic.REFLEX))
            assertEquals(11, total(result, Statistic.WILL))
            assertEquals(6, result.proficiencies.size)
            assertEquals(level, document.levels.flatMap { it.entries }.count {
                it.slot.choiceId == "feat"
            })
            assertTrue(document.levels.first().entries.any { it.selection.entryId == "modern4e.theme.docker" })
            assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(
                ContractCodec.decode(ContractCodec.encode(document))).value)
        }
    }

    private fun total(result: EngineResult, statistic: Statistic) =
        assertIs<ContractResult.Available<CalculatedValue>>(
            result.statistics.getValue(ModifierTarget(statistic)).value).value.total

    private fun synchronous(block: suspend () -> Unit) {
        var completed = false
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                result.getOrThrow()
                completed = true
            }
        })
        assertTrue(completed)
    }
}
