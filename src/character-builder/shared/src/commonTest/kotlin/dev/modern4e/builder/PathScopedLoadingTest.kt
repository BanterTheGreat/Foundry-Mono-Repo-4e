package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Path scope is decided from index rows and acquired qualifications before candidate definitions load. */
class PathScopedLoadingTest {
    private val slot = ChoiceSlotId("advancement.11", "paragon-path", 0)
    private fun entry(id: String, category: EntryCategory, mechanics: Mechanics = Mechanics(version = 2)) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))
    private val fighter = entry("fighter", EntryCategory.CLASS,
        Mechanics(version = 2, choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH)))))
    private val wizard = entry("wizard", EntryCategory.CLASS)
    private val multiclass = entry("multiclass", EntryCategory.FEAT, Mechanics(version = 2, multiclassFor = wizard.id))
    private val pathScopes = mapOf("fighter-path" to listOf("fighter"), "wizard-path" to listOf("wizard"),
        "shared-path" to listOf("fighter", "wizard"), "legacy-path" to emptyList(), "theme-path" to emptyList())
    private val paths = pathScopes.keys.map { id -> entry(id, EntryCategory.PARAGON_PATH,
        Mechanics(version = 2, access = when (id) {
            "fighter-path" -> Prerequisite.Entry("fighter")
            "wizard-path" -> Prerequisite.Entry("wizard")
            else -> Prerequisite.Always
        })) }

    private class Source(val definitions: List<ContentEntry>, val scopes: Map<String, List<String>>) : ContentSource {
        val reads = mutableListOf<String>()
        override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(formatVersion = 2,
            id = "standard", revision = "1", title = "Paths", indexes = listOf("index"), chunks = definitions.map { it.id })))
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
            definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, it.id,
                pathClassIds = scopes[it.id].orEmpty()) }))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            reads += chunkId
            return ContractResult.Available(EntryChunk(chunkId, definitions.filter { it.id == chunkId }))
        }
    }

    private fun selection(entry: ContentEntry, slot: ChoiceSlotId, instance: String = entry.id) = EntryChoice(instance,
        slot, SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry)))

    private fun document(multiclassLevel: Int? = null) = CharacterDocument(id = "paths", savedAt = "2026-11-19T12:00:00Z",
        identity = CharacterIdentity("Fighter"), packages = emptyList(), level = 19,
        abilities = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.CONSTITUTION to 2, Ability.DEXTERITY to 2, Ability.INTELLIGENCE to 1)),
        levels = (1..19).map { level -> LevelDecisions(level, entries = when (level) {
            1 -> listOf(selection(fighter, ChoiceSlotId("creation", "class", 0)))
            multiclassLevel -> listOf(selection(multiclass, ChoiceSlotId("advancement.$level", "feat", 0)))
            else -> emptyList()
        }) })

    private suspend fun catalog(source: ContentSource) = assertIs<ContractResult.Available<ContentCatalog>>(
        ContentCatalog.open(source, "standard", emptyList())).value

    @Test
    fun unrelatedPathChunksAreNeverLoadedOrCheckedButSharedAndLegacyRowsRemain() = run {
        val source = Source(listOf(fighter, wizard, multiclass) + paths, pathScopes)
        val catalog = catalog(source)
        val operations = BuilderOperations(catalog)
        val listing = operations.optionListing(document(), 11, slot)
        val ids = listing.rows().map { it.metadata.metadata.id }
        assertEquals(setOf("fighter-path", "shared-path", "legacy-path", "theme-path"), ids.toSet())
        assertEquals(listOf("fighter"), source.reads)
        assertTrue(listing.check(listOf("wizard-path")).isEmpty())
        assertTrue(listing.check(ids).all { it.checked })
        assertFalse("wizard-path" in source.reads)
        assertFalse("wizard" in source.reads)
        source.reads.clear()
        assertEquals(ids.toSet(), operations.options(document(), 11, slot, true).map { it.entry.entry.id }.toSet())
        assertFalse("wizard-path" in source.reads)
        assertNotNull(assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("wizard-path")).value,
            "Scope does not remove definitions or saved selections from the catalog")
    }

    @Test
    fun multiclassScopeUsesOnlyQualificationsAcquiredByThePathLevel() = run {
        val source = Source(listOf(fighter, wizard, multiclass) + paths, pathScopes)
        val operations = BuilderOperations(catalog(source))
        val earlier = operations.optionListing(document(10), 11, slot).rows().map { it.metadata.metadata.id }
        assertTrue("wizard-path" in earlier)
        assertFalse("wizard-path" in source.reads, "Scope discovery must not read path definitions")
        source.reads.clear()
        val later = operations.optionListing(document(12), 11, slot).rows().map { it.metadata.metadata.id }
        assertFalse("wizard-path" in later)
        assertFalse("multiclass" in source.reads, "Later feats cannot qualify an earlier path")
    }

    @Test
    fun activeGrantedMulticlassFeatsQualifyWithoutReadingUnrelatedGrantedPowers() = run {
        val grantedFeat = multiclass.copy(id = "granted-multiclass")
        val power = entry("unused-power", EntryCategory.POWER)
        val feature = entry("feature", EntryCategory.FEATURE,
            Mechanics(version = 2, grants = listOf(Grant.Entry("qualification", grantedFeat.id, atLevel = 11))))
        val root = fighter.copy(mechanics = fighter.mechanics.copy(grants = listOf(
            Grant.Entry("feature", feature.id), Grant.Entry("power", power.id))))
        val source = Source(listOf(root, wizard, grantedFeat, feature, power) + paths, pathScopes)
        val selected = document().let { doc -> doc.copy(levels = doc.levels.map { row ->
            if (row.level == 1) row.copy(entries = listOf(selection(root, ChoiceSlotId("creation", "class", 0)))) else row
        }) }
        val operations = BuilderOperations(catalog(source))
        assertTrue(operations.optionListing(selected, 11, slot).rows().any { it.metadata.metadata.id == "wizard-path" })
        assertEquals(setOf(root.id, feature.id, grantedFeat.id), source.reads.toSet())
    }

    @Test
    fun themeGrantsCanQualifyAndCyclicOrMissingGrantsKeepScopeConservative() = run {
        val theme = entry("theme", EntryCategory.THEME,
            Mechanics(version = 2, grants = listOf(Grant.Entry("multiclass", multiclass.id))))
        val source = Source(listOf(fighter, wizard, multiclass, theme) + paths, pathScopes)
        val selected = document().let { doc -> doc.copy(levels = doc.levels.map { row ->
            if (row.level == 1) row.copy(entries = row.entries + selection(theme, ChoiceSlotId("creation", "theme", 0))) else row
        }) }
        assertTrue(BuilderOperations(catalog(source)).optionListing(selected, 11, slot).rows()
            .any { it.metadata.metadata.id == "wizard-path" })

        val cyclic = fighter.copy(mechanics = fighter.mechanics.copy(grants = listOf(Grant.Entry("cycle", fighter.id))))
        val cycleSource = Source(listOf(cyclic, wizard) + paths, pathScopes)
        val cycleDocument = document().let { doc -> doc.copy(levels = doc.levels.map { row ->
            if (row.level == 1) row.copy(entries = listOf(selection(cyclic, ChoiceSlotId("creation", "class", 0)))) else row
        }) }
        val rows = BuilderOperations(catalog(cycleSource)).optionListing(cycleDocument, 11, slot).rows()
        assertEquals(pathScopes.keys, rows.map { it.metadata.metadata.id }.toSet())
        assertTrue(cycleSource.reads.size <= 2, "Cycles stop before following another generated instance")

        val missing = fighter.copy(mechanics = fighter.mechanics.copy(grants = listOf(Grant.Entry("missing", "missing-feature"))))
        val missingSource = Source(listOf(missing, wizard) + paths, pathScopes)
        val missingDocument = document().let { doc -> doc.copy(levels = doc.levels.map { row ->
            if (row.level == 1) row.copy(entries = listOf(selection(missing, ChoiceSlotId("creation", "class", 0)))) else row
        }) }
        assertEquals(pathScopes.keys, BuilderOperations(catalog(missingSource)).optionListing(missingDocument, 11, slot)
            .rows().map { it.metadata.metadata.id }.toSet())
    }

    @Test
    fun productionFighterRowsExcludeOtherClassPathsAndKeepZeitgeistPathsWithoutPathReads() = run {
        val reads = mutableListOf<Pair<String, String>>()
        val source = object : ContentSource {
            override suspend fun listPackages() = CurrentDataFixtures.listPackages()
            override suspend fun loadIndex(packageId: String, indexId: String) = CurrentDataFixtures.loadIndex(packageId, indexId)
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads += packageId to chunkId
                return CurrentDataFixtures.loadChunk(packageId, chunkId)
            }
        }
        val base = CurrentDataFixtures.sample()
        val document = base.copy(level = 11, levels = base.levels + (2..11).map(::LevelDecisions))
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(source, "modern4e.classes", document.packages)).value
        val rows = BuilderOperations(catalog).optionListing(document, 11, slot).rows().map { it.metadata.metadata }
        assertTrue(rows.any { "modern4e.class.fighter" in it.pathClassIds })
        assertTrue(rows.any { it.id == "modern4e.path.notorious-celebrity" && it.pathClassIds.isEmpty() })
        assertTrue(rows.all { it.pathClassIds.isEmpty() || "modern4e.class.fighter" in it.pathClassIds })
        assertFalse(reads.any { it.first == "modern4e.paths" }, "No path definition is needed to choose the candidate set")
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
