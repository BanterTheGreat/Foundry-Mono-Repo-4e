package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class SelectionTimeFactsTest {
    private fun entry(id: String, mechanics: Mechanics = Mechanics(version = 2)) =
        ContentEntry(id, EntryCategory.FEAT, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))
    private fun resolved(entry: ContentEntry) = ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry))
    private fun occurrence(entry: ContentEntry, instance: String, slot: ChoiceSlotId, granted: Boolean = false) =
        EngineEntry(instance, slot, resolved(entry), granted)
    private fun decision(entry: EngineEntry) = EntryChoice(entry.instanceId, entry.slot,
        SavedSelection(entry.definition.entry.id, entry.definition.entry.presentation.title, "standard", entry.definition.fingerprint))
    private fun document(vararg rows: LevelDecisions) = CharacterDocument(
        id = "facts", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Facts"), packages = emptyList(), level = 2,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()), levels = rows.toList())

    @Test
    fun equivalentUnselectedCandidatesShareFactsWithinOneEvaluation() {
        val original = document(LevelDecisions(1))
        var preparations = 0
        val facts = SelectionTimeFacts(original, RulesContent(emptyMap(), emptyMap()), emptyList(), emptySet(), emptyMap()) {
            preparations++
            it
        }
        val slot = ChoiceSlotId("advancement.2", "feat", 0)
        val first = facts.forCandidate(entry("first"), slot)
        val second = facts.forCandidate(entry("second"), slot)
        assertSame(first, second)
        assertEquals(1, preparations)
        assertSame(first, facts.forCandidate(entry("first"), slot))
        assertEquals(1, preparations)
        var refreshed = 0
        SelectionTimeFacts(original, RulesContent(emptyMap(), emptyMap()), emptyList(), emptySet(), emptyMap()) {
            refreshed++
            it
        }.forCandidate(entry("first"), slot)
        assertEquals(1, refreshed, "A new evaluation must not retain old facts")
    }

    @Test
    fun exclusionRemovesDependentBenefitsAndDescendantsButRetainsAnotherOccurrence() {
        val candidate = entry("candidate")
        val dependent = entry("dependent", Mechanics(version = 2, prerequisites = listOf(Prerequisite.Entry(candidate.id))))
        val chosen = occurrence(candidate, "chosen", ChoiceSlotId("advancement.2", "feat", 0))
        val earlier = occurrence(candidate, "earlier", ChoiceSlotId("creation", "feat", 0))
        val dependentOccurrence = occurrence(dependent, "dependent", ChoiceSlotId("creation", "theme", 0))
        val descendant = occurrence(entry("child"), "child", ChoiceSlotId("dependent", "child", 0), granted = true)
        val original = document(LevelDecisions(1, listOf(decision(earlier), decision(dependentOccurrence)),
            proficiencies = listOf(ProficiencyChoice(ChoiceSlotId("child", "skill", 0), Skill.ARCANA))),
            LevelDecisions(2, listOf(decision(chosen))))
        val occurrences = listOf(chosen, earlier, dependentOccurrence, descendant)
        val facts = SelectionTimeFacts(original, RulesContent(emptyMap(), emptyMap()), occurrences, emptySet(),
            mapOf(chosen.slot to 2)) { it }
        val snapshot = facts.forCandidate(candidate, chosen.slot)
        assertEquals(listOf("earlier"), snapshot.levels.flatMap { it.entries }.map { it.instanceId })
        assertTrue(snapshot.levels.flatMap { it.proficiencies }.isEmpty())
    }

    @Test
    fun historicalSnapshotDropsLaterChoicesAndTheirReplacementHistory() {
        val candidate = entry("candidate")
        val chosen = occurrence(candidate, "chosen", ChoiceSlotId("creation", "feat", 0))
        val later = occurrence(entry("later"), "later", ChoiceSlotId("advancement.2", "feat", 0))
        val original = document(LevelDecisions(1, listOf(decision(chosen))),
            LevelDecisions(2, listOf(decision(later)), replacements = listOf(
                Replacement(chosen.slot, decision(chosen), ReplacementKind.RETRAINING))))
        val facts = SelectionTimeFacts(original, RulesContent(emptyMap(), emptyMap()), listOf(chosen, later), emptySet(),
            mapOf(chosen.slot to 1)) { it }
        val snapshot = facts.forCandidate(candidate, chosen.slot)
        assertEquals(1, snapshot.level)
        assertEquals(listOf(1), snapshot.levels.map { it.level })
        assertTrue(snapshot.levels.single().entries.isEmpty())
        assertTrue(snapshot.levels.single().replacements.isEmpty())
    }

    @Test
    fun targetedEligibilityMatchesFullProductionEvaluation() = synchronous {
        for (level in 1..2) {
            val document = CurrentDataFixtures.sample(level)
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
                ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", document.packages)).value
            val content = RulesContent.load(document, catalog)
            val full = RulesEngine.evaluate(document, content)
            for (occurrence in full.entries.filter { it.instanceId in full.entryEligibility }) {
                val target = RulesEngine.evaluateChoice(document, content, occurrence.instanceId)
                assertEquals(mapOf(occurrence.instanceId to full.entryEligibility.getValue(occurrence.instanceId)), target.entryEligibility)
                assertEquals(full.diagnostics.filter { it.slot == occurrence.slot && it.entryId == occurrence.definition.entry.id },
                    target.diagnostics.filter { it.slot == occurrence.slot && it.entryId == occurrence.definition.entry.id })
                assertTrue(target.statistics.isEmpty())
                assertTrue(target.choices.isEmpty())
            }
        }
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
