package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Both JVM and JS consume the exact authoritative bytes bundled by the platforms. */
class ProductionClassPackageTest {
    @Test
    fun authoritativePackageLoadsCompleteClassesAndPreservesSavedIdentities() {
        var completed = false
        var failure: Throwable? = null
        val block: suspend () -> Unit = {
            val prefix = "authoritative/"
            val packageIds = productionFixtures.keys.filter { it.startsWith(prefix) && it.endsWith("/manifest.json") }
                .map { it.removePrefix(prefix).substringBefore('/') }
            val source = object : ContentSource {
                override suspend fun listPackages() = ContractResult.Available(packageIds.map {
                    assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(
                        productionFixtures.getValue("$prefix$it/manifest.json"))).value
                })
                override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
                    ContractCodec.json.decodeFromString<ContentIndex>(productionFixtures.getValue("$prefix$packageId/$indexId.json")))
                override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(
                    ContractCodec.json.decodeFromString<EntryChunk>(productionFixtures.getValue("$prefix$packageId/$chunkId.json")))
            }
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
                ContentCatalog.open(source, "modern4e.classes", emptyList())).value
            assertEquals(19, catalog.search(category = EntryCategory.CLASS).size)
            assertTrue(catalog.search("class3").isEmpty())
            val fighter = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.class.fighter")).value!!
            assertNotNull(fighter.entry.sharedData?.get("flavor"))
            assertEquals(18, fighter.entry.mechanics.classProfile!!.statistics.getValue(Statistic.HIT_POINTS).base)
            assertNotEquals(CoverageStatus.SUPPORTED, fighter.entry.coverage.status)
            val sample = assertIs<ContractResult.Available<CharacterDocument>>(
                ContractCodec.decode(contractFixtures.getValue("sample-modern-fighter.json"))).value
            val saved = sample.levels.first().entries.first().selection
            assertEquals(fighter.fingerprint, saved.acknowledgedFingerprint)
            assertFalse(assertIs<ContractResult.Available<ResolvedEntry>>(catalog.resolve(saved)).value.acknowledgmentRequired)
            val legacy = assertIs<ContractResult.Available<CharacterDocument>>(
                ContractCodec.decode(contractFixtures.getValue("sample-fighter-1-base.json"))).value
            val oldChoice = legacy.levels.first().entries.first().selection
            assertEquals("class3", oldChoice.entryId)
            assertIs<ContractResult.Unavailable>(catalog.resolve(oldChoice))
            val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(legacy))).value
            assertEquals(oldChoice, reopened.levels.first().entries.first().selection)
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
