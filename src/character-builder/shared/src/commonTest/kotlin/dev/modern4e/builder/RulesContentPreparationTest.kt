package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class RulesContentPreparationTest {
    private fun entry(id: String, category: EntryCategory = EntryCategory.FEATURE, mechanics: Mechanics = Mechanics()) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))

    private class Source(definitions: List<ContentEntry>) : ContentSource {
        val definitions = definitions.associateBy { it.id }.toMutableMap()
        val reads = mutableMapOf<String, Int>()
        override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(
            id = "standard", revision = "1", title = "Standard", indexes = listOf("index"), chunks = definitions.keys.toList())))
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
            definitions.values.map { EntryMetadata(it.id, it.category, it.presentation.title, it.id) }))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            reads[chunkId] = (reads[chunkId] ?: 0) + 1
            return ContractResult.Available(EntryChunk(chunkId, listOf(definitions.getValue(chunkId))))
        }
    }

    private fun run(block: suspend () -> Unit) {
        var result: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) { result = value }
        })
        checkNotNull(result).getOrThrow()
    }

    private suspend fun catalog(source: Source) =
        assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, "standard", emptyList())).value

    private fun document(root: ContentEntry, level: Int = 1): CharacterDocument = CharacterDocument(
        id = "content-test", savedAt = "2026-11-18T00:00:00Z", identity = CharacterIdentity("Content"),
        packages = emptyList(), level = level,
        abilities = AbilityAllocation(ChoiceSlotId("root", "main", 0), Ability.STRENGTH, emptyMap()),
        levels = listOf(LevelDecisions(1, entries = listOf(EntryChoice("root", ChoiceSlotId("creation", "class", 0),
            SavedSelection(root.id, root.presentation.title, "standard", ContractCodec.fingerprint(root)))))))

    @Test fun futureProgressionAndAcquisitionDependenciesAreDeferredUntilActive() = run {
        val root = entry("root", EntryCategory.CLASS, Mechanics(
            grants = listOf(Grant.Entry("futureGrant", "future", atLevel = 2)),
            choices = listOf(ChoiceDefinition.Entries("futureExplicit", 1, listOf("futureChoice"), atLevel = 2)),
            progression = listOf(ClassProgression(2, choices = listOf(ChoiceDefinition.Entries("query", 1,
                query = PowerQuery(powerKind = "UTILITY")))))))
        val source = Source(listOf(root, entry("future"), entry("futureChoice"),
            entry("power1", EntryCategory.POWER), entry("power2", EntryCategory.POWER)))
        val preparation = RulesContentPreparation(catalog(source))
        assertTrue(preparation.load(document(root)).entries.isEmpty())
        assertEquals(mapOf("root" to 1), source.reads)
        val active = preparation.load(document(root, 2))
        assertEquals(setOf("future", "futureChoice", "power1", "power2"), active.entries.keys)
        assertEquals(setOf("root", "future", "futureChoice", "power1", "power2"), source.reads.keys)
        assertTrue(source.reads.values.all { it == 1 })
    }

    @Test fun preparationReusesReadsWithoutLeakingCandidateDependenciesOrPinningLaterOperations() = run {
        val a = entry("a", EntryCategory.CLASS, Mechanics(grants = listOf(Grant.Entry("child", "a-child"))))
        val b = entry("b", EntryCategory.CLASS, Mechanics(grants = listOf(Grant.Entry("child", "b-child"))))
        val child = entry("a-child")
        val source = Source(listOf(a, b, child, entry("b-child")))
        val catalog = catalog(source)
        val preparation = RulesContentPreparation(catalog)
        assertEquals(setOf("a-child"), preparation.load(document(a)).entries.keys)
        assertEquals(setOf("b-child"), preparation.load(document(b)).entries.keys)
        assertEquals(setOf("a-child"), preparation.load(document(a)).entries.keys)
        assertEquals(1, source.reads["a-child"])
        source.definitions[child.id] = child.copy(mechanics = Mechanics(prerequisites = listOf(Prerequisite.Level(2))))
        val fresh = RulesContent.load(document(a), catalog)
        assertEquals(listOf(Prerequisite.Level(2)), assertIs<ContractResult.Available<ResolvedEntry>>(
            fresh.entries.getValue(child.id)).value.entry.mechanics.prerequisites)
        assertEquals(2, source.reads["a-child"])
        assertEquals(emptyList(), assertIs<ContractResult.Available<ResolvedEntry>>(
            preparation.load(document(a)).entries.getValue(child.id)).value.entry.mechanics.prerequisites)
    }

    @Test fun missingExpectedSuppliersRemainUnresolvedRatherThanAdoptingOrdinaryDefinitions() = run {
        val root = entry("root", EntryCategory.CLASS)
        val source = Source(listOf(root))
        val doc = document(root)
        val original = doc.levels.single().entries.single()
        val missing = original.copy(selection = original.selection.copy(supplierPackageId = "missing"))
        val content = RulesContent.load(doc.copy(levels = listOf(LevelDecisions(1, entries = listOf(missing)))), catalog(source))
        assertEquals("catalog.expectedSupplier", assertIs<ContractResult.Unavailable>(
            content.selections.getValue(missing.selection)).diagnostics.single().code)
        assertTrue(source.reads.isEmpty())
    }
}
