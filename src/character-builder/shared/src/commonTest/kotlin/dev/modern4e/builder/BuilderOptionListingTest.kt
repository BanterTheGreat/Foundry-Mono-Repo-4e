package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*
import kotlin.time.TimeSource

class BuilderOptionListingTest {
    private val slot = ChoiceSlotId("creation", "feat", 0)
    private fun feat(id: String) = ContentEntry(id, EntryCategory.FEAT, Presentation(id),
        Mechanics(version = 2, prerequisites = listOf(Prerequisite.Level(if (id.endsWith("2")) 2 else 1))),
        Coverage(CoverageStatus.SUPPORTED))
    private val definitions = listOf(feat("general-1"), feat("general-2"), feat("class-1"))
    private class Source(val entries: MutableMap<String, ContentEntry>) : ContentSource {
        val reads = mutableListOf<String>()
        override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(id = "standard", revision = "1",
            title = "Standard", indexes = listOf("index"), chunks = entries.keys.toList())))
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
            entries.values.map { EntryMetadata(it.id, it.category, it.presentation.title, it.id,
                if (it.id.startsWith("general")) FeatGroup.GENERAL else FeatGroup.CLASS) }))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            reads += chunkId
            return ContractResult.Available(EntryChunk(chunkId, listOf(entries.getValue(chunkId))))
        }
    }
    private fun document() = CharacterDocument(id = "listing", savedAt = "2026-11-18T00:00:00Z",
        identity = CharacterIdentity("Listing"), packages = emptyList(), level = 1,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()),
        levels = listOf(LevelDecisions(1)))
    private suspend fun operations(source: Source) = BuilderOperations(assertIs<ContractResult.Available<ContentCatalog>>(
        ContentCatalog.open(source, "standard", emptyList())).value)

    @Test fun metadataIsImmediateAndOnlyRequestedRowsAreCheckedAndReused() = run {
        val source = Source(definitions.associateBy { it.id }.toMutableMap())
        val listing = operations(source).optionListing(document(), 1, slot)
        val pending = listing.rows(FeatGroup.GENERAL)
        assertEquals(listOf("general-1", "general-2"), pending.map { it.metadata.metadata.id })
        assertTrue(pending.all { !it.checked && it.option == null })
        assertTrue(source.reads.isEmpty(), "First rows must not wait for any definition/eligibility reads")
        val first = listing.check(listOf("general-1")).single()
        assertTrue(first.checked)
        assertEquals(Eligibility.ELIGIBLE, first.option?.eligibility)
        assertEquals(listOf("general-1"), source.reads)
        assertEquals(listOf(true, false), listing.rows(FeatGroup.GENERAL).map { it.checked })
        assertEquals(first, listing.check(listOf("general-1")).single())
        assertEquals(listOf("general-1"), source.reads, "Reopening/rechecking a row does no more work")
        assertTrue(listing.check(listOf("class-1")).isEmpty(), "Unchecked tabs are not resolved speculatively")
        assertEquals(Eligibility.INELIGIBLE, listing.check(listOf("general-2")).single().option?.eligibility)
        assertTrue(listing.rows(FeatGroup.CLASS).all { !it.checked })
    }

    @Test fun freshListingObservesChangedContentAndCharacter() = run {
        val source = Source(definitions.associateBy { it.id }.toMutableMap())
        val ops = operations(source)
        val listing = ops.optionListing(document(), 1, slot)
        listing.rows(FeatGroup.GENERAL)
        val original = listing.check(listOf("general-1")).single()
        val entry = source.entries.getValue("general-1")
        source.entries[entry.id] = entry.copy(mechanics = entry.mechanics.copy(prerequisites = listOf(Prerequisite.Level(2))))
        assertEquals(original, listing.check(listOf(entry.id)).single(), "Explicit snapshots stay internally consistent")
        val fresh = ops.optionListing(document(), 1, slot)
        fresh.rows(FeatGroup.GENERAL)
        assertEquals(Eligibility.INELIGIBLE, fresh.check(listOf(entry.id)).single().option?.eligibility)
        val levelTwo = document().copy(level = 2, levels = listOf(LevelDecisions(1), LevelDecisions(2)))
        val advanced = ops.optionListing(levelTwo, 2, ChoiceSlotId("advancement.2", "feat", 0))
        advanced.rows(FeatGroup.GENERAL)
        assertEquals(Eligibility.ELIGIBLE, advanced.check(listOf(entry.id)).single().option?.eligibility)
    }

    @Test fun productionMetadataAndFirstBatchDoNotWaitForTheWholeFeatCatalog() = run {
        var reads = 0
        val source = object : ContentSource by CurrentDataFixtures {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads++
                return CurrentDataFixtures.loadChunk(packageId, chunkId)
            }
        }
        val document = CurrentDataFixtures.sample()
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(source, "modern4e.classes", document.packages)).value
        val listing = BuilderOperations(catalog).optionListing(document, 1, slot)
        val started = TimeSource.Monotonic.markNow()
        val rows = listing.rows(FeatGroup.CLASS)
        val metadataTime = started.elapsedNow()
        assertEquals(451, rows.size)
        assertEquals(0, reads)
        val batchStarted = TimeSource.Monotonic.markNow()
        listing.check(rows.take(12).map { it.metadata.metadata.id })
        val checked = listing.rows(FeatGroup.CLASS)
        assertEquals(12, checked.count { it.checked })
        assertTrue(checked.drop(12).none { it.checked })
        val beforeReopen = reads
        listing.rows(FeatGroup.CLASS)
        assertEquals(beforeReopen, reads)
        println("Feat listing: metadata=$metadataTime, first 12=${batchStarted.elapsedNow()}, total metadata rows=${rows.size}, chunk reads=$reads")
    }

    private fun run(block: suspend () -> Unit) {
        var result: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) { result = value }
        })
        checkNotNull(result).getOrThrow()
    }
}
