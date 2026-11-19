package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** A character's pools load only its own class's powers; other classes' index rows and chunks are never read. */
class ClassScopedLoadingTest {
    private fun runTest(block: suspend () -> Unit) {
        var completed = false
        var failure: Throwable? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                completed = true
                failure = result.exceptionOrNull()
            }
        })
        assertTrue(completed)
        failure?.let { throw it }
    }

    /** Production bytes, recording every chunk a catalog reads. */
    private class Recording : ContentSource {
        val prefix = "authoritative/"
        val chunks = mutableListOf<Pair<String, String>>()
        private val packageIds = productionFixtures.keys.filter { it.startsWith(prefix) && it.endsWith("/manifest.json") }
            .map { it.removePrefix(prefix).substringBefore('/') }
        override suspend fun listPackages() = ContractResult.Available(packageIds.map {
            assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(
                productionFixtures.getValue("$prefix$it/manifest.json"))).value
        })
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
            ContractCodec.json.decodeFromString<ContentIndex>(productionFixtures.getValue("$prefix$packageId/$indexId.json")))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            chunks += packageId to chunkId
            return ContractResult.Available(
                ContractCodec.json.decodeFromString<EntryChunk>(productionFixtures.getValue("$prefix$packageId/$chunkId.json")))
        }
    }

    private suspend fun open(source: Recording) = assertIs<ContractResult.Available<ContentCatalog>>(
        ContentCatalog.open(source, "modern4e.classes", emptyList())).value

    private fun sample() = assertIs<ContractResult.Available<CharacterDocument>>(
        ContractCodec.decode(contractFixtures.getValue("sample-modern-fighter.json"))).value

    private suspend fun asClass(catalog: ContentCatalog, classId: String): CharacterDocument {
        val sample = sample()
        val resolved = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(classId)).value!!
        val level = sample.levels.first()
        return sample.copy(levels = listOf(level.copy(entries = listOf(level.entries.first().copy(
            selection = SavedSelection(resolved.entry.id, resolved.entry.presentation.title, resolved.supplier.packageId, resolved.fingerprint))))))
    }

    private fun powerClass(entry: ContentEntry) = (entry.mechanics.access as? Prerequisite.Entry)?.entryId

    @Test fun indexRowsNameTheClassOfSelectablePowersAndNothingElse() = runTest {
        val catalog = open(Recording())
        val fighterPowers = catalog.search(category = EntryCategory.POWER).filter { it.metadata.id.startsWith("modern4e.power.fighter-power") }
        assertEquals(211, fighterPowers.size)
        assertTrue(fighterPowers.all { it.metadata.classId == "modern4e.class.fighter" })
        assertTrue(catalog.search(category = EntryCategory.CLASS).all { it.metadata.classId == null })
        assertTrue(catalog.search(category = EntryCategory.FEAT).all { it.metadata.classId == null })
        assertTrue(catalog.search(category = EntryCategory.POWER).any { it.metadata.classId == null }, "Unscoped powers remain")
        val scoped = catalog.search(category = EntryCategory.POWER, classIds = setOf("modern4e.class.fighter"))
        assertTrue(scoped.any { it.metadata.id.startsWith("modern4e.power.fighter-power") })
        assertTrue(scoped.none { it.metadata.classId != null && it.metadata.classId != "modern4e.class.fighter" })
        assertEquals(emptySet(), catalog.search(category = EntryCategory.POWER, classIds = emptySet()).mapNotNull { it.metadata.classId }.toSet())
        assertEquals(catalog.search(category = EntryCategory.FEAT).size, catalog.search(category = EntryCategory.FEAT, classIds = emptySet()).size)
    }

    @Test fun aFighterLoadsOnlyFighterPowersAndFarFewerChunks() = runTest {
        val everything = Recording()
        val all = open(everything)
        val total = assertIs<ContractResult.Available<List<PackageManifest>>>(everything.listPackages()).value.sumOf { it.chunks.size }
        val source = Recording()
        val catalog = open(source)
        val content = RulesContent.load(sample(), catalog)
        val powers = content.entries.values.filterIsInstance<ContractResult.Available<ResolvedEntry>>()
            .map { it.value.entry }.filter { it.category == EntryCategory.POWER && it.mechanics.powerProfile != null }
        assertTrue(powers.any { it.id.startsWith("modern4e.power.fighter-power") })
        assertTrue(powers.none { powerClass(it)?.let { id -> id != "modern4e.class.fighter" } == true },
            "No other class's power may be loaded for a Fighter")
        assertTrue(source.chunks.size * 3 < total, "A Fighter reads ${source.chunks.size} of $total chunks")
        assertEquals(source.chunks.distinct().size, source.chunks.size, "Each chunk is read once")
        // Scoping is a loading rule only: the full catalog still resolves any class's power by ID.
        val wizardPower = all.search(category = EntryCategory.POWER).first { it.metadata.classId == "modern4e.class.wizard" }
        assertNotNull(assertIs<ContractResult.Available<ResolvedEntry?>>(all.lookup(wizardPower.metadata.id)).value)
    }

    @Test fun aWizardGetsWizardPoolsAndNoFighterPowers() = runTest {
        val catalog = open(Recording())
        val wizard = asClass(catalog, "modern4e.class.wizard")
        val content = RulesContent.load(wizard, catalog)
        val choice = RulesEngine.evaluate(wizard, content).choices.first { it.slot.choiceId == "modern4e.choice.class-attack-at-will" }
        assertTrue(choice.entries.none { it.entryId.startsWith("modern4e.power.fighter-") }, "Another class's powers are never offered")
        assertTrue(choice.entries.any { it.entryId.startsWith("modern4e.power.wizard-power") && it.status == Eligibility.ELIGIBLE })
    }

    @Test fun powersWithUnresolvedPrerequisitesAreNeverOffered() = runTest {
        val catalog = open(Recording())
        val avenger = asClass(catalog, "modern4e.class.avenger")
        val offered = RulesEngine.evaluate(avenger, RulesContent.load(avenger, catalog)).choices
            .flatMap { it.entries }.map { it.entryId }.toSet()
        assertTrue(offered.any { it.startsWith("modern4e.power.avenger-power") })
        // Godsworn Alacrity's feat prerequisite is unresolved, so the power resolves by ID but is not selectable.
        assertFalse("modern4e.power.avenger-power11635" in offered)
        assertNotNull(assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.power.avenger-power11635")).value)
    }
}
