package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class ContentCatalogTest {
    private val json = ContractCodec.json
    private val standard = json.decodeFromString<PackageManifest>(contractFixtures.getValue("package.json"))
    private val custom = json.decodeFromString<PackageManifest>(contractFixtures.getValue("override-package.json"))
    private val fighter = json.decodeFromString<EntryChunk>(contractFixtures.getValue("chunk.json")).entries.single()
    private val override = json.decodeFromString<EntryChunk>(contractFixtures.getValue("override-chunk.json")).entries.single()
    private val enabled = listOf(PackageRevision(custom.id, custom.revision))

    /** In-memory adapter uses the actual v1 models, including JSON-decoded production-shape goldens. */
    private inner class Source : ContentSource {
        var manifests = listOf(standard, custom)
        val indexes = mutableMapOf(
            standard.id to json.decodeFromString<ContentIndex>(contractFixtures.getValue("index.json")),
            custom.id to json.decodeFromString<ContentIndex>(contractFixtures.getValue("override-index.json")),
        )
        val chunks = mutableMapOf(standard.id to EntryChunk("classes", listOf(fighter)), custom.id to EntryChunk("classes", listOf(override)))
        var reads = 0
        var failChunks = false
        override suspend fun listPackages() = ContractResult.Available(manifests)
        override suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex> = ContractResult.Available(indexes.getValue(packageId))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            reads++
            return if (failChunks) ContractResult.Unavailable(listOf(Diagnostic("io.test", DiagnosticKind.IO_FAILURE, "Read failed")))
                else ContractResult.Available(chunks.getValue(packageId))
        }
    }

    private fun run(block: suspend () -> Unit) {
        var completed = false
        var failure: Throwable? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) { completed = true; failure = result.exceptionOrNull() }
        })
        assertTrue(completed, "Fixture adapters complete immediately")
        failure?.let { throw it }
    }
    private suspend fun catalog(source: Source, packages: List<PackageRevision> = enabled): ContentCatalog =
        assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, standard.id, packages)).value
    private fun <T> value(result: ContractResult<T>): T = assertIs<ContractResult.Available<T>>(result).value
    private fun code(result: ContractResult<*>) = assertIs<ContractResult.Unavailable>(result).diagnostics.first().code
    private fun saved(supplier: String = custom.id) = SavedSelection(fighter.id, "Saved Fighter", supplier, ContractCodec.fingerprint(override))

    @Test fun metadataSearchIsLazyAndCharacterOrdersAreIndependent() = run {
        val source = Source()
        val a = catalog(source)
        val b = catalog(source, emptyList())
        assertEquals("Resolute Fighter", a.search("resolute FIGHTER", EntryCategory.CLASS).single().metadata.title)
        assertTrue(a.search("Fighter", EntryCategory.FEAT).isEmpty())
        assertTrue(a.search("absent").isEmpty())
        assertEquals("Fighter", b.search().single().metadata.title)
        assertEquals(0, source.reads)
        assertNull(value(a.lookup("missing")))
        assertEquals(0, source.reads)
        val resolved = value(a.lookup(fighter.id))!!
        assertEquals(override, resolved.entry)
        assertEquals(PackageRevision(custom.id, "1"), resolved.supplier)
        assertEquals(ContractCodec.fingerprint(override), resolved.fingerprint)
        assertEquals(fighter, value(b.lookup(fighter.id))!!.entry)
        assertEquals(2, source.reads)
    }

    @Test fun reorderedOverridesReplaceWholeEntries() = run {
        val source = Source()
        val third = custom.copy(id = "third")
        val replacement = fighter.copy(presentation = Presentation("Bare Fighter"), mechanics = Mechanics(), coverage = Coverage(CoverageStatus.SUPPORTED))
        source.manifests += third
        source.indexes[third.id] = ContentIndex(listOf(EntryMetadata(fighter.id, EntryCategory.CLASS, "Bare Fighter", "classes")))
        source.chunks[third.id] = EntryChunk("classes", listOf(replacement))
        val last = PackageRevision(third.id, "1")
        val a = catalog(source, enabled + last)
        val b = catalog(source, listOf(last) + enabled)
        assertEquals(replacement, value(a.lookup(fighter.id))!!.entry)
        assertTrue(value(a.lookup(fighter.id))!!.entry.mechanics.choices.isEmpty())
        assertEquals(override, value(b.lookup(fighter.id))!!.entry)
        assertEquals(listOf(standard.id, third.id, custom.id), b.packages.map { it.id })
    }

    @Test fun missingExpectedSupplierAndEntryNeverFallBackButSwitchCan() = run {
        val source = Source()
        val base = catalog(source, emptyList())
        assertEquals("catalog.expectedSupplier", code(base.resolve(saved())))
        assertEquals(fighter, value(base.resolve(saved(), deliberatePackageSwitch = true)).entry)
        source.indexes[custom.id] = ContentIndex(emptyList())
        val removed = catalog(source)
        assertEquals("catalog.expectedEntry", code(removed.resolve(saved())))
        assertEquals(fighter, value(removed.lookup(fighter.id))!!.entry)
        assertEquals("catalog.expectedEntry", code(removed.resolve(saved().copy(entryId = "gone"), true)))
        assertEquals("Saved Fighter", saved().savedTitle)
    }

    @Test fun updatesUseCurrentContentWithoutMutatingAcknowledgment() = run {
        val source = Source()
        source.manifests = listOf(standard, custom.copy(revision = "2"))
        val a = catalog(source)
        assertEquals("2", a.packages.last().revision)
        val old = saved().copy(acknowledgedFingerprint = "old")
        val result = assertIs<ContractResult.Available<ResolvedEntry>>(a.resolve(old))
        assertEquals("2", result.value.supplier.revision)
        assertTrue(result.value.acknowledgmentRequired)
        assertEquals("old", old.acknowledgedFingerprint)
        assertFalse(value(a.resolve(saved())).acknowledgmentRequired)
    }

    @Test fun dependenciesRequireEnabledInstalledExactRevisionsAndRejectCycles() = run {
        for (dependency in listOf(PackageRevision("missing", "1"), PackageRevision(standard.id, "wrong"), PackageRevision(custom.id, "1"))) {
            val source = Source()
            source.manifests = listOf(standard, custom.copy(dependencies = listOf(dependency)))
            val a = catalog(source)
            assertEquals(listOf(standard.id), a.packages.map { it.id })
            assertTrue(a.diagnostics.any { it.code == "catalog.packageUnavailable" })
            assertEquals("catalog.expectedSupplier", code(a.resolve(saved())))
        }
        val source = Source()
        source.manifests += custom.copy(id = "disabled")
        source.manifests = source.manifests.map { if (it.id == custom.id) it.copy(dependencies = listOf(PackageRevision("disabled", "1"))) else it }
        assertEquals(listOf(standard.id), catalog(source).packages.map { it.id })
        source.manifests = listOf(standard.copy(dependencies = listOf(PackageRevision(custom.id, "1"))), custom)
        assertEquals("catalog.standardUnavailable", code(ContentCatalog.open(source, standard.id, enabled)))
    }

    @Test fun invalidConfigurationsAndMetadataAreExplicit() = run {
        val source = Source()
        assertEquals("catalog.duplicatePackage", code(ContentCatalog.open(source, standard.id, enabled + enabled)))
        source.manifests += standard
        assertEquals("catalog.duplicatePackage", code(ContentCatalog.open(source, standard.id, emptyList())))
        source.manifests = listOf(standard, custom)
        val index = source.indexes.getValue(custom.id)
        source.indexes[custom.id] = ContentIndex(index.entries + index.entries)
        assertEquals("catalog.index", code(ContentCatalog.open(source, standard.id, enabled)))
        source.indexes[custom.id] = ContentIndex(listOf(index.entries.single().copy(chunkId = "undeclared")))
        assertEquals("catalog.index", code(ContentCatalog.open(source, standard.id, enabled)))
    }

    @Test fun missingPackagesLeaveUnrelatedContentAccessible() = run {
        val source = Source()
        source.manifests = listOf(standard)
        val a = catalog(source)
        assertTrue(a.diagnostics.any { it.code == "catalog.packageUnavailable" })
        assertEquals(fighter, value(a.lookup(fighter.id))!!.entry)
        assertEquals("catalog.expectedSupplier", code(a.resolve(saved())))
    }

    @Test fun lazyDetailFailuresAndUnadaptedMechanicsRemainExplicit() = run {
        val source = Source()
        val a = catalog(source)
        source.failChunks = true
        assertEquals("io.test", code(a.lookup(fighter.id)))
        source.failChunks = false
        source.chunks[custom.id] = EntryChunk("classes", emptyList())
        assertEquals("catalog.chunk", code(a.lookup(fighter.id)))
        source.chunks[custom.id] = EntryChunk("classes", listOf(override.copy(
            mechanics = Mechanics(prerequisites = listOf(Prerequisite.Unadapted("Strength 13"))), coverage = Coverage(CoverageStatus.SUPPORTED))))
        val result = assertIs<ContractResult.Available<ResolvedEntry?>>(a.lookup(fighter.id))
        assertTrue(result.diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION })
        assertIs<Prerequisite.Unadapted>(result.value!!.entry.mechanics.prerequisites.single())
    }

    @Test fun referencesUseWinningDefinitionsAndReportOrdinaryMisses() = run {
        val source = Source()
        val a = catalog(source)
        val origin = ResolvedEntry(fighter.copy(presentation = fighter.presentation.copy(references = listOf(fighter.id, "missing"))), PackageRevision(standard.id, "1"), "unused")
        val references = a.resolveReferences(origin)
        assertEquals(override, value(references.getValue(fighter.id))!!.entry)
        assertNull(value(references.getValue("missing")))
    }
    @Test fun malformedChunksNeverSupplyPartialOrAmbiguousDefinitions() = run {
        for (chunk in listOf(
            EntryChunk("wrong", listOf(override)),
            EntryChunk("classes", listOf(override, override)),
            EntryChunk("classes", listOf(override.copy(category = EntryCategory.FEAT))),
            EntryChunk("classes", listOf(override.copy(presentation = Presentation("Wrong title")))),
        )) {
            val source = Source()
            source.chunks[custom.id] = chunk
            assertEquals("catalog.chunk", code(catalog(source).lookup(fighter.id)))
        }
    }

    @Test fun adapterFailuresSurviveCatalogConstruction() = run {
        val failed = ContractResult.Unavailable(listOf(Diagnostic("io.test", DiagnosticKind.IO_FAILURE, "Read failed")))
        val source = object : ContentSource {
            override suspend fun listPackages(): ContractResult<List<PackageManifest>> = failed
            override suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex> = failed
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> = failed
        }
        assertEquals(failed, ContentCatalog.open(source, standard.id, emptyList()))
        val indexFailure = object : ContentSource by source {
            override suspend fun listPackages() = ContractResult.Available(listOf(standard))
        }
        assertEquals(failed, ContentCatalog.open(indexFailure, standard.id, emptyList()))
    }}
