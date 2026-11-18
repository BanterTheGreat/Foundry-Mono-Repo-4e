package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class ProgressionTest {
    @Test fun levelsFollowsAboutInCharacterNavigation() {
        assertEquals(listOf("character", "progression", "stats", "validation"), CharacterTabs)
    }

    @Test fun scheduleMatchesPrintedMilestones() {
        assertEquals(mapOf("At-will" to 2, "Encounter" to 1, "Daily" to 2), Progression.tally(1))
        assertEquals(mapOf("At-will" to 2, "Encounter" to 6, "Daily" to 4, "Utility" to 5), Progression.tally(20))
        assertEquals(mapOf("At-will" to 2, "Encounter" to 7, "Daily" to 4, "Utility" to 7), Progression.tally(30))
        assertEquals(19, (1..30).count { Progression.level(it).feat })
        assertEquals(listOf(9, 15, 19, 23, 25, 29), (1..30).filter { Progression.level(it).replacement != null })
    }

    @Test fun allocationRequiresBudgetAndSingleTradeoff() {
        val base = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.WISDOM to 1))
        assertTrue(Progression.validAllocation(base))
        assertTrue(Progression.validAllocation(base.copy(points = base.points + (Ability.CHARISMA to -1) + (Ability.DEXTERITY to 3))))
        assertFalse(Progression.validAllocation(base.copy(points = base.points + (Ability.DEXTERITY to 3))))
        assertFalse(Progression.validAllocation(base.copy(points = base.points + (Ability.STRENGTH to 3))))
    }
    @Test fun allocationCounterExcludesFixedMainAndSupportsTradeoffs() {
        val base = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4))
        assertEquals(5, Progression.remainingPoints(base))
        assertEquals(0, Progression.remainingPoints(base.copy(points = base.points +
            mapOf(Ability.DEXTERITY to 3, Ability.CONSTITUTION to 2, Ability.WISDOM to 1, Ability.CHARISMA to -1))))
        assertEquals(-1, Progression.remainingPoints(base.copy(points = base.points +
            mapOf(Ability.DEXTERITY to 3, Ability.CONSTITUTION to 3))))
        assertEquals(6, Progression.remainingPoints(base.copy(points = base.points + (Ability.CHARISMA to -1))))
    }

    @Test fun skillLabelsAreCompactAndKeepOtherSources() {
        Ability.entries.forEach { ability ->
            assertEquals(ability.name.readable(), Progression.skillContributorLabel("${ability.name} points"))
        }
        assertNull(Progression.skillContributorLabel("Proficiency"))
        assertEquals("Manual Adjustment", Progression.skillContributorLabel("Manual Adjustment"))
    }
    @Test fun steppersEnforceSinglePairedTradeoff() {
        val base = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2))
        assertFalse(Progression.canAdjustAbility(base, Ability.DEXTERITY, 1))
        assertTrue(Progression.canAdjustAbility(base, Ability.CHARISMA, -1))
        val negative = base.copy(points = base.points + (Ability.CHARISMA to -1))
        assertFalse(Progression.canAdjustAbility(negative, Ability.WISDOM, -1))
        assertTrue(Progression.canAdjustAbility(negative, Ability.DEXTERITY, 1))
        val paired = negative.copy(points = negative.points + (Ability.DEXTERITY to 3))
        assertFalse(Progression.canAdjustAbility(paired, Ability.CONSTITUTION, 1))
        assertFalse(Progression.canAdjustAbility(paired, Ability.CHARISMA, 1))
        assertTrue(Progression.canAdjustAbility(paired, Ability.DEXTERITY, -1))
        assertTrue(Progression.canAdjustAbility(negative, Ability.CHARISMA, 1))
        assertFalse(Progression.canAdjustAbility(paired, Ability.DEXTERITY, 1))
        assertFalse(Progression.canAdjustAbility(negative, Ability.CHARISMA, -1))
        assertFalse(Progression.canAdjustAbility(base, Ability.STRENGTH, -1))
        assertFalse(Progression.canAdjustAbility(base, Ability.STRENGTH, 1))
        assertTrue(Progression.canAdjustAbility(base, Ability.WISDOM, 1))
    }
    @Test fun filledStructuredChoicesReduceRequiredBadgeAndOptionalGrantsDoNotAddRequirements() {
        val slot = ChoiceSlotId("linguist", "language", 0)
        val optional = ChoiceSlotId("feature", "technique", 0)
        val doc = CharacterDocument(id = "badge", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Badge"),
            packages = emptyList(), level = 1, abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.WISDOM to 1)),
            levels = listOf(LevelDecisions(1)))
        val rules = EngineResult(emptyMap(), emptyList(), listOf(EngineChoice(slot, values = listOf(ValueOption("ELVEN", "Elven")), valueKind = FactKind.LANGUAGE)),
            emptyMap(), emptyMap(), emptyList())
        val missing = Progression.missing(BuilderState(doc, rules))
        val filled = doc.copy(levels = listOf(LevelDecisions(1, values = listOf(ValueChoice(slot, "ELVEN")))))
        assertEquals(missing - 1, Progression.missing(BuilderState(filled, rules)))
        assertEquals(missing - 1, Progression.missing(BuilderState(filled, rules.copy(choices = rules.choices + EngineChoice(optional, optional = true)))))
    }

    @Test fun completingRequiredLevelOneChoicesClearsTheBadgeWithoutChoosingATheme() {
        val origins = listOf("ancestry", "class", "feat").map { kind ->
            EntryChoice(kind, ChoiceSlotId("creation", kind, 0), SavedSelection(kind, kind, "proof", "fingerprint"))
        }
        val doc = CharacterDocument(
            id = "badge", savedAt = "2026-11-18T12:00:00Z",
            identity = CharacterIdentity("Badge", environment = "urban", upbringing = "academic"),
            packages = emptyList(), level = 1,
            abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.WISDOM to 1)),
            levels = listOf(LevelDecisions(1, entries = origins)),
        )
        val theme = EngineChoice(ChoiceSlotId("creation", "theme", 0), optional = true)
        val rules = EngineResult(emptyMap(), emptyList(), listOf(theme), emptyMap(), emptyMap(), emptyList())
        val complete = BuilderState(doc, rules)
        assertEquals(0, Progression.missing(complete))
        assertEquals(1, Progression.missing(complete.copy(document = doc.copy(identity = doc.identity.copy(environment = "")))))
    }

}
