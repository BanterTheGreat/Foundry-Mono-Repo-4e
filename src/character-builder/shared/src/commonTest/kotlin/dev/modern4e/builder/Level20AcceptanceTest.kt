package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Exercises the last Paragon level against the packages shipped to both platforms. */
class Level20AcceptanceTest {
    private val featSlot = ChoiceSlotId("advancement.20", "feat", 0)
    private val pathSlot = ChoiceSlotId("advancement.11", "paragon-path", 0)
    private val dailyId = "modern4e.power.path-shock-and-awe"

    private class Fixture(val catalog: ContentCatalog, val operations: BuilderOperations, val initial: CharacterDocument) {
        suspend fun at(level: Int, from: CharacterDocument = initial) =
            operations.apply(from, BuilderEdit.Level(level)).also { assertTrue(it.applied, it.diagnostics.toString()) }.state
    }

    private suspend fun fixture(): Fixture {
        val initial = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(
            contractFixtures.getValue("sample-accepted-fighter-2.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", initial.packages)).value.readSession()
        return Fixture(catalog, BuilderOperations(catalog), initial)
    }

    /** The level-19 character with the Notorious Celebrity path chosen at 11 and both ability pairs chosen. */
    private suspend fun Fixture.pathCharacter(level: Int = 19): BuilderState {
        var state = at(11)
        state = operations.apply(state.document, BuilderEdit.Entry(11, pathSlot,
            "modern4e.path.notorious-celebrity", "celebrity")).also { assertTrue(it.applied, it.diagnostics.toString()) }.state
        state = operations.apply(state.document, BuilderEdit.Batch(listOf(
            BuilderEdit.Advancement(8, AbilityAdvancement(AdvancementRules.abilitySlot(8), mapOf(Ability.STRENGTH to 1, Ability.CONSTITUTION to 1))),
            BuilderEdit.Advancement(14, AbilityAdvancement(AdvancementRules.abilitySlot(14), mapOf(Ability.STRENGTH to 1, Ability.DEXTERITY to 1))),
        ))).also { assertTrue(it.applied, it.diagnostics.toString()) }.state
        return at(level, state.document)
    }

    private fun BuilderState.owns(id: String) = rules.entries.any { it.definition.entry.id == id && it.granted }
    private fun BuilderState.strength() = rules.overviewAbilityTotals.getValue(Ability.STRENGTH)

    @Test
    fun levelTwentyEvaluatesWithoutTheUnsupportedProgressionDiagnostic() = synchronous {
        val state = fixture().at(20)
        assertEquals(20, state.document.level)
        assertFalse(state.rules.diagnostics.any { it.code == "engine.progressionUnsupported" })
        assertFalse(state.rules.diagnostics.any { it.message.contains("after level") })
    }

    @Test
    fun levelTwentyOffersARequiredFeatSlotAndReportsItWhileEmpty() = synchronous {
        val fixture = fixture()
        val state = fixture.at(20)
        val offer = state.rules.choices.single { it.slot == featSlot }
        assertEquals(20, offer.acquisitionLevel)
        assertEquals(SlotCategory.Entry(EntryCategory.FEAT), offer.category)
        assertEquals(SlotListing.DEFERRED, offer.listing)
        assertTrue(offer.required && offer.missing && !offer.filled)
        val missing = state.rules.diagnostics.filter { it.code == "engine.missingRootChoice" && it.slot == featSlot }
        assertEquals(1, missing.size)
        assertEquals(DiagnosticKind.INVALID_SELECTION, missing.single().kind)
        // Level 20 opens no other root slot: no ability choice, replacement or path pick.
        assertEquals(listOf(featSlot), AdvancementRules.rootSlots(20).map { it.slot })
        assertTrue(state.rules.choices.none { it.acquisitionLevel == 20 && it.slot != featSlot && it.listing == SlotListing.DEFERRED })
        // Nothing offered at 19 exists at 20 for the same slot.
        assertTrue(fixture.at(19).rules.choices.none { it.slot == featSlot })
    }

    @Test
    fun levelTwentyFeatFillsTheSlotAndEpicFeatsAreNotYetEligible() = synchronous {
        val fixture = fixture()
        val state = fixture.at(20)
        val feats = fixture.catalog.search(category = EntryCategory.FEAT)
        assertTrue(feats.isNotEmpty())
        var filled: BuilderState? = null
        var chosen: ContentEntry? = null
        for (candidate in feats) {
            val entry = (fixture.catalog.lookup(candidate.metadata.id) as? ContractResult.Available)?.value?.entry ?: continue
            val result = fixture.operations.apply(state.document, BuilderEdit.Entry(20, featSlot, entry.id, "level20-feat"))
            if (result.applied) {
                filled = result.state
                chosen = entry
                break
            }
        }
        val after = assertNotNull(filled, "some feat is eligible at level 20")
        assertTrue(after.rules.choices.single { it.slot == featSlot }.filled)
        assertFalse(after.rules.diagnostics.any { it.code == "engine.missingRootChoice" && it.slot == featSlot })
        assertTrue(after.rules.entries.any { it.slot == featSlot && it.definition.entry.id == chosen!!.id })

        // Epic-tier feats (level 21 requirement) are rejected at 20; level 21 itself stays preview-only.
        val epic = feats.mapNotNull { (fixture.catalog.lookup(it.metadata.id) as? ContractResult.Available)?.value?.entry }
            .filter { entry -> entry.mechanics.prerequisites.any { it.requiresLevelAtLeast(21) } }
        for (entry in epic) {
            val result = fixture.operations.apply(state.document, BuilderEdit.Entry(20, featSlot, entry.id, "epic-feat"))
            assertFalse(result.applied, "${entry.id} needs level 21")
        }
    }

    @Test
    fun levelTwentyKeepsThePairsAndLevelTwentyOneRaisesEveryAbility() = synchronous {
        val fixture = fixture()
        val nineteen = fixture.pathCharacter(19)
        val twenty = fixture.at(20, nineteen.document)
        val twentyOne = fixture.at(21, twenty.document)
        assertEquals(6, nineteen.strength())
        assertEquals(nineteen.rules.overviewAbilityTotals, twenty.rules.overviewAbilityTotals)
        for (ability in Ability.entries) {
            assertEquals(twenty.rules.overviewAbilityTotals.getValue(ability) + 1,
                twentyOne.rules.overviewAbilityTotals.getValue(ability), ability.name)
        }
    }

    @Test
    fun levelTwentyOffersNoAbilityChoiceReplacementOrFeatSkippingEdits() = synchronous {
        val fixture = fixture()
        val state = fixture.pathCharacter(20)
        val ability = fixture.operations.apply(state.document, BuilderEdit.Advancement(20,
            AbilityAdvancement(AdvancementRules.abilitySlot(20), mapOf(Ability.WISDOM to 1))))
        assertFalse(ability.applied)
        assertEquals(state.document, ability.state.document)
        assertEquals(6, state.strength())
        val daily = state.rules.entries.first { !it.granted && it.definition.entry.mechanics.powerProfile?.usage == "DAILY" }
        val replacement = fixture.operations.apply(state.document,
            BuilderEdit.ReplacePower(20, daily.slot, daily.definition.entry.id, ReplacementKind.PROGRESSION))
        assertFalse(replacement.applied)
        assertEquals(state.document, replacement.state.document)
        assertTrue(replacement.diagnostics.any { it.message.contains("levels 9, 15 and 19") }, replacement.diagnostics.toString())
        assertFalse(AdvancementRules.replacesDailyAttack(20))
    }

    @Test
    fun zeitgeistPathDailyJoinsThePowersAtTwentyButNotAtNineteen() = synchronous {
        val fixture = fixture()
        val nineteen = fixture.pathCharacter(19)
        assertFalse(nineteen.owns(dailyId))
        assertEquals(20, fixture.catalog.upcomingGrants(nineteen).associate { it.occurrence.definition.entry.id to it.level }[dailyId])
        val twenty = fixture.at(20, nineteen.document)
        assertTrue(twenty.owns(dailyId))
        val power = twenty.rules.entries.single { it.definition.entry.id == dailyId }
        assertEquals(EntryCategory.POWER, power.definition.entry.category)
        // The grant arrives from the path, not from a class pool or a decision of the character.
        assertTrue(twenty.document.levels.flatMap { it.entries }.none { it.selection.entryId == dailyId })
        assertFalse(twenty.rules.entries.any { it.definition.entry.id == dailyId && !it.granted })
        assertEquals(0, fixture.catalog.upcomingGrants(twenty).count { it.occurrence.definition.entry.id == dailyId })
    }

    @Test
    fun levelTwentyOneIncreasesAbilitiesWhileOtherEpicProgressionStaysPreviewOnly() = synchronous {
        val fixture = fixture()
        assertEquals(20, AdvancementRules.LAST_ENFORCED_LEVEL)
        assertTrue(AdvancementRules.level(21).previewOnly)
        assertFalse(AdvancementRules.level(20).previewOnly)
        assertTrue(AdvancementRules.rootSlots(21).isEmpty())
        val state = fixture.pathCharacter(20).let { fixture.at(21, it.document) }
        val unsupported = state.rules.diagnostics.single { it.code == "engine.progressionUnsupported" }
        assertEquals(DiagnosticKind.INCOMPLETE_AUTOMATION, unsupported.kind)
        assertEquals("Epic feats, powers and destinies remain unavailable.", unsupported.message)
        // The all-ability increase is automatic and level 21 opens no decision slots.
        assertTrue(state.rules.choices.none { it.acquisitionLevel == 21 })
        assertEquals(7, state.strength())
        assertTrue(state.owns(dailyId))
        // Direct creation covers 1..20 and nothing beyond.
        assertFailsWith<IllegalArgumentException> {
            fixture.operations.create("c", "2026-11-20T12:00:00Z", fixture.initial.identity, fixture.initial.packages,
                fixture.initial.abilities, 21)
        }
        assertEquals(20, fixture.operations.create("c", "2026-11-20T12:00:00Z", fixture.initial.identity,
            fixture.initial.packages, fixture.initial.abilities, 20).document.level)
    }

    @Test
    fun levelTwentyDocumentSavesAndReopensUnchanged() = synchronous {
        val fixture = fixture()
        var state = fixture.pathCharacter(20)
        val feat = fixture.catalog.search(category = EntryCategory.FEAT).firstNotNullOf { candidate ->
            val entry = (fixture.catalog.lookup(candidate.metadata.id) as? ContractResult.Available)?.value?.entry
                ?: return@firstNotNullOf null
            fixture.operations.apply(state.document, BuilderEdit.Entry(20, featSlot, entry.id, "level20-feat"))
                .takeIf { it.applied }?.let { entry }
        }
        state = fixture.operations.apply(state.document, BuilderEdit.Entry(20, featSlot, feat.id, "level20-feat"))
            .also { assertTrue(it.applied, it.diagnostics.toString()) }.state
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(state.document))).value
        assertEquals(state.document, reopened)
        assertEquals(20, reopened.level)
        val reevaluated = fixture.operations.evaluate(reopened)
        assertEquals(state.rules.overviewAbilityTotals, reevaluated.rules.overviewAbilityTotals)
        assertTrue(reevaluated.owns(dailyId))
        assertTrue(reevaluated.rules.choices.single { it.slot == featSlot }.filled)
        assertFalse(reevaluated.rules.diagnostics.any { it.code == "engine.progressionUnsupported" })
        assertFalse(reevaluated.rules.diagnostics.any { it.code == "engine.missingRootChoice" && it.slot == featSlot })
    }

    @Test
    fun loweringTwentyToNineteenDropsLevelTwentyEffectsButKeepsTheChoicesUpcoming() = synchronous {
        val fixture = fixture()
        val twenty = fixture.pathCharacter(20)
        val feat = fixture.catalog.search(category = EntryCategory.FEAT).firstNotNullOf { candidate ->
            val entry = (fixture.catalog.lookup(candidate.metadata.id) as? ContractResult.Available)?.value?.entry
                ?: return@firstNotNullOf null
            fixture.operations.apply(twenty.document, BuilderEdit.Entry(20, featSlot, entry.id, "level20-feat"))
                .takeIf { it.applied }?.let { entry }
        }
        val filled = fixture.operations.apply(twenty.document, BuilderEdit.Entry(20, featSlot, feat.id, "level20-feat"))
            .also { assertTrue(it.applied, it.diagnostics.toString()) }.state
        assertTrue(filled.owns(dailyId))
        assertEquals(6, filled.strength())

        val lowered = fixture.at(19, filled.document)
        assertEquals(filled.document.levels, lowered.document.levels, "choices are kept for the way back up")
        assertEquals(feat.id, lowered.document.levels.single { it.level == 20 }.entries.single { it.slot == featSlot }.selection.entryId)
        assertFalse(lowered.owns(dailyId))
        assertEquals(6, lowered.strength())
        assertTrue(lowered.rules.choices.none { it.slot == featSlot }, "level 20 slot is no longer offered")
        assertTrue(lowered.rules.entries.none { it.slot == featSlot })
        assertFalse(lowered.rules.diagnostics.any { it.slot == featSlot })
        assertEquals(20, fixture.catalog.upcomingGrants(lowered).associate { it.occurrence.definition.entry.id to it.level }[dailyId])

        // Raising again restores the same effects from the retained decisions.
        val raised = fixture.at(20, lowered.document)
        assertEquals(filled.document.levels, raised.document.levels)
        assertTrue(raised.owns(dailyId))
        assertEquals(6, raised.strength())
        assertTrue(raised.rules.choices.single { it.slot == featSlot }.filled)
    }

    @Test
    fun levelTwentyWithoutAPathStillOffersTheFeatAndGrantsNoPathDaily() = synchronous {
        val fixture = fixture()
        val state = fixture.at(20)
        assertFalse(state.owns(dailyId))
        assertTrue(state.rules.choices.single { it.slot == featSlot }.missing)
        assertTrue(state.rules.choices.single { it.slot == pathSlot }.missing)
        assertEquals(4, state.strength(), "base Strength with both ability pairs still unchosen")
    }

    private fun Prerequisite.requiresLevelAtLeast(level: Int): Boolean = when (this) {
        is Prerequisite.Level -> minimum >= level
        is Prerequisite.AllOf -> conditions.any { it.requiresLevelAtLeast(level) }
        is Prerequisite.AnyOf -> conditions.isNotEmpty() && conditions.all { it.requiresLevelAtLeast(level) }
        else -> false
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
