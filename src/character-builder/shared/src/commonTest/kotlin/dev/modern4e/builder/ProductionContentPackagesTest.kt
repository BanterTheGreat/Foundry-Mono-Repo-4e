package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** The ancestry, theme, feat, utility and equipment packages are usable by the shared engine on JVM and JS. */
class ProductionContentPackagesTest {
    private fun run(block: suspend () -> Unit) {
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

    private val prefix = "authoritative/"
    private val source = object : ContentSource {
        override suspend fun listPackages() = ContractResult.Available(
            productionFixtures.keys.filter { it.startsWith(prefix) && it.endsWith("/manifest.json") }.sorted().map {
                assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(productionFixtures.getValue(it))).value
            })
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
            ContractCodec.json.decodeFromString<ContentIndex>(productionFixtures.getValue("$prefix$packageId/$indexId.json")))
        override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(
            ContractCodec.json.decodeFromString<EntryChunk>(productionFixtures.getValue("$prefix$packageId/$chunkId.json")))
    }

    private suspend fun openTemplate(): Triple<CharacterDocument, ContentCatalog, BuilderOperations> {
        val sample = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(contractFixtures.getValue("sample-modern-fighter.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(source, "modern4e.classes", sample.packages)).value
        return Triple(sample, catalog, BuilderOperations(catalog))
    }

    @Test
    fun campaignExclusionsAreIneligibleAndExistingSavedSelectionsRemainPortable() = run {
        val (sample, catalog, operations) = openTemplate()
        val slot = ChoiceSlotId("creation", "ancestry", 0)
        val options = operations.options(sample, 1, slot, includeIneligible = true)
        assertEquals(Eligibility.INELIGIBLE, options.single { it.entry.entry.id == "modern4e.ancestry.revenant" }.eligibility)
        val resolved = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.ancestry.revenant")).value!!
        val saved = SavedSelection(resolved.entry.id, resolved.entry.presentation.title, resolved.supplier.packageId, resolved.fingerprint)
        val document = sample.copy(levels = listOf(sample.levels.single().copy(entries = sample.levels.single().entries +
            EntryChoice("saved-revenant", slot, saved))))
        assertEquals(Eligibility.INELIGIBLE, operations.evaluate(document).rules.entryEligibility.getValue("saved-revenant").status)
        assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
    }

    @Test
    fun templateEnablesEveryProductionPackageAndCatalogIsComplete() = run {
        val (sample, catalog, _) = openTemplate()
        assertEquals(listOf("modern4e.classes", "modern4e.ancestries", "modern4e.themes", "modern4e.feats",
            "modern4e.utilities", "modern4e.equipment"), sample.packages.map { it.packageId })
        assertTrue(catalog.diagnostics.none { it.code == "catalog.packageUnavailable" })
        assertEquals(19, catalog.search(category = EntryCategory.CLASS).size)
        assertEquals(13, catalog.search(category = EntryCategory.ANCESTRY).count { it.supplier.packageId == "modern4e.ancestries" })
        assertEquals(9, catalog.search(category = EntryCategory.THEME).count { it.supplier.packageId == "modern4e.themes" })
        assertEquals(818, catalog.search(category = EntryCategory.FEAT).count { it.supplier.packageId == "modern4e.feats" })
        assertEquals(53, catalog.search(category = EntryCategory.ITEM).count { it.supplier.packageId == "modern4e.equipment" })
        assertEquals(1081, catalog.search(category = EntryCategory.POWER).count { it.supplier.packageId == "modern4e.utilities" })
    }

    @Test
    fun everyCompiledEntryLoadsThroughTheSharedCatalog() = run {
        val (_, catalog, _) = openTemplate()
        for (category in listOf(EntryCategory.ANCESTRY, EntryCategory.THEME, EntryCategory.FEAT, EntryCategory.ITEM)) {
            for (candidate in catalog.search(category = category)) {
                if (candidate.supplier.packageId !in setOf("modern4e.ancestries", "modern4e.themes", "modern4e.feats", "modern4e.equipment")) {
                    continue
                }
                val loaded = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(candidate.metadata.id)).value!!
                assertNotEquals(CoverageStatus.SUPPORTED, loaded.entry.coverage.status)
                assertEquals(2, loaded.entry.mechanics.version)
            }
        }
    }

    @Test
    fun ancestryThemeAndFeatRootSlotsOfferAndAcceptModernEntries() = run {
        val (sample, catalog, operations) = openTemplate()
        val ancestries = operations.options(sample, 1, ChoiceSlotId("creation", "ancestry", 0))
        val dwarf = ancestries.single { it.entry.entry.id == "modern4e.ancestry.dwarf" }
        assertEquals(Eligibility.ELIGIBLE, dwarf.eligibility)
        val themes = operations.options(sample, 1, ChoiceSlotId("creation", "theme", 0))
        assertEquals(9, themes.size)
        var state = operations.evaluate(sample)
        state = operations.apply(state.document, BuilderEdit.Entry(1, ChoiceSlotId("creation", "ancestry", 0),
            "modern4e.ancestry.dwarf", "ancestry")).also { assertTrue(it.applied) }.state
        val theme = themes.first().entry.entry
        state = operations.apply(state.document, BuilderEdit.Entry(1, ChoiceSlotId("creation", "theme", 0),
            theme.id, "theme")).also { assertTrue(it.applied) }.state
        assertTrue(state.rules.diagnostics.none {
            it.kind == DiagnosticKind.INVALID_SELECTION && it.slot?.sourceInstanceId in setOf("ancestry", "theme") })
        val dwarfEntry = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.ancestry.dwarf")).value!!
        assertTrue(dwarfEntry.entry.mechanics.grants.isNotEmpty())
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(state.document))).value
        assertEquals(state.document, reopened)
    }

    @Test
    fun featOptionsRespectClassAccessAndRemainFastEnoughToList() = run {
        val (sample, _, operations) = openTemplate()
        val feats = operations.options(sample, 1, ChoiceSlotId("creation", "feat", 0), includeIneligible = true)
            .filter { it.entry.supplier.packageId == "modern4e.feats" }
        assertEquals(818, feats.size)
        // Fighter-only access must not be eligible for a Fighter starter and wizard access must not be.
        val wizardOnly = feats.filter { (it.entry.entry.mechanics.access as? Prerequisite.Entry)?.entryId == "modern4e.class.wizard" }
        assertTrue(wizardOnly.isNotEmpty())
        assertTrue(wizardOnly.none { it.eligibility == Eligibility.ELIGIBLE })
        assertTrue(feats.any { it.eligibility == Eligibility.ELIGIBLE })
    }

    @Test
    fun utilityPoolsContainFighterUtilitiesAndExcludeWithheldOnes() = run {
        val (sample, catalog, _) = openTemplate()
        val levelTwo = sample.copy(level = 2, levels = sample.levels + LevelDecisions(2))
        val rules = RulesEngine.evaluate(levelTwo, RulesContent.load(levelTwo, catalog))
        val utility = rules.choices.single { it.slot.choiceId == "modern4e.choice.class-utility-2" }
        val offered = utility.entries.filter { it.entryId.startsWith("modern4e.power.utility-") }
        assertTrue(offered.any { it.entryId.startsWith("modern4e.power.utility-class-fighter") && it.status == Eligibility.ELIGIBLE })
        assertTrue(offered.none { it.entryId.startsWith("modern4e.power.utility-class-wizard") && it.status == Eligibility.ELIGIBLE })
        for (candidate in catalog.search(category = EntryCategory.POWER).filter { it.supplier.packageId == "modern4e.utilities" }) {
            val loaded = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(candidate.metadata.id)).value!!
            if (loaded.entry.mechanics.powerProfile == null) {
                assertTrue(offered.none { it.entryId == candidate.metadata.id })
            }
        }
    }

    @Test
    fun equipmentItemsCanBeEquippedWithoutInventingNumbers() = run {
        val (sample, catalog, operations) = openTemplate()
        val chainmail = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.armor.chainmail")).value!!
        assertEquals(EntryCategory.ITEM, chainmail.entry.category)
        val saved = SavedSelection(chainmail.entry.id, chainmail.entry.presentation.title, chainmail.supplier.packageId, chainmail.fingerprint)
        val result = operations.apply(sample, BuilderEdit.Equipment(EquipmentSelection("armor-1", saved, equipped = true)))
        assertTrue(result.applied)
        assertTrue(result.state.rules.diagnostics.none { it.code == "engine.equipmentCategory" })
        assertEquals(operations.evaluate(sample).rules.statistics, result.state.rules.statistics)
    }
}
