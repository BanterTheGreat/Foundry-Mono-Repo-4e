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
            assertEquals(20 + level / 2, total(result, Statistic.AC))
            assertEquals(20, total(result, Statistic.FORTITUDE))
            assertEquals(17, total(result, Statistic.REFLEX))
            assertEquals(12, total(result, Statistic.WILL))
            assertEquals(5, total(result, Statistic.SPEED))
            assertEquals(6, result.proficiencies.size)
            assertEquals(level, document.levels.flatMap { it.entries }.count {
                it.slot.choiceId == "feat"
            })
            assertTrue(document.levels.first().entries.any { it.selection.entryId == "modern4e.theme.docker" })
            assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(
                ContractCodec.decode(ContractCodec.encode(document))).value)
        }
    }

    @Test
    fun onlyEquippedArmorAndProficientShieldsContributeToDefenses() = synchronous {
        val document = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(
            contractFixtures.getValue("sample-accepted-fighter-1.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", document.packages)).value
        val scale = document.equipment.single { it.selection.entryId == "modern4e.armor.scale" }
        val shield = document.equipment.single { it.selection.entryId == "modern4e.shield.heavy-shield" }
        val unarmored = document.copy(equipment = listOf(scale.copy(equipped = false), shield.copy(equipped = false)))
        val unarmoredResult = RulesEngine.evaluate(unarmored, RulesContent.load(unarmored, catalog))
        assertEquals(13, total(unarmoredResult, Statistic.AC))
        assertEquals(15, total(unarmoredResult, Statistic.REFLEX))

        val duplicateArmor = document.copy(equipment = listOf(scale, scale.copy(instanceId = "second-armor")))
        val conflicting = RulesEngine.evaluate(duplicateArmor, RulesContent.load(duplicateArmor, catalog))
        assertIs<ContractResult.Unavailable>(conflicting.displayedDefense(Statistic.AC))
        assertIs<ContractResult.Unavailable>(conflicting.displayedDefense(Statistic.REFLEX))
        assertEquals(20, total(conflicting, Statistic.FORTITUDE))

        val content = RulesContent.load(document, catalog)
        val classSelection = document.levels.first().entries.single { it.slot.choiceId == "class" }.selection
        val resolved = assertIs<ContractResult.Available<ResolvedEntry>>(content.selections[classSelection]).value
        val entry = resolved.entry
        val profile = assertNotNull(entry.mechanics.classProfile)
        val untrained = resolved.copy(entry = entry.copy(mechanics = entry.mechanics.copy(classProfile =
            profile.copy(proficiencies = profile.proficiencies + mapOf("armor" to emptyList(), "shields" to emptyList())))))
        val untrainedResult = RulesEngine.evaluate(document, content.copy(
            selections = content.selections + (classSelection to ContractResult.Available(untrained)),
        ))
        assertEquals(18, total(untrainedResult, Statistic.AC))
        assertEquals(13, total(untrainedResult, Statistic.REFLEX))
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
