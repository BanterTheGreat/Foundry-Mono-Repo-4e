package dev.modern4e.builder

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Exercises selective refresh through committed edits and the picker’s first published rows. Occurrence and structural
 * edits are covered without a session by the shared `ListingRetentionTest`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChoiceCacheRefreshTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore
    private val oldFeat = "modern4e.feat.improved-initiative"
    private val newFeat = "modern4e.feat.toughness"
    private val dependentFeat = "modern4e.feat.skill-training"
    private val independentFeat = "modern4e.feat.durable"
    private val skillFeat = "modern4e.feat.armor-proficiency"
    private val classFeat = "modern4e.feat.alertness"
    private val earlier = ChoiceSlotId("advancement.2", "feat", 0)
    private val later = ChoiceSlotId("advancement.4", "feat", 0)

    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    private fun sample(): CharacterDocument {
        val original = (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
            .readText(Charsets.UTF_8)) as ContractResult.Available).value
        return original.copy(level = 5, levels = original.levels.map { decisions ->
            decisions.copy(entries = decisions.entries.filterNot { it.slot == ChoiceSlotId("creation", "feat", 0) },
                proficiencies = decisions.proficiencies.filterNot { it.slot.sourceInstanceId == "training" })
        } + (2..5).map { LevelDecisions(it) })
    }

    /** Small, authored dependency graph over real identities, packages and descriptions. */
    private inner class Source : ContentSource {
        private val real = AndroidContentSource(context.assets)
        private val ids = setOf(oldFeat, newFeat, dependentFeat, independentFeat, skillFeat, classFeat)
        var revision = "original"

        override suspend fun listPackages() = real.listPackages()

        override suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex> =
            when (val result = real.loadIndex(packageId, indexId)) {
                is ContractResult.Unavailable -> result
                is ContractResult.Available -> ContractResult.Available(result.value.copy(entries = result.value.entries
                    .filter { it.category != EntryCategory.FEAT || it.id in ids }.map { metadata ->
                        if (metadata.id in ids) {
                            metadata.copy(featGroup = if (metadata.id == classFeat) FeatGroup.CLASS else FeatGroup.GENERAL,
                                featClassIds = if (metadata.id == classFeat) listOf("modern4e.class.fighter") else emptyList(),
                                featAncestryIds = emptyList())
                        } else {
                            metadata
                        }
                    }), result.diagnostics)
            }

        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> =
            when (val result = real.loadChunk(packageId, chunkId)) {
                is ContractResult.Unavailable -> result
                is ContractResult.Available -> ContractResult.Available(result.value.copy(entries = result.value.entries.map { entry ->
                    if (entry.id in ids) {
                        val prerequisite = when (entry.id) {
                            dependentFeat -> if (revision == "original") Prerequisite.Entry(oldFeat) else Prerequisite.Always
                            skillFeat -> Prerequisite.Proficiency(Skill.ARCANA)
                            classFeat -> Prerequisite.Entry("modern4e.class.fighter")
                            else -> Prerequisite.Always
                        }
                        entry.copy(presentation = entry.presentation.copy(description = "${entry.presentation.description}\nCache content: $revision"),
                            mechanics = Mechanics(version = 2, prerequisites = listOf(prerequisite), maximumSelections = 1),
                            coverage = Coverage(CoverageStatus.SUPPORTED))
                    } else {
                        entry
                    }
                }), result.diagnostics)
            }
    }

    private suspend fun session(source: Source = Source()): BuilderSession =
        BuilderSession(store, source, ::sample).also { model ->
            model.warmupSettleMillis = 60_000
            model.create()
            model.pick(oldFeat)
        }

    private suspend fun BuilderSession.pick(id: String) {
        edit(BuilderEdit.Entry(2, earlier, id, progressionEntryInstance(2, earlier), true))
        assertTrue(errors.toString(), errors.isEmpty())
    }

    private suspend fun BuilderSession.rows(group: FeatGroup = FeatGroup.GENERAL): List<BuilderOptionRow> {
        var result = emptyList<BuilderOptionRow>()
        progressionOptionRows(4, later, group) { result = it }
        assertTrue("Expected candidates for $group", result.isNotEmpty())
        assertTrue(result.all { it.checked })
        return result
    }

    private suspend fun BuilderSession.firstRows(group: FeatGroup = FeatGroup.GENERAL): List<BuilderOptionRow> {
        var result = emptyList<BuilderOptionRow>()
        try {
            progressionOptionRows(4, later, group) {
                result = it
                throw CancellationException("Inspect pending and retained rows before checking")
            }
        } catch (_: CancellationException) { }
        assertTrue(result.isNotEmpty())
        return result
    }

    private suspend fun BuilderSession.warmAllTabs(): List<BuilderOptionRow> {
        val general = rows()
        for (group in listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY)) {
            progressionOptionRows(4, later, group) { }
        }
        return general
    }

    @Test fun earlierFeatEditRefreshesOnlyDependentRowsAndRetainsDefinitions() = runBlocking {
        val model = session()
        val before = model.warmAllTabs().associateBy { it.metadata.metadata.id }
        assertEquals(Eligibility.ELIGIBLE, before.getValue(dependentFeat).option?.eligibility)

        model.pick(newFeat)

        val first = model.firstRows().associateBy { it.metadata.metadata.id }
        for (id in listOf(independentFeat, skillFeat)) {
            assertEquals("Unrelated eligibility is retained for $id", before.getValue(id), first.getValue(id))
        }
        for (id in listOf(oldFeat, newFeat, dependentFeat)) {
            val row = first.getValue(id)
            assertFalse("Changed duplicate/prerequisite result must be pending for $id", row.checked)
            assertEquals(before.getValue(id).option?.entry, row.option?.entry)
            assertEquals(Eligibility.UNRESOLVED, row.option?.eligibility)
            assertTrue(row.diagnostics.isEmpty())
        }
        val final = model.rows().associateBy { it.metadata.metadata.id }
        assertEquals(Eligibility.ELIGIBLE, final.getValue(oldFeat).option?.eligibility)
        assertEquals(Eligibility.INELIGIBLE, final.getValue(newFeat).option?.eligibility)
        assertEquals(Eligibility.INELIGIBLE, final.getValue(dependentFeat).option?.eligibility)
        val fresh = model.progressionOptions(4, later).associate { it.entry.entry.id to it.eligibility }
        assertEquals(fresh.filterKeys { it in final }, final.mapValues { it.value.option?.eligibility })
    }

    @Test fun unseenTabStartsFreshAfterEarlierFeatEdit() = runBlocking {
        val model = session()
        model.rows()

        model.pick(newFeat)

        val unseen = model.firstRows(FeatGroup.CLASS).single()
        assertEquals(classFeat, unseen.metadata.metadata.id)
        assertFalse(unseen.checked)
        assertNull("An unopened tab has no cached definition to inherit", unseen.option)
        assertEquals(Eligibility.ELIGIBLE, model.rows(FeatGroup.CLASS).single().option?.eligibility)
    }

    @Test fun reopeningContentDiscardsOldDefinitionsAndEligibility() = runBlocking {
        val source = Source()
        val model = session(source)
        model.warmAllTabs()
        model.pick(newFeat)
        assertEquals(Eligibility.INELIGIBLE, model.rows().single { it.metadata.metadata.id == dependentFeat }.option?.eligibility)

        source.revision = "updated"
        model.load(model.current!!.document.id)

        val refreshed = model.rows()
        assertTrue(refreshed.all { it.option?.entry?.entry?.presentation?.description?.contains("Cache content: updated") == true })
        assertEquals(Eligibility.ELIGIBLE, refreshed.single { it.metadata.metadata.id == dependentFeat }.option?.eligibility)
    }
}
