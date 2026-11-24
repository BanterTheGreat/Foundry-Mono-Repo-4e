package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Sorcerer Spell Source and Warlock Eldritch Pact open the split reader with each option's granted powers loaded. */
class SplitFeatureReaderTest {
    private fun run(block: suspend () -> Unit) {
        var result: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) { result = value }
        })
        checkNotNull(result).getOrThrow()
    }

    @Test fun warlockPactRowsCarryTheirGrantedPowersButOtherFeatureChoicesDoNot() = run {
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
        val sample = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(contractFixtures.getValue("sample-modern-fighter.json"))).value
        val warlock = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.class.warlock")).value!!
        val root = sample.levels.first().entries.first()
        val document = sample.copy(levels = listOf(sample.levels.first().copy(entries = listOf(root.copy(
            selection = SavedSelection(warlock.entry.id, warlock.entry.presentation.title,
                warlock.supplier.packageId, warlock.fingerprint))))))
        val rules = RulesEngine.evaluate(document, RulesContent.load(document, catalog))
        val pact = rules.choices.single { it.slot.choiceId == "modern4e.choice.warlock-eldritch-pact" }.slot
        assertTrue(pact.usesSplitFeatureReader())

        val operations = BuilderOperations(catalog)
        val listing = operations.optionListing(document, 1, pact)
        val ids = listing.rows().map { it.metadata.metadata.id }
        assertTrue("modern4e.feature.dark-pact" in ids)
        val dark = listing.check(listOf("modern4e.feature.dark-pact")).single()
        assertEquals(
            setOf("modern4e.power.warlock-darkspiral-aura", "modern4e.power.warlock-spiteful-glamor"),
            dark.advancementDefinitions.keys,
        )
        val plainSlot = rules.choices.first { !it.slot.usesSplitFeatureReader() && it.entries.any { e -> e.entryId.startsWith("modern4e.feature.") } }.slot
        val plain = operations.optionListing(document, 1, plainSlot)
        val plainIds = plain.rows().map { it.metadata.metadata.id }
        assertTrue(plainIds.isNotEmpty())
        assertTrue(plain.check(plainIds).all { it.advancementDefinitions.isEmpty() })
    }
}
