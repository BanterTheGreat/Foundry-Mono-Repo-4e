package dev.modern4e.builder

import kotlin.test.*

class AdvancementRulesTest {
    private val main = ChoiceSlotId("class-instance", "main", 0)
    private val definition = ContentEntry("test.class", EntryCategory.CLASS, Presentation("Test class"),
        Mechanics(version = 2, choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH)))),
        Coverage(CoverageStatus.SUPPORTED))
    private val saved = SavedSelection(definition.id, "Test class", "standard", ContractCodec.fingerprint(definition))
    private val resolved = ResolvedEntry(definition, PackageRevision("standard", "1"), ContractCodec.fingerprint(definition))

    private fun document(level: Int, nonMain: Ability = Ability.DEXTERITY): CharacterDocument = CharacterDocument(
        id = "advancement", savedAt = "2026-11-19T12:00:00Z", identity = CharacterIdentity("Progression"),
        packages = emptyList(), level = level,
        abilities = AbilityAllocation(main, Ability.STRENGTH, mapOf(Ability.STRENGTH to 4,
            Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.INTELLIGENCE to 1)),
        levels = (1..level).map { n -> LevelDecisions(n,
            entries = if (n == 1) listOf(EntryChoice("class-instance", ChoiceSlotId("creation", "class", 0), saved)) else emptyList(),
            abilityAdvancements = if (AdvancementRules.choosesNonMainIncrease(n)) listOf(
                AbilityAdvancement(AdvancementRules.abilitySlot(n), mapOf(nonMain to 1))) else emptyList()) })

    private fun evaluate(document: CharacterDocument) = RulesEngine.evaluate(document,
        RulesContent(mapOf(definition.id to ContractResult.Available(resolved)), mapOf(saved to ContractResult.Available(resolved))))
    private fun total(rules: EngineResult, ability: Ability) = assertIs<ContractResult.Available<CalculatedValue>>(rules.ability(ability)).value.total

    @Test
    fun earnedAbilityIncreasesApplyAtTheirMilestonesAndReachSkills() {
        for (level in 1..20) {
            val rules = evaluate(document(level))
            assertEquals(4 + (if (level >= 8) 1 else 0) + (if (level >= 16) 1 else 0) + (if (level >= 20) 1 else 0), total(rules, Ability.STRENGTH), "level $level")
            assertEquals(2 + (if (level >= 4) 1 else 0) + (if (level >= 12) 1 else 0) + (if (level >= 16) 1 else 0), total(rules, Ability.DEXTERITY), "level $level")
            assertEquals(total(rules, Ability.DEXTERITY), assertIs<ContractResult.Available<CalculatedValue>>(rules.skill(Skill.ACROBATICS)).value.total)
            assertFalse(rules.diagnostics.any { it.code == "engine.progressionUnsupported" })
        }
    }

    @Test
    fun invalidAndMissingNonMainChoicesRemainVisibleAndDoNotInventTotals() {
        val invalid = evaluate(document(4, Ability.STRENGTH))
        assertTrue(invalid.diagnostics.any { it.code == "engine.abilityAdvancement" })
        assertIs<ContractResult.Unavailable>(invalid.ability(Ability.STRENGTH))
        assertEquals(4, invalid.overviewAbilityTotals[Ability.STRENGTH])
        val missing = document(12).let { it.copy(levels = it.levels.map { row ->
            if (row.level == 12) row.copy(abilityAdvancements = emptyList()) else row
        }) }
        assertTrue(evaluate(missing).diagnostics.any { it.code == "engine.missingAdvancement" && it.slot == AdvancementRules.abilitySlot(12) })
    }

    @Test
    fun laterAbilityIncreasesCannotQualifyAnEarlierFeat() {
        val feat = ContentEntry("test.feat", EntryCategory.FEAT, Presentation("Dexterity feat"),
            Mechanics(version = 2, prerequisites = listOf(Prerequisite.AbilityPoints(Ability.DEXTERITY, 4))),
            Coverage(CoverageStatus.SUPPORTED))
        val featResolved = ResolvedEntry(feat, PackageRevision("standard", "1"), ContractCodec.fingerprint(feat))
        val featSaved = SavedSelection(feat.id, feat.presentation.title, "standard", featResolved.fingerprint)
        val original = document(19)
        val slot = ChoiceSlotId("advancement.10", "feat", 0)
        val selected = original.copy(levels = original.levels.map { row ->
            if (row.level == 10) row.copy(entries = listOf(EntryChoice("feat-instance", slot, featSaved))) else row
        })
        val result = RulesEngine.evaluate(selected, RulesContent(
            mapOf(definition.id to ContractResult.Available(resolved), feat.id to ContractResult.Available(featResolved)),
            mapOf(saved to ContractResult.Available(resolved), featSaved to ContractResult.Available(featResolved))))
        assertEquals(5, total(result, Ability.DEXTERITY))
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("feat-instance").status)
    }

    @Test
    fun rootsMatchTheLocalTableAndRejectOtherLevelsAndOrdinals() {
        for (level in 2..20) {
            val slot = ChoiceSlotId("advancement.$level", "feat", 0)
            assertEquals(if (AdvancementRules.level(level).feat) EntryCategory.FEAT else null,
                AdvancementRules.rootCategory(level, slot))
            assertNull(AdvancementRules.rootCategory(level, slot.copy(ordinal = 1)))
        }
        assertEquals(EntryCategory.PARAGON_PATH, AdvancementRules.rootCategory(11, ChoiceSlotId("advancement.11", "paragon-path", 0)))
        assertNull(AdvancementRules.rootCategory(12, ChoiceSlotId("advancement.11", "paragon-path", 0)))
    }
}
