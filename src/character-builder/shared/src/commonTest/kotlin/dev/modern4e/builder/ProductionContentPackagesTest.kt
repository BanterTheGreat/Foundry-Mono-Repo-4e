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
    fun knownRitualsAndFormulasUseActiveAccessAndRoundTripPortableSelections() = run {
        val (sample, catalog, operations) = openTemplate()
        val ritual = "modern4e.ritual.brew-potion"
        assertFalse(operations.apply(sample, BuilderEdit.CraftKnowledge(CraftKnowledgeKind.RITUAL, setOf(ritual))).applied)
        fun feat(id: String) = BuilderEdit.Entry(1, ChoiceSlotId("creation", "feat", 0), id, "knowledge-feat")
        val ritualist = operations.apply(sample, feat("modern4e.feat.technique-master")).also { assertTrue(it.applied) }.state
        val learner = operations.apply(ritualist.document, BuilderEdit.CraftKnowledge(CraftKnowledgeKind.RITUAL, setOf(ritual)))
        assertTrue(learner.applied)
        assertEquals("Brew Potion", learner.state.document.craftKnowledge.single().savedTitle)
        val alchemist = operations.apply(sample, feat("modern4e.feat.alchemist")).also { assertTrue(it.applied) }.state
        val access = alchemist.craftKnowledgeAccess()
        assertTrue("modern4e.ritual.alchemical-creation" in access.grantedRituals)
        val formula = catalog.search(category = EntryCategory.ITEM)
            .filter { CraftKnowledgeKind.FORMULA.matches(it.metadata.id) }
            .first { candidate ->
                val entry = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(candidate.metadata.id)).value!!
                access.canLearn(CraftKnowledgeKind.FORMULA, entry.entry)
            }.metadata.id
        assertFalse(operations.apply(ritualist.document, BuilderEdit.CraftKnowledge(CraftKnowledgeKind.FORMULA, setOf(formula))).applied)
        val trained = operations.apply(alchemist.document, BuilderEdit.CraftKnowledge(CraftKnowledgeKind.FORMULA, setOf(formula)))
        assertTrue(trained.applied)
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(trained.state.document))).value
        assertEquals(listOf(formula), reopened.craftKnowledge.map { it.entryId })
        assertTrue(operations.apply(reopened, BuilderEdit.CraftKnowledge(CraftKnowledgeKind.FORMULA, emptySet()))
            .state.document.craftKnowledge.isEmpty())
    }

    @Test
    fun bardCanSaveSeveralEligibleRitualsWithoutAClassPickQuota() = run {
        val (sample, catalog, operations) = openTemplate()
        val bard = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.class.bard")).value!!
        val document = sample.copy(levels = sample.levels.map { level -> level.copy(entries = level.entries.map {
            if (it.slot == ChoiceSlotId("creation", "class", 0)) {
                it.copy(selection = SavedSelection(bard.entry.id, bard.entry.presentation.title, bard.supplier.packageId, bard.fingerprint))
            } else {
                it
            }
        }) })
        val ids = setOf("modern4e.ritual.brew-potion", "modern4e.ritual.make-whole", "modern4e.ritual.temporary-patch")
        val result = operations.apply(document, BuilderEdit.CraftKnowledge(CraftKnowledgeKind.RITUAL, ids))
        assertTrue(result.applied, result.diagnostics.joinToString())
        assertEquals(ids, result.state.document.craftKnowledge.map { it.entryId }.toSet())
    }

    @Test
    fun campaignExclusionsStayIneligibleWhenEvaluatedAndExistingSavedSelectionsRemainPortable() = run {
        val (sample, catalog, operations) = openTemplate()
        val slot = ChoiceSlotId("creation", "ancestry", 0)
        val options = operations.options(sample, 1, slot, includeIneligible = true)
        // Class and ancestry pickers never check eligibility, so an excluded ancestry is still offered.
        assertEquals(Eligibility.ELIGIBLE, options.single { it.entry.entry.id == "modern4e.ancestry.revenant" }.eligibility)
        val resolved = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.ancestry.revenant")).value!!
        val saved = SavedSelection(resolved.entry.id, resolved.entry.presentation.title, resolved.supplier.packageId, resolved.fingerprint)
        val document = sample.copy(levels = listOf(sample.levels.single().copy(entries = sample.levels.single().entries +
            EntryChoice("saved-revenant", slot, saved))))
        assertEquals(Eligibility.INELIGIBLE, operations.evaluate(document).rules.entryEligibility.getValue("saved-revenant").status)
        assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
    }

    @Test
    fun retiredFeatsHaveNoReplacementAndSavedProvenanceSurvivesReopen() = run {
        val (sample, catalog, operations) = openTemplate()
        val retired = listOf("feral-companion", "fey-charge", "combat-opening", "elusive-hexer")
        for (id in retired.map { "modern4e.feat.$it" }) {
            assertNull(assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(id)).value)
            val original = SavedSelection(id, "Original saved title", "modern4e.feats", "retired-fingerprint")
            val document = sample.copy(levels = sample.levels.map { level -> level.copy(entries = level.entries +
                EntryChoice("retired", ChoiceSlotId("creation", "feat", 0), original)) })
            val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value
            assertEquals(original, reopened.levels.first().entries.single { it.instanceId == "retired" }.selection)
            assertTrue(operations.evaluate(reopened).rules.diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT && it.entryId == id })
        }
    }

    @Test
    fun templateEnablesEveryProductionPackageAndCatalogIsComplete() = run {
        val (sample, catalog, _) = openTemplate()
        assertEquals(listOf("modern4e.classes", "modern4e.ancestries", "modern4e.themes", "modern4e.feats",
            "modern4e.utilities", "modern4e.equipment", "modern4e.paths", "modern4e.rituals", "modern4e.formulas"),
            sample.packages.map { it.packageId })
        assertTrue(catalog.diagnostics.none { it.code == "catalog.packageUnavailable" })
        assertEquals(19, catalog.search(category = EntryCategory.CLASS).size)
        assertEquals(13, catalog.search(category = EntryCategory.ANCESTRY).count { it.supplier.packageId == "modern4e.ancestries" })
        assertEquals(9, catalog.search(category = EntryCategory.THEME).count { it.supplier.packageId == "modern4e.themes" })
        assertEquals(798, catalog.search(category = EntryCategory.FEAT).count { it.supplier.packageId == "modern4e.feats" })
        assertEquals(60, catalog.search(category = EntryCategory.ITEM).count { it.supplier.packageId == "modern4e.equipment" })
        assertEquals(1046, catalog.search(category = EntryCategory.POWER).count { it.supplier.packageId == "modern4e.utilities" })
        assertEquals(83, catalog.search(category = EntryCategory.ITEM).count { it.supplier.packageId == "modern4e.rituals" })
        assertEquals(79, catalog.search(category = EntryCategory.ITEM).count { it.supplier.packageId == "modern4e.formulas" })
    }

    @Test
    fun everyCompiledEntryLoadsThroughTheSharedCatalog() = run {
        val (_, catalog, _) = openTemplate()
        for (category in listOf(EntryCategory.ANCESTRY, EntryCategory.THEME, EntryCategory.FEAT, EntryCategory.ITEM)) {
            for (candidate in catalog.search(category = category)) {
                if (candidate.supplier.packageId !in setOf("modern4e.ancestries", "modern4e.themes", "modern4e.feats",
                        "modern4e.equipment", "modern4e.rituals", "modern4e.formulas")) {
                    continue
                }
                val loaded = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(candidate.metadata.id)).value!!
                assertEquals(loaded.entry.coverage.limitations.isEmpty(), loaded.entry.coverage.status == CoverageStatus.SUPPORTED)
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
    fun fighterAndSkyseerDisplayRolesPreserveEngineGrantsAndChoices() = run {
        val (sample, _, operations) = openTemplate()
        val skyseer = operations.apply(sample, BuilderEdit.Entry(1, ChoiceSlotId("creation", "theme", 0),
            "modern4e.theme.skyseer", "skyseer"))
        assertTrue(skyseer.applied)
        val rules = skyseer.state.rules
        val entries = rules.entries.associateBy { it.definition.entry.id }
        for (name in listOf("reactivity", "specialization")) {
            val feature = entries.getValue("modern4e.feature.fighter-$name")
            assertEquals(GrantDisplay.CHOICE_INTRODUCTION, feature.definition.entry.presentation.grantDisplay)
            assertTrue(rules.choices.any { it.slot.sourceInstanceId == feature.instanceId })
        }
        assertEquals(GrantDisplay.GRANT_SUMMARY,
            entries.getValue("modern4e.feature.skyseer-level-1").definition.entry.presentation.grantDisplay)
        for (id in listOf("skyseer-vision", "look-skyward")) {
            val power = entries.getValue("modern4e.power.$id")
            assertTrue(power.granted)
            assertEquals(GrantDisplay.STANDALONE, power.definition.entry.presentation.grantDisplay)
        }
    }

    @Test
    fun featOptionsRespectClassAccessAndRemainFastEnoughToList() = run {
        val (sample, _, operations) = openTemplate()
        val feats = operations.options(sample, 1, ChoiceSlotId("creation", "feat", 0), includeIneligible = true)
            .filter { it.entry.supplier.packageId == "modern4e.feats" }
        assertEquals(798, feats.size)
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
        // Former deferred utilities are ordinary pool members; a level-8 Fighter utility is above the level-2 ceiling.
        assertTrue(offered.none { it.entryId == "modern4e.power.utility-class-deferred-power12677" })
        for (candidate in catalog.search(category = EntryCategory.POWER).filter { it.supplier.packageId == "modern4e.utilities" }) {
            val loaded = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(candidate.metadata.id)).value!!
            if (loaded.entry.mechanics.powerProfile == null) {
                assertTrue(offered.none { it.entryId == candidate.metadata.id })
            }
        }
    }

    @Test
    fun formerlyDeferredOffSlotUtilitiesJoinTheirClassPoolAtTheirLevel() = run {
        val (sample, catalog, _) = openTemplate()
        val levelTen = sample.copy(level = 10, levels = sample.levels + (2..10).map { LevelDecisions(it) })
        val rules = RulesEngine.evaluate(levelTen, RulesContent.load(levelTen, catalog))
        val utility = rules.choices.single { it.slot.choiceId == "modern4e.choice.class-utility-10" }
        // Shield Block is a level-8 Fighter utility: not a 2/6/10 slot level, yet offered by the level-10 slot.
        assertTrue(utility.entries.any { it.entryId == "modern4e.power.utility-class-deferred-power12677" && it.status == Eligibility.ELIGIBLE })
    }

    @Test
    fun authoredArmorFeatGrantsPlateAndBlocksAnotherSelectionThroughTheNormalWorkflow() = run {
        val (sample, _, operations) = openTemplate()
        val result = operations.apply(sample, BuilderEdit.Entry(1, ChoiceSlotId("creation", "feat", 0),
            "modern4e.feat.armor-proficiency", "armor"))
        assertTrue(result.applied)
        assertEquals(Eligibility.ELIGIBLE, result.state.rules.entryEligibility.getValue("armor").status)
        assertEquals(listOf(ChoiceSlotId("creation", "feat", 0)), result.state.rules.equipmentProficiencies.getValue("PLATE"))
        val levelTwo = result.state.document.copy(level = 2, levels = result.state.document.levels + LevelDecisions(2))
        val selected = result.state.document.levels.first().entries.single { it.instanceId == "armor" }
        val repeated = levelTwo.copy(levels = levelTwo.levels.map { level ->
            if (level.level == 2) level.copy(entries = listOf(selected.copy(instanceId = "second-armor",
                slot = ChoiceSlotId("advancement.2", "feat", 0)))) else level
        })
        assertEquals(Eligibility.INELIGIBLE, operations.evaluate(repeated).rules.entryEligibility.getValue("second-armor").status)
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(levelTwo))).value
        assertEquals(result.state.rules.equipmentProficiencies, operations.evaluate(reopened).rules.equipmentProficiencies)
    }

    @Test
    fun equippingArmorUsesItsDefenseBonusWithoutChangingOtherStatistics() = run {
        val (sample, catalog, operations) = openTemplate()
        val chainmail = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.armor.chainmail")).value!!
        assertEquals(EntryCategory.ITEM, chainmail.entry.category)
        val saved = SavedSelection(chainmail.entry.id, chainmail.entry.presentation.title, chainmail.supplier.packageId, chainmail.fingerprint)
        val result = operations.apply(sample, BuilderEdit.Equipment(EquipmentSelection("armor-1", saved, equipped = true)))
        assertTrue(result.applied)
        assertTrue(result.state.rules.diagnostics.none { it.code == "engine.equipmentCategory" })
        val before = operations.evaluate(sample).rules
        val after = result.state.rules
        assertEquals(13, assertIs<ContractResult.Available<CalculatedValue>>(before.displayedDefense(Statistic.AC)).value.total)
        assertEquals(17, assertIs<ContractResult.Available<CalculatedValue>>(after.displayedDefense(Statistic.AC)).value.total)
        val ac = ModifierTarget(Statistic.AC)
        assertEquals(before.statistics - ac, after.statistics - ac)
    }
}
