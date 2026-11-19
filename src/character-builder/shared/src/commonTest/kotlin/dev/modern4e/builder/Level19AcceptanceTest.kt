package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Exercises later progression against the packages shipped to both platforms. */
class Level19AcceptanceTest {
    @Test
    fun productionPathGrantsArriveAtElevenTwelveAndSixteen() = synchronous {
        val initial = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(
            contractFixtures.getValue("sample-accepted-fighter-2.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", initial.packages)).value.readSession()
        val operations = BuilderOperations(catalog)
        var state = operations.apply(initial, BuilderEdit.Level(11)).state
        val pathSlot = ChoiceSlotId("advancement.11", "paragon-path", 0)
        state = operations.apply(state.document, BuilderEdit.Entry(11, pathSlot,
            "modern4e.path.notorious-celebrity", "celebrity")).also {
            assertTrue(it.applied, it.diagnostics.toString())
        }.state
        fun owns(id: String) = state.rules.entries.any { it.definition.entry.id == id && it.granted }
        assertTrue(owns("modern4e.power.path-one-upmanship"))
        assertFalse(owns("modern4e.power.path-summon-audience"))
        assertFalse(owns("modern4e.feature.notorious-celebrity-crowd-effect"))
        val early = operations.apply(state.document, BuilderEdit.Entry(10, pathSlot,
            "modern4e.path.notorious-celebrity", "celebrity"))
        assertFalse(early.applied)
        state = operations.apply(state.document, BuilderEdit.Level(12)).state
        assertTrue(owns("modern4e.power.path-summon-audience"))
        assertFalse(owns("modern4e.feature.notorious-celebrity-crowd-effect"))
        state = operations.apply(state.document, BuilderEdit.Level(19)).state
        assertTrue(owns("modern4e.feature.notorious-celebrity-crowd-effect"))
        assertFalse(owns("modern4e.power.path-shock-and-awe"))
        assertTrue(state.rules.diagnostics.any { it.code == "engine.coverage" &&
            it.entryId == "modern4e.path.notorious-celebrity" })
    }

    @Test
    fun productionFighterAdvancesReplacesAndReopensAtNineteen() = synchronous {
        val initial = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(
            contractFixtures.getValue("sample-accepted-fighter-2.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", initial.packages)).value.readSession()
        val operations = BuilderOperations(catalog)
        var state = operations.apply(initial, BuilderEdit.Level(19)).also { assertTrue(it.applied) }.state
        state = operations.apply(state.document, BuilderEdit.Batch(listOf(
            BuilderEdit.Advancement(4, AbilityAdvancement(AdvancementRules.abilitySlot(4), mapOf(Ability.CONSTITUTION to 1))),
            BuilderEdit.Advancement(12, AbilityAdvancement(AdvancementRules.abilitySlot(12), mapOf(Ability.DEXTERITY to 1))),
        ))).also { assertTrue(it.applied, it.diagnostics.toString()) }.state
        assertEquals(6, state.rules.overviewAbilityTotals.getValue(Ability.STRENGTH))
        assertEquals(4, state.rules.overviewAbilityTotals.getValue(Ability.CONSTITUTION))
        assertEquals(4, state.rules.overviewAbilityTotals.getValue(Ability.DEXTERITY))
        assertFalse(state.rules.diagnostics.any { it.code == "engine.progressionUnsupported" })

        val powers = catalog.search(category = EntryCategory.POWER, classIds = initial.classEntryIds())
            .mapNotNull { (catalog.lookup(it.metadata.id) as? ContractResult.Available)?.value }
        val encounter = powers.first { it.entry.mechanics.powerProfile?.let { profile ->
            profile.level == 17 && profile.usage == "ENCOUNTER"
        } == true }
        val encounterSlot = state.rules.choices.first { choice ->
            choice.acquisitionLevel == 17 && choice.entries.any { it.entryId == encounter.entry.id }
        }.slot
        state = operations.apply(state.document, BuilderEdit.Entry(17, encounterSlot, encounter.entry.id, "level17-encounter"))
            .also { assertTrue(it.applied, it.diagnostics.toString()) }.state

        val daily = powers.first { it.entry.mechanics.powerProfile?.let { profile ->
            profile.level == 19 && profile.usage == "DAILY"
        } == true }
        val target = state.rules.entries.first { occurrence ->
            !occurrence.granted && occurrence.definition.entry.mechanics.powerProfile?.usage == "DAILY"
        }
        val wrongLevel = operations.apply(state.document,
            BuilderEdit.ReplacePower(18, target.slot, daily.entry.id, ReplacementKind.PROGRESSION))
        assertFalse(wrongLevel.applied)
        assertEquals(state.document, wrongLevel.state.document)
        state = operations.apply(state.document,
            BuilderEdit.ReplacePower(19, target.slot, daily.entry.id, ReplacementKind.PROGRESSION))
            .also { assertTrue(it.applied, it.diagnostics.toString()) }.state
        assertEquals(target.instanceId, state.rules.entries.single { it.slot == target.slot }.instanceId)
        assertEquals(daily.entry.id, state.rules.entries.single { it.slot == target.slot }.definition.entry.id)

        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(state.document))).value
        val reevaluated = operations.evaluate(reopened)
        assertEquals(state.document, reopened)
        assertEquals(state.rules.overviewAbilityTotals, reevaluated.rules.overviewAbilityTotals)
        assertEquals(daily.entry.id, reevaluated.rules.entries.single { it.slot == target.slot }.definition.entry.id)
        val lowered = operations.apply(reopened, BuilderEdit.Level(10)).also { assertTrue(it.applied) }.state
        assertTrue(lowered.document.levels.all { it.level <= 10 })
        assertEquals(target.definition.entry.id, lowered.rules.entries.single { it.slot == target.slot }.definition.entry.id)
        assertEquals(5, lowered.rules.overviewAbilityTotals.getValue(Ability.STRENGTH))
        assertEquals(3, lowered.rules.overviewAbilityTotals.getValue(Ability.CONSTITUTION))
    }

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
