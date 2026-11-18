package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.currentPowers
import dev.modern4e.builder.ui.screens.laterPowerSelections
import org.junit.Assert.*
import org.junit.Test

class CurrentPowersTest {
    @Test fun currentPowersIncludeSelectionsAndGrantsFromActiveSources() {
        val ancestry = engineEntry("Ancestry", EntryCategory.ANCESTRY, ChoiceSlotId("creation", "ancestry", 0))
        val classPower = engineEntry("Class Power", EntryCategory.POWER, ChoiceSlotId("class", "attack", 0))
        val grant = engineEntry("Ancestry Power", EntryCategory.POWER, ChoiceSlotId(ancestry.instanceId, "grant", 0), granted = true)
        val blocked = engineEntry("Blocked Power", EntryCategory.POWER, ChoiceSlotId("class", "attack", 1))
        val blockedChild = engineEntry("Blocked Grant", EntryCategory.POWER, ChoiceSlotId(blocked.instanceId, "grant", 0), granted = true)
        val state = state(listOf(LevelDecisions(1)), listOf(ancestry, classPower, grant, blockedChild, blocked),
            mapOf(blocked.instanceId to EntryEligibility(blocked.definition.entry.id, Eligibility.INELIGIBLE, emptyList())))

        val powers = currentPowers(state, null)
        assertEquals(listOf("Ancestry Power", "Class Power"), powers.map { it.title })
        assertEquals("Granted", powers.first().note)
    }

    @Test fun manuallySavedLaterPowersAndReplacementsShowOnceWithTheirStatus() {
        val attack = ChoiceSlotId("class", "attack", 0)
        val slots = listOf(ChoiceSlotId("advancement.3", "power", 0), ChoiceSlotId("advancement.5", "power", 0))
        val later = saved("Later Power", slots[0])
        val unavailable = saved("Missing Power", slots[1])
        val replacement = saved("Replacement", ChoiceSlotId("advancement.9", "replacement", 0))
        val alreadyApplied = saved("Already Replaced", attack)
        val original = engineEntry("Original", EntryCategory.POWER, attack)
        val engineReplacement = engineEntry("Already Replaced", EntryCategory.POWER, attack)
        val levels = listOf(LevelDecisions(1),
            LevelDecisions(3, entries = listOf(later)),
            LevelDecisions(5, entries = listOf(unavailable)),
            LevelDecisions(8, replacements = listOf(Replacement(attack, alreadyApplied, ReplacementKind.PROGRESSION))),
            LevelDecisions(9, replacements = listOf(Replacement(attack, replacement, ReplacementKind.PROGRESSION))))
        val state = state(levels, listOf(engineReplacement))
        assertEquals(setOf(later.selection, replacement.selection, unavailable.selection), laterPowerSelections(state.document))
        assertEquals(listOf("Already Replaced"), currentPowers(state, null).map { it.title })

        val resolved = mapOf(later.selection to entry("Later Power", EntryCategory.POWER),
            replacement.selection to entry("Replacement", EntryCategory.POWER))
        val powers = currentPowers(state, resolved)
        assertEquals(listOf("Later Power", "Missing Power", "Replacement"), powers.map { it.title })
        assertEquals(listOf(attack, slots[0], slots[1]).toSet(), powers.map { it.slot }.toSet())
        assertEquals("Saved · definition unavailable", powers.first { it.title == "Missing Power" }.note)
        assertEquals("Saved · eligibility not evaluated", powers.first { it.title == "Replacement" }.note)
        assertEquals(listOf("Original"), currentPowers(state.copy(rules = state.rules.copy(entries = listOf(original))), null).map { it.title })
    }

    @Test fun olderManualReplacementDoesNotHideANewerEngineReplacement() {
        val slot = ChoiceSlotId("class", "attack", 0)
        val manual = saved("Manual", ChoiceSlotId("advancement.9", "replacement", 0))
        val engine = saved("Engine", slot)
        val levels = listOf(LevelDecisions(1),
            LevelDecisions(9, replacements = listOf(Replacement(slot, manual, ReplacementKind.PROGRESSION))),
            LevelDecisions(15, replacements = listOf(Replacement(slot, engine, ReplacementKind.PROGRESSION))))
        val state = state(levels, listOf(engineEntry("Engine", EntryCategory.POWER, slot)))

        assertEquals(listOf("Engine"), currentPowers(state, mapOf(manual.selection to entry("Manual", EntryCategory.POWER))).map { it.title })
    }

    private fun state(levels: List<LevelDecisions>, entries: List<EngineEntry>,
        eligibility: Map<String, EntryEligibility> = emptyMap()): BuilderState =
        BuilderState(CharacterDocument(id = "character", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Test"),
            packages = emptyList(), level = levels.maxOf { it.level },
            abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()), levels = levels),
            EngineResult(emptyMap(), entries, emptyList(), emptyMap(), emptyMap(), emptyList(), entryEligibility = eligibility))

    private fun entry(title: String, category: EntryCategory) =
        ContentEntry(title, category, Presentation(title), Mechanics(), Coverage(CoverageStatus.SUPPORTED))

    private fun saved(title: String, slot: ChoiceSlotId) =
        EntryChoice(title, slot, SavedSelection(title, title, "test", "fingerprint"))

    private fun engineEntry(title: String, category: EntryCategory, slot: ChoiceSlotId, granted: Boolean = false) =
        EngineEntry(title, slot, ResolvedEntry(entry(title, category), PackageRevision("test", "1"), "fingerprint"), granted)
}
