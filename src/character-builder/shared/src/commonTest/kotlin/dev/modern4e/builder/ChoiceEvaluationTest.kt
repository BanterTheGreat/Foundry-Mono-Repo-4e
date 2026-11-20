package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class ChoiceEvaluationTest {
    private val slot = ChoiceSlotId("creation", "feat", 0)
    private val feats = (1..24).map { number -> ContentEntry("feat-$number", EntryCategory.FEAT,
        Presentation("Feat $number"), Mechanics(version = 2, prerequisites = listOf(Prerequisite.Level(if (number % 2 == 0) 1 else 2))),
        Coverage(CoverageStatus.SUPPORTED)) }

    private class Source(val definitions: List<ContentEntry>) : ContentSource {
        val reads = mutableListOf<String>()
        override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(
            id = "standard", revision = "1", title = "Standard", indexes = listOf("index"), chunks = definitions.map { it.id })))
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
            definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, it.id) }))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            reads += chunkId
            return ContractResult.Available(EntryChunk(chunkId, listOf(definitions.single { it.id == chunkId })))
        }
    }

    private fun document() = CharacterDocument(id = "choices", savedAt = "2026-11-18T00:00:00Z",
        identity = CharacterIdentity("Choices"), packages = emptyList(), level = 1,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()),
        levels = listOf(LevelDecisions(1)))

    private suspend fun catalog(source: Source) = assertIs<ContractResult.Available<ContentCatalog>>(
        ContentCatalog.open(source, "standard", emptyList())).value

    @Test fun selectingOneEntryDoesNotResolveOtherCategoryCandidatesAndRefreshesNextCommand() = run {
        val source = Source(feats)
        val operations = BuilderOperations(catalog(source))
        val selected = operations.apply(document(), BuilderEdit.Entry(1, slot, "feat-2", "chosen"))
        assertTrue(selected.applied)
        assertEquals(listOf("feat-2"), source.reads, "One edit shares its reads and never enumerates other feat definitions")
        assertEquals(Eligibility.ELIGIBLE, selected.state.rules.entryEligibility.getValue("chosen").status)
        operations.evaluate(selected.state.document)
        assertEquals(listOf("feat-2", "feat-2"), source.reads, "A later command gets fresh source bytes")
        assertFalse(operations.apply(document(), BuilderEdit.Entry(1, slot, "feat-1", "chosen")).applied)
        assertTrue(operations.apply(document(), BuilderEdit.Entry(1, slot, "feat-1", "chosen", true)).applied)
    }

    @Test fun modernChoiceListsUseOneFullPreparationAndMatchCommittedEligibility() = run {
        val source = Source(feats)
        val reading = catalog(source).readSession()
        val preparation = RulesContentPreparation(reading)
        var fullEvaluations = 0
        val choices = ChoiceEvaluation(reading, { doc ->
            fullEvaluations++
            BuilderState(doc, RulesEngine.evaluate(doc, preparation.load(doc)))
        }, { preparation.load(it) })
        val options = choices.options(document(), 1, slot, true)
        assertEquals(feats.size, options.size)
        assertEquals(0, fullEvaluations, "Root metadata and V2 candidate checks need no complete character evaluation")
        assertEquals(feats.size, source.reads.size)
        for (option in options) {
            val definition = option.entry
            val entry = EntryChoice("chosen", slot, SavedSelection(definition.entry.id, definition.entry.presentation.title,
                definition.supplier.packageId, definition.fingerprint))
            val candidate = document().copy(levels = listOf(LevelDecisions(1, entries = listOf(entry))))
            val full = RulesEngine.evaluate(candidate, preparation.load(candidate))
            assertEquals(full.entryEligibility.getValue("chosen").status, option.eligibility)
            assertEquals(full.entryEligibility.getValue("chosen").unmet, option.unmet)
            assertEquals(option.entry.entry.mechanics.prerequisites.filter { option.eligibility == Eligibility.INELIGIBLE }
                .map { UnmetCondition.Failed(it) }, option.unmet)
            assertEquals(full.diagnostics.filter { it.slot == slot && it.entryId == definition.entry.id }, option.diagnostics)
        }
        assertEquals(feats.size / 2, choices.options(document(), 1, slot, false).size)
        assertNull(choices.option(document(), 1, ChoiceSlotId("creation", "ancestry", 0), "feat-2"))
        assertTrue(choices.options(document(), 2, slot, true).isEmpty())
    }

    @Test fun batchesValidateSequentiallyAndRejectAtomically() = run {
        val operations = BuilderOperations(catalog(Source(feats)))
        val original = document()
        val edit = BuilderEdit.Entry(1, slot, "feat-2", "chosen")
        val accepted = operations.apply(original, BuilderEdit.Batch(listOf(
            BuilderEdit.Identity(CharacterIdentity("Renamed")), edit)))
        assertTrue(accepted.applied)
        assertEquals("Renamed", accepted.state.document.identity.name)
        assertEquals("chosen", accepted.state.document.levels.single().entries.single().instanceId)
        assertEquals(operations.evaluate(accepted.state.document), accepted.state)
        val rejected = operations.apply(original, BuilderEdit.Batch(listOf(edit,
            BuilderEdit.Entry(1, slot, "missing", "chosen"))))
        assertFalse(rejected.applied)
        assertEquals(original, rejected.state.document)
        assertTrue(rejected.diagnostics.any { it.code == "builder.rejected" })
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
