package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/**
 * Candidate checks against the production catalog at level 19: the content shared across a listing's candidates must
 * equal full per-candidate preparation, and neither sharing nor releasing it may change a result.
 */
class CandidateContentTest {
    private val slot = ChoiceSlotId("advancement.18", "feat", 0)
    private val groups = listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL)

    private suspend fun fixture(): Pair<ContentCatalog, CharacterDocument> {
        val initial = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(
            contractFixtures.getValue("sample-accepted-fighter-2.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", initial.packages)).value
        val document = BuilderOperations(catalog).apply(initial, BuilderEdit.Level(19)).also { assertTrue(it.applied) }.state.document
        return catalog to document
    }

    /** A picker over one read session; [prepared] records every document prepared in full, [withExtend] enables baseline sharing. */
    private class Picker(catalog: ContentCatalog, val document: CharacterDocument, withExtend: Boolean) {
        val reading = catalog.readSession()
        val preparation = RulesContentPreparation(reading)
        val prepared = mutableListOf<CharacterDocument>()
        val choices = ChoiceEvaluation(reading, { BuilderState(it, RulesEngine.evaluate(it, preparation.load(it))) },
            { prepared += it; preparation.load(it) },
            extend = if (withExtend) { baseline, candidate, selection -> preparation.extend(baseline, candidate, selection) } else null)
        val listing = BuilderOptionListing(choices, document, 18, ChoiceSlotId("advancement.18", "feat", 0), reading, null, null,
            document.ancestryEntryIds())
    }

    private fun candidateDocument(document: CharacterDocument, level: Int, slot: ChoiceSlotId, selection: SavedSelection): CharacterDocument {
        val levels = if (document.levels.any { it.level == level }) document.levels else document.levels + LevelDecisions(level)
        return document.copy(levels = levels.map { decisions ->
            decisions.copy(entries = decisions.entries.filterNot { it.slot == slot } +
                if (decisions.level == level) listOf(EntryChoice("candidate", slot, selection)) else emptyList())
        })
    }

    private suspend fun listedIds(picker: Picker, group: FeatGroup) = picker.listing.rows(group).map { it.metadata.metadata.id }

    @Test fun extendedContentEqualsFullPreparationForEveryListedFeatAndTheme() = synchronous {
        val (catalog, document) = fixture()
        val picker = Picker(catalog, document, withExtend = true)
        suspend fun verify(slot: ChoiceSlotId, level: Int, ids: List<String>) {
            val baseline = document.copy(levels = document.levels.map { decisions ->
                decisions.copy(entries = decisions.entries.filterNot { it.slot == slot })
            })
            val base = picker.preparation.load(baseline)
            var compared = 0
            for (id in ids) {
                val definition = (picker.reading.lookup(id) as ContractResult.Available).value ?: continue
                val selection = SavedSelection(id, definition.entry.presentation.title, definition.supplier.packageId, definition.fingerprint)
                val candidate = candidateDocument(document, level, slot, selection)
                assertEquals(baseline.classEntryIds(), candidate.classEntryIds(), id)
                assertEquals(picker.preparation.load(candidate), picker.preparation.extend(base, candidate, selection), id)
                compared++
            }
            assertEquals(ids.size, compared)
        }
        val feats = groups.flatMap { listedIds(picker, it) }.distinct()
        assertTrue(feats.size > 500, "Every feat tab is exercised")
        verify(slot, 18, feats)
        verify(ChoiceSlotId("creation", "theme", 0), 1, catalog.search(category = EntryCategory.THEME).map { it.metadata.id })
    }

    @Test fun candidatesReachingTheSameNewDefinitionsShareTheirContent() = synchronous {
        val (catalog, document) = fixture()
        val picker = Picker(catalog, document, withExtend = true)
        val baseline = document.copy(levels = document.levels.map { decisions ->
            decisions.copy(entries = decisions.entries.filterNot { it.slot == slot })
        })
        val base = picker.preparation.load(baseline)
        val contents = groups.flatMap { listedIds(picker, it) }.distinct().map { id ->
            val definition = (picker.reading.lookup(id) as ContractResult.Available).value!!
            val selection = SavedSelection(id, definition.entry.presentation.title, definition.supplier.packageId, definition.fingerprint)
            picker.preparation.extend(base, candidateDocument(document, 18, slot, selection), selection)
        }
        val distinctMaps = contents.map { it.entries }.distinct().size
        val sharedInstances = contents.groupBy { it.entries.keys }.values.all { group -> group.all { it.entries === group.first().entries } }
        assertTrue(sharedInstances, "Candidates with the same entry IDs hold one map instance")
        assertTrue(distinctMaps < contents.size / 4, "A feat list reaches far fewer distinct sets of definitions than it has feats: $distinctMaps")
    }

    @Test fun aWholeListPreparesTheBaselineOnceAndMatchesPerCandidatePreparation() = synchronous {
        val (catalog, document) = fixture()
        val fast = Picker(catalog, document, withExtend = true)
        val slow = Picker(catalog, document, withExtend = false)
        // Know every tab first, so the listing is only released once all of them have been checked.
        val tabs = groups.map { listedIds(fast, it) }
        groups.forEach { listedIds(slow, it) }
        var checked = 0
        for (ids in tabs) {
            val fastRows = fast.listing.check(ids)
            val slowRows = slow.listing.check(ids)
            assertEquals(slowRows, fastRows)
            assertTrue(fastRows.all { it.checked })
            checked += fastRows.size
        }
        assertTrue(checked > 500)
        assertEquals(1, fast.prepared.size, "Only the baseline is prepared in full, once for the whole listing")
        assertTrue(slow.prepared.size > checked / 2, "Without sharing every candidate is prepared in full")
    }

    @Test fun aFeatListingKeepsItsFactsUntilEveryTabIsCheckedAndReleasingChangesNoResult() = synchronous {
        val (catalog, document) = fixture()
        val picker = Picker(catalog, document, withExtend = true)
        val reference = Picker(catalog, document, withExtend = false)
        val classIds = listedIds(picker, FeatGroup.CLASS)
        val first = picker.listing.check(classIds)
        assertEquals(1, picker.prepared.size)
        assertEquals(reference.listing.check(listedIds(reference, FeatGroup.CLASS)), first)
        // Another tab is still to come, so the prepared facts are kept and shared with it.
        val general = picker.listing.check(listedIds(picker, FeatGroup.GENERAL))
        assertEquals(1, picker.prepared.size, "A feat listing prepares its baseline once while tabs are still arriving")
        assertEquals(reference.listing.check(listedIds(reference, FeatGroup.GENERAL)), general)
        val ancestry = picker.listing.check(listedIds(picker, FeatGroup.ANCESTRY))
        assertEquals(1, picker.prepared.size)
        assertEquals(reference.listing.check(listedIds(reference, FeatGroup.ANCESTRY)), ancestry)
        // Every tab is checked, so the facts were released; a later check prepares what it needs again, unchanged.
        assertEquals(first.first().option, picker.choices.option(document, 18, slot, classIds.first()))
        assertEquals(2, picker.prepared.size, "The baseline is prepared again after the release")
        assertEquals(first, picker.listing.check(classIds), "Checked rows are kept")
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
