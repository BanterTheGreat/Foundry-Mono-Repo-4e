package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Exercises the production pipeline's exact JSON bytes through the runtime catalog. */
class ProductionCatalogTest {
    @Test
    fun generatedPackagesSupportLazyOverridesAndMissingSupplierProtection() {
        var completed = false
        var failure: Throwable? = null
        val block: suspend () -> Unit = {
            val json = ContractCodec.json
            val ids = listOf("modern4e.classes", CurrentDataFixtures.overrideId)
            var reads = 0
            val source = object : ContentSource {
                override suspend fun listPackages() = ContractResult.Available(ids.map {
                    assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(productionFixtures.getValue((if (it == ids.first()) "authoritative/" else "") + "$it/manifest.json"))).value
                })
                override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
                    json.decodeFromString<ContentIndex>(productionFixtures.getValue((if (packageId == ids.first()) "authoritative/" else "") + "$packageId/$indexId.json")))
                override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                    reads++
                    return ContractResult.Available(json.decodeFromString<EntryChunk>(productionFixtures.getValue((if (packageId == ids.first()) "authoritative/" else "") + "$packageId/$chunkId.json")))
                }
            }
            val manifests = source.listPackages().value
            val standard = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, ids.first(), emptyList())).value
            val custom = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, ids.first(), listOf(PackageRevision(ids.last(), manifests.last().revision)))).value
            assertEquals(standard.search().size, custom.search().size)
            assertTrue(custom.search("modern4e.class.fighter").isNotEmpty())
            assertEquals(0, reads)
            val base = assertIs<ContractResult.Available<ResolvedEntry?>>(standard.lookup("modern4e.class.fighter")).value!!
            val replacement = assertIs<ContractResult.Available<ResolvedEntry?>>(custom.lookup("modern4e.class.fighter"))
            val resolved = replacement.value!!
            assertEquals(ids.last(), resolved.supplier.packageId)
            assertNotEquals(base.fingerprint, resolved.fingerprint)
            assertEquals(base.entry.mechanics, resolved.entry.mechanics)
            assertTrue(resolved.entry.presentation.description.contains("Test-only presentation override"))
            assertFalse(replacement.diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION })
            val saved = SavedSelection(resolved.entry.id, resolved.entry.presentation.title, resolved.supplier.packageId, resolved.fingerprint)
            assertIs<ContractResult.Unavailable>(standard.resolve(saved))
            assertEquals(base.entry, assertIs<ContractResult.Available<ResolvedEntry>>(standard.resolve(saved, deliberatePackageSwitch = true)).value.entry)
            assertFalse(assertIs<ContractResult.Available<ResolvedEntry>>(custom.resolve(saved)).value.acknowledgmentRequired)
        }
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
}
