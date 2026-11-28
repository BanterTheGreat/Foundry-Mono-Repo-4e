package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** The engine offers the advancement schedule's root slots beside the inner offers, with deferred listings. */
class RootSlotOffersTest {
    private fun entry(category: EntryCategory) = SlotCategory.Entry(category)

    @Test
    fun scheduleCoversThirtyLevelsAndEnforcesOnlyThroughTwenty() {
        val schedule = AdvancementRules.schedule
        assertEquals((1..30).toList(), schedule.map { it.level })
        assertEquals((1..20).toList(), AdvancementRules.enforced.map { it.level })
        assertTrue(schedule.filter { it.level >= 21 }.all { it.previewOnly })
        assertTrue(schedule.filter { it.level <= 20 }.none { it.previewOnly })
        val enforced = AdvancementRules.enforced
        assertEquals(listOf(1, 2, 4, 6, 8, 10, 11, 12, 14, 16, 17, 18, 20), enforced.filter { it.feat }.map { it.level })
        assertEquals(listOf(8, 14, 28), schedule.filter { it.abilityIncrease == AbilityIncreaseKind.CHOOSE_TWO }.map { it.level })
        assertEquals(listOf(21), schedule.filter { it.abilityIncrease == AbilityIncreaseKind.ALL }.map { it.level })
        assertEquals(listOf(9, 15, 19), enforced.filter { it.replacement == ReplacementUsage.DAILY }.map { it.level })
        assertEquals(listOf(11), enforced.filter { it.pathSelection == EntryCategory.PARAGON_PATH }.map { it.level })
        val first = AdvancementRules.level(1).powers.map { it.kind }
        assertEquals(listOf(ScheduledPowerKind.AT_WILL, ScheduledPowerKind.AT_WILL, ScheduledPowerKind.ENCOUNTER,
            ScheduledPowerKind.DAILY, ScheduledPowerKind.DAILY), first)
        assertEquals(listOf(ScheduledPower(ScheduledPowerKind.ENCOUNTER, EntryCategory.PARAGON_PATH)), AdvancementRules.level(11).powers)
        assertEquals(listOf(ScheduledPower(ScheduledPowerKind.UTILITY), ScheduledPower(ScheduledPowerKind.ENCOUNTER)),
            AdvancementRules.level(17).powers)
        assertEquals(ScheduledFeatures(EntryCategory.PARAGON_PATH, several = true), AdvancementRules.level(11).features)
        assertEquals(ScheduledFeatures(EntryCategory.PARAGON_PATH), AdvancementRules.level(16).features)
        assertEquals(ReplacementUsage.ENCOUNTER, AdvancementRules.level(23).replacement)
        assertNull(AdvancementRules.level(24).abilityIncrease)
        assertEquals(EntryCategory.EPIC_DESTINY, AdvancementRules.level(21).pathSelection)
        assertEquals(listOf(ScheduledPower(ScheduledPowerKind.UTILITY, EntryCategory.EPIC_DESTINY)), AdvancementRules.level(26).powers)
        assertEquals(listOf(21, 24, 30), schedule.filter { it.features?.source == EntryCategory.EPIC_DESTINY }.map { it.level })
        // Level 20 is real: a Paragon-path daily granted by the path, and a feat slot.
        assertEquals(listOf(ScheduledPower(ScheduledPowerKind.DAILY, EntryCategory.PARAGON_PATH)), AdvancementRules.level(20).powers)
        assertEquals(listOf(AdvancementRules.rootSlot(20, EntryCategory.FEAT)), AdvancementRules.rootSlots(20).map { it.slot })
        assertEquals(ChoiceSlotId("advancement.20", "feat", 0), AdvancementRules.rootSlot(20, EntryCategory.FEAT))
        assertNull(AdvancementRules.level(20).replacement)
        assertFalse(AdvancementRules.replacesDailyAttack(20))
        assertFalse(AdvancementRules.choosesAbilityIncrease(20))
        // Later levels open only ability and Skill Point choices.
        for (level in 21..30) {
            assertEquals(listOfNotNull(AdvancementRules.abilitySlot(28).takeIf { level == 28 },
                SkillAdvancement.slot(level).takeIf { level in listOf(21, 24, 28) }),
                AdvancementRules.rootSlots(level).map { it.slot })
            assertEquals(level == 28, AdvancementRules.choosesAbilityIncrease(level))
        }
        assertFailsWith<IllegalArgumentException> { AdvancementRules.level(31) }
    }

    @Test
    fun freshLevelOneCharacterReportsExactlyItsMissingRootSlots() {
        val document = CharacterDocument(id = "fresh", savedAt = "2026-11-20T12:00:00Z", identity = CharacterIdentity("Fresh"),
            packages = emptyList(), level = 1,
            abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()),
            levels = listOf(LevelDecisions(1)))
        val rules = RulesEngine.evaluate(document, RulesContent(emptyMap(), emptyMap()))
        val roots = rules.choices.filter { it.listing == SlotListing.DEFERRED }
        assertEquals(listOf(ChoiceSlotId("creation", "class", 0), ChoiceSlotId("creation", "ancestry", 0),
            ChoiceSlotId("creation", "theme", 0), ChoiceSlotId("creation", "feat", 0)), roots.map { it.slot })
        assertEquals(listOf(entry(EntryCategory.CLASS), entry(EntryCategory.ANCESTRY), entry(EntryCategory.THEME),
            entry(EntryCategory.FEAT)), roots.map { it.category })
        assertTrue(roots.all { it.missing && it.acquisitionLevel == 1 && it.entries.isEmpty() })
        val missing = rules.diagnostics.filter { it.code == "engine.missingRootChoice" }
        assertEquals(roots.map { it.slot }, missing.map { it.slot })
        assertTrue(missing.all { it.kind == DiagnosticKind.INVALID_SELECTION })
        assertEquals("Choose a Theme.", missing.single { it.slot?.choiceId == "theme" }.message)
        assertEquals("Select an entry for this starting or advancement slot.", missing.first().message)
    }

    @Test
    fun levelNineteenFixtureOffersEveryRootSlotDeferredAndFilled() = synchronous {
        val fixture = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(contractFixtures.getValue("sample-regression-fighter-19.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", fixture.packages)).value
        val state = BuilderOperations(catalog).evaluate(fixture)
        val roots = state.rules.choices.filter { it.listing == SlotListing.DEFERRED }
        val feat = entry(EntryCategory.FEAT)
        val expected = listOf(
            ChoiceSlotId("creation", "class", 0) to (1 to entry(EntryCategory.CLASS)),
            ChoiceSlotId("creation", "ancestry", 0) to (1 to entry(EntryCategory.ANCESTRY)),
            ChoiceSlotId("creation", "theme", 0) to (1 to entry(EntryCategory.THEME)),
            ChoiceSlotId("creation", "feat", 0) to (1 to feat),
            ChoiceSlotId("advancement.2", "feat", 0) to (2 to feat),
            SkillAdvancement.slot(4) to (4 to SlotCategory.SkillIncrease),
            ChoiceSlotId("advancement.4", "feat", 0) to (4 to feat),
            ChoiceSlotId("advancement.6", "feat", 0) to (6 to feat),
            ChoiceSlotId("advancement.8", "ability", 0) to (8 to SlotCategory.AbilityIncrease),
            SkillAdvancement.slot(8) to (8 to SlotCategory.SkillIncrease),
            ChoiceSlotId("advancement.8", "feat", 0) to (8 to feat),
            ChoiceSlotId("advancement.9", "replacement", 0) to (9 to SlotCategory.Replacement(ReplacementUsage.DAILY)),
            ChoiceSlotId("advancement.10", "feat", 0) to (10 to feat),
            SkillAdvancement.slot(11) to (11 to SlotCategory.SkillIncrease),
            ChoiceSlotId("advancement.11", "feat", 0) to (11 to feat),
            ChoiceSlotId("advancement.11", "paragon-path", 0) to (11 to entry(EntryCategory.PARAGON_PATH)),
            ChoiceSlotId("advancement.12", "feat", 0) to (12 to feat),
            ChoiceSlotId("advancement.14", "ability", 0) to (14 to SlotCategory.AbilityIncrease),
            SkillAdvancement.slot(14) to (14 to SlotCategory.SkillIncrease),
            ChoiceSlotId("advancement.14", "feat", 0) to (14 to feat),
            ChoiceSlotId("advancement.15", "replacement", 0) to (15 to SlotCategory.Replacement(ReplacementUsage.DAILY)),
            ChoiceSlotId("advancement.16", "feat", 0) to (16 to feat),
            ChoiceSlotId("advancement.17", "feat", 0) to (17 to feat),
            SkillAdvancement.slot(18) to (18 to SlotCategory.SkillIncrease),
            ChoiceSlotId("advancement.18", "feat", 0) to (18 to feat),
            ChoiceSlotId("advancement.19", "replacement", 0) to (19 to SlotCategory.Replacement(ReplacementUsage.DAILY)),
        )
        assertEquals(expected, roots.map { it.slot to (it.acquisitionLevel to it.category) })
        assertTrue(roots.all { it.required && it.filled && !it.optional })
        // Deferred listings are never evaluated: candidates come from BuilderOptionListing on request.
        assertTrue(roots.all { it.entries.isEmpty() && it.skills.isEmpty() && it.values.isEmpty() && it.abilities.isEmpty() })
        assertTrue(state.rules.choices.filter { it.listing == SlotListing.INLINE }.all { it.category == null })
        assertFalse(state.rules.diagnostics.any { it.code == "engine.missingRootChoice" })
        // Removing a decision leaves its offer in place, unfilled, with its diagnostic.
        val withoutPath = fixture.copy(levels = fixture.levels.map { row ->
            row.copy(entries = row.entries.filterNot { it.slot == ChoiceSlotId("advancement.11", "paragon-path", 0) },
                replacements = if (row.level == 15) emptyList() else row.replacements)
        })
        val reduced = BuilderOperations(catalog).evaluate(withoutPath).rules
        assertEquals(listOf(ChoiceSlotId("advancement.11", "paragon-path", 0), ChoiceSlotId("advancement.15", "replacement", 0)),
            reduced.choices.filter { it.missing }.map { it.slot })
        assertEquals(listOf("Select an entry for this starting or advancement slot.", "Replace an earlier class daily attack power."),
            reduced.diagnostics.filter { it.code == "engine.missingRootChoice" }.map { it.message })
    }

    @Test
    fun abilityOfferRequiresAValidPairAndEpicProgressionOffersOnlyAbilityAndSkillAdvancement() {
        val main = ChoiceSlotId("class", "main", 0)
        fun document(level: Int, increases: Map<Ability, Int>) = CharacterDocument(id = "increase", savedAt = "2026-11-20T12:00:00Z",
            identity = CharacterIdentity("Increase"), packages = emptyList(), level = level,
            abilities = AbilityAllocation(main, Ability.STRENGTH, emptyMap()),
            levels = listOf(LevelDecisions(8, abilityAdvancements = listOf(
                AbilityAdvancement(AdvancementRules.abilitySlot(8), increases)))))
        fun offer(rules: EngineResult) = rules.choices.single { it.slot == AdvancementRules.abilitySlot(8) }
        val content = RulesContent(emptyMap(), emptyMap())
        val pair = mapOf(Ability.STRENGTH to 1, Ability.WISDOM to 1)
        assertTrue(offer(RulesEngine.evaluate(document(8, pair), content)).filled)
        assertFalse(offer(RulesEngine.evaluate(document(8, mapOf(Ability.STRENGTH to 2)), content)).filled)
        val epic = RulesEngine.evaluate(document(30, pair), content)
        assertEquals(listOf(SkillAdvancement.slot(21), SkillAdvancement.slot(24), AdvancementRules.abilitySlot(28),
            SkillAdvancement.slot(28)),
            epic.choices.filter { (it.acquisitionLevel ?: 0) > 20 }.map { it.slot })
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
