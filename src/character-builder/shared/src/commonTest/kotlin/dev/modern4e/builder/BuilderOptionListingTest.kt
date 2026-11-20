package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*
import kotlin.time.TimeSource
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

class BuilderOptionListingTest {
    private val slot = ChoiceSlotId("creation", "feat", 0)
    private fun feat(id: String) = ContentEntry(id, EntryCategory.FEAT, Presentation(id),
        Mechanics(version = 2, prerequisites = listOf(Prerequisite.Level(if (id.endsWith("2")) 2 else 1))),
        Coverage(CoverageStatus.SUPPORTED))
    private val definitions = listOf(feat("general-1"), feat("general-2"), feat("class-1"))
    private class Source(
        val entries: MutableMap<String, ContentEntry>,
        val ancestryAccess: Map<String, List<String>> = emptyMap(),
    ) : ContentSource {
        val reads = mutableListOf<String>()
        override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(id = "standard", revision = "1",
            title = "Standard", indexes = listOf("index"), chunks = entries.keys.toList())))
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
            entries.values.map {
                val group = when {
                    it.id in ancestryAccess -> FeatGroup.ANCESTRY
                    it.id.startsWith("general") -> FeatGroup.GENERAL
                    else -> FeatGroup.CLASS
                }
                EntryMetadata(it.id, it.category, it.presentation.title, it.id, group,
                    featAncestryIds = ancestryAccess[it.id].orEmpty())
            }))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            reads += chunkId
            return ContractResult.Available(EntryChunk(chunkId, listOf(entries.getValue(chunkId))))
        }
    }
    private fun document() = CharacterDocument(id = "listing", savedAt = "2026-11-18T00:00:00Z",
        identity = CharacterIdentity("Listing"), packages = emptyList(), level = 1,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()),
        levels = listOf(LevelDecisions(1)))
    private suspend fun operations(source: Source) = BuilderOperations(assertIs<ContractResult.Available<ContentCatalog>>(
        ContentCatalog.open(source, "standard", emptyList())).value)

    @Test fun metadataIsImmediateAndOnlyRequestedRowsAreCheckedAndReused() = run {
        val source = Source(definitions.associateBy { it.id }.toMutableMap())
        val listing = operations(source).optionListing(document(), 1, slot)
        val pending = listing.rows(FeatGroup.GENERAL)
        assertEquals(listOf("general-1", "general-2"), pending.map { it.metadata.metadata.id })
        assertTrue(pending.all { !it.checked && it.option == null })
        assertTrue(source.reads.isEmpty(), "First rows must not wait for any definition/eligibility reads")
        val first = listing.check(listOf("general-1")).single()
        assertTrue(first.checked)
        assertEquals(Eligibility.ELIGIBLE, first.option?.eligibility)
        assertEquals(listOf("general-1"), source.reads)
        assertEquals(listOf(true, false), listing.rows(FeatGroup.GENERAL).map { it.checked })
        assertEquals(first, listing.check(listOf("general-1")).single())
        assertEquals(listOf("general-1"), source.reads, "Reopening/rechecking a row does no more work")
        assertTrue(listing.check(listOf("class-1")).isEmpty(), "Unchecked tabs are not resolved speculatively")
        assertEquals(Eligibility.INELIGIBLE, listing.check(listOf("general-2")).single().option?.eligibility)
        assertTrue(listing.rows(FeatGroup.CLASS).all { !it.checked })
    }

    @Test fun aTabIsCompleteOnlyOnceListedAndEveryRowIsChecked() = run {
        val source = Source(definitions.associateBy { it.id }.toMutableMap())
        val session = operations(source).browsingSession()
        val original = session.optionListing(document(), 1, slot)
        assertFalse(original.isComplete(FeatGroup.GENERAL), "An unlisted tab still has its rows to list")
        original.rows(FeatGroup.GENERAL)
        assertFalse(original.isComplete(FeatGroup.GENERAL))
        original.check(listOf("general-1"))
        assertFalse(original.isComplete(FeatGroup.GENERAL), "One row is still unchecked")
        original.check(listOf("general-2"))
        assertTrue(original.isComplete(FeatGroup.GENERAL))
        assertFalse(original.isComplete(FeatGroup.CLASS), "Tabs complete independently")

        val refreshed = session.nextBrowsingSession().optionListing(document(), 1, slot)
        refreshed.inheritFrom(original) { true }
        assertFalse(refreshed.isComplete(FeatGroup.GENERAL), "A rebased listing lists its rows again first")
        refreshed.rows(FeatGroup.GENERAL)
        assertTrue(refreshed.isComplete(FeatGroup.GENERAL), "Retained results leave nothing to check")

        val partial = session.nextBrowsingSession().optionListing(document(), 1, slot)
        partial.inheritFrom(refreshed) { it.id == "general-1" }
        partial.rows(FeatGroup.GENERAL)
        assertFalse(partial.isComplete(FeatGroup.GENERAL), "Only the affected row remains to check")
        partial.check(listOf("general-2"))
        assertTrue(partial.isComplete(FeatGroup.GENERAL))
    }

    @Test fun rebasingRetainsDefinitionsWithoutMoreChunkReadsAndNeverRevivesPendingEligibility() = run {
        val source = Source(definitions.associateBy { it.id }.toMutableMap())
        val session = operations(source).browsingSession()
        val original = session.optionListing(document(), 1, slot)
        val ids = original.rows(FeatGroup.GENERAL).map { it.metadata.metadata.id }
        val checked = original.check(ids).associateBy { it.metadata.metadata.id }
        val reads = source.reads.toList()

        val nextSession = session.nextBrowsingSession()
        val refreshed = nextSession.optionListing(document(), 1, slot)
        refreshed.inheritFrom(original) { it.id == "general-1" }
        val first = refreshed.rows(FeatGroup.GENERAL).associateBy { it.metadata.metadata.id }
        assertEquals(checked.getValue("general-1"), first.getValue("general-1"))
        assertFalse(first.getValue("general-2").checked)
        assertEquals(checked.getValue("general-2").option?.entry, first.getValue("general-2").option?.entry)
        assertEquals(Eligibility.UNRESOLVED, first.getValue("general-2").option?.eligibility)

        val cancelledRefresh = nextSession.nextBrowsingSession().optionListing(document(), 1, slot)
        cancelledRefresh.inheritFrom(refreshed) { true }
        assertFalse(cancelledRefresh.rows(FeatGroup.GENERAL).single { it.metadata.metadata.id == "general-2" }.checked)
        assertEquals(checked.values.toList(), refreshed.check(ids))
        assertEquals(reads, source.reads, "Neither rebasing nor rechecking decodes the catalog again")
    }

    @Test fun ancestryFeatsAreScopedBeforeDefinitionReads() = run {
        val access = mapOf("elf-feat" to listOf("elf"), "dwarf-feat" to listOf("dwarf"),
            "shared-feat" to listOf("elf", "dwarf"), "legacy-feat" to emptyList())
        val source = Source(access.keys.associateWith(::feat).toMutableMap(), access)
        val ops = operations(source)
        val document = document()
        fun withAncestry(id: String): CharacterDocument {
            val ancestry = EntryChoice("ancestry", ChoiceSlotId("creation", "ancestry", 0),
                SavedSelection(id, id, "standard", "fingerprint"))
            return document.copy(levels = listOf(LevelDecisions(1, entries = listOf(ancestry))))
        }

        val elf = ops.optionListing(withAncestry("elf"), 1, slot)
        assertEquals(setOf("elf-feat", "shared-feat", "legacy-feat"),
            elf.rows(FeatGroup.ANCESTRY).map { it.metadata.metadata.id }.toSet())
        assertTrue(elf.check(listOf("dwarf-feat")).isEmpty())
        assertTrue(source.reads.isEmpty())

        val dwarf = ops.optionListing(withAncestry("dwarf"), 1, slot)
        assertEquals(setOf("dwarf-feat", "shared-feat", "legacy-feat"),
            dwarf.rows(FeatGroup.ANCESTRY).map { it.metadata.metadata.id }.toSet())
        assertEquals(listOf("legacy-feat"), ops.optionListing(document, 1, slot)
            .rows(FeatGroup.ANCESTRY).map { it.metadata.metadata.id })
        assertEquals(access.keys, ops.optionListing(withAncestry("elf"), 1, slot,
            featAncestries = setOf("elf", "dwarf")).rows(FeatGroup.ANCESTRY).map { it.metadata.metadata.id }.toSet())
        assertTrue(source.reads.isEmpty())
    }

    @Test fun freshListingObservesChangedContentAndCharacter() = run {
        val source = Source(definitions.associateBy { it.id }.toMutableMap())
        val ops = operations(source)
        val listing = ops.optionListing(document(), 1, slot)
        listing.rows(FeatGroup.GENERAL)
        val original = listing.check(listOf("general-1")).single()
        val entry = source.entries.getValue("general-1")
        source.entries[entry.id] = entry.copy(mechanics = entry.mechanics.copy(prerequisites = listOf(Prerequisite.Level(2))))
        assertEquals(original, listing.check(listOf(entry.id)).single(), "Explicit snapshots stay internally consistent")
        val fresh = ops.optionListing(document(), 1, slot)
        fresh.rows(FeatGroup.GENERAL)
        assertEquals(Eligibility.INELIGIBLE, fresh.check(listOf(entry.id)).single().option?.eligibility)
        val levelTwo = document().copy(level = 2, levels = listOf(LevelDecisions(1), LevelDecisions(2)))
        val advanced = ops.optionListing(levelTwo, 2, ChoiceSlotId("advancement.2", "feat", 0))
        advanced.rows(FeatGroup.GENERAL)
        assertEquals(Eligibility.ELIGIBLE, advanced.check(listOf(entry.id)).single().option?.eligibility)
    }

    @Test fun listingsFromOneBrowsingSessionShareChunksAndMatchSeparateListings() = run {
        val source = Source(definitions.associateBy { it.id }.toMutableMap())
        val ops = operations(source)
        val character = document().copy(level = 2, levels = listOf(LevelDecisions(1), LevelDecisions(2)))
        val laterSlot = ChoiceSlotId("advancement.2", "feat", 0)
        val ids = listOf("general-1", "general-2")
        suspend fun BuilderOperations.checked(level: Int, slot: ChoiceSlotId): List<BuilderOptionRow> {
            val listing = optionListing(character, level, slot)
            listing.rows(FeatGroup.GENERAL)
            return listing.check(ids)
        }

        ops.checked(1, slot)
        val separateFirst = source.reads.size
        val separate = ops.checked(2, laterSlot)
        assertTrue(source.reads.size > separateFirst, "Without a shared session each listing re-reads its chunks")

        source.reads.clear()
        val session = ops.browsingSession()
        session.checked(1, slot)
        val sessionFirst = source.reads.size
        val shared = session.checked(2, laterSlot)
        assertEquals(sessionFirst, source.reads.size, "A later listing reuses the session's decoded chunks")
        assertEquals(separate.map { it.option?.eligibility }, shared.map { it.option?.eligibility })
        assertEquals(listOf(Eligibility.ELIGIBLE, Eligibility.ELIGIBLE), shared.map { it.option?.eligibility })
    }

    @Test fun checkedThemeResolvesGrantedAndOptionalDefinitionsFromTheCatalog() = run {
        val theme = feat("theme").copy(
            category = EntryCategory.THEME,
            mechanics = Mechanics(grants = listOf(Grant.Entry("feature", "feature", 5),
                Grant.Entry("power", "power"), Grant.Entry("missing", "missing"))),
            sharedData = JsonObject(mapOf("modifications" to JsonArray(
                listOf(JsonPrimitive("modification"), JsonPrimitive("modification"), JsonPrimitive(false))))),
        )
        val feature = feat("feature").copy(category = EntryCategory.FEATURE)
        val power = feat("power").copy(category = EntryCategory.POWER)
        val modification = feat("modification").copy(category = EntryCategory.FEATURE)
        val source = Source(listOf(theme, feature, power, modification).associateBy { it.id }.toMutableMap())
        val listing = operations(source).optionListing(document(), 1, ChoiceSlotId("creation", "theme", 0))
        assertTrue(listing.rows().first().advancementDefinitions.isEmpty())
        val checked = listing.check(listOf(theme.id)).single()
        assertEquals(listOf(feature, power, modification).associateBy { it.id }, checked.advancementDefinitions)
        val reads = source.reads.toList()
        assertEquals(checked, listing.check(listOf(theme.id)).single())
        assertEquals(reads, source.reads)
    }

    @Test fun ancestryReaderLoadsNestedGrantsAndExplicitPowerOptions() = run {
        val ancestry = feat("ancestry").copy(category = EntryCategory.ANCESTRY,
            mechanics = Mechanics(grants = listOf(Grant.Entry("feature", "feature"))))
        val feature = feat("feature").copy(category = EntryCategory.FEATURE, mechanics = Mechanics(
            grants = listOf(Grant.Entry("fixed", "fixed-power")),
            choices = listOf(ChoiceDefinition.Entries("alternative", 1, listOf("power-option"))),
        ))
        val fixed = feat("fixed-power").copy(category = EntryCategory.POWER)
        val option = feat("power-option").copy(category = EntryCategory.POWER)
        val source = Source(listOf(ancestry, feature, fixed, option).associateBy { it.id }.toMutableMap())
        val listing = operations(source).optionListing(document(), 1, ChoiceSlotId("creation", "ancestry", 0))
        listing.rows()
        val checked = listing.check(listOf(ancestry.id)).single()
        assertEquals(listOf(feature), checked.ancestryGrants)
        assertEquals(listOf(feature, fixed, option).associateBy { it.id }, checked.advancementDefinitions)
        val reads = source.reads.toList()
        assertEquals(checked, listing.check(listOf(ancestry.id)).single())
        assertEquals(reads, source.reads)
    }

    @Test fun classFeatureReaderResolvesPowerGrantsThroughAnotherFeature() = run {
        val playerClass = feat("class").copy(category = EntryCategory.CLASS, mechanics = Mechanics(
            choices = listOf(ChoiceDefinition.Entries("specialization", 1, listOf("specialization"))),
        ))
        val specialization = feat("specialization").copy(category = EntryCategory.FEATURE, mechanics = Mechanics(
            grants = listOf(Grant.Entry("benefit", "benefit"), Grant.Entry("missing", "missing")),
        ))
        val benefit = feat("benefit").copy(category = EntryCategory.FEATURE, mechanics = Mechanics(
            grants = listOf(Grant.Entry("power", "power")),
        ))
        val power = feat("power").copy(category = EntryCategory.POWER)
        val source = Source(listOf(playerClass, specialization, benefit, power).associateBy { it.id }.toMutableMap())
        val selection = EntryChoice("chosen-class", ChoiceSlotId("creation", "class", 0),
            SavedSelection(playerClass.id, playerClass.presentation.title, "standard", "fingerprint"))
        val character = document().copy(levels = listOf(LevelDecisions(1, entries = listOf(selection))))
        val listing = operations(source).optionListing(character, 1, ChoiceSlotId("chosen-class", "specialization", 0))
        assertEquals(specialization.id, listing.rows().single().metadata.metadata.id)
        val row = listing.check(listOf(specialization.id)).single()
        assertEquals(listOf(benefit, power).associateBy { it.id }, row.advancementDefinitions)
    }

    @Test fun productionMetadataAndFirstBatchDoNotWaitForTheWholeFeatCatalog() = run {
        var reads = 0
        val source = object : ContentSource by CurrentDataFixtures {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads++
                return CurrentDataFixtures.loadChunk(packageId, chunkId)
            }
        }
        val document = CurrentDataFixtures.sample()
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(source, "modern4e.classes", document.packages)).value
        val listing = BuilderOperations(catalog).optionListing(document, 1, slot)
        val started = TimeSource.Monotonic.markNow()
        val rows = listing.rows(FeatGroup.CLASS)
        val metadataTime = started.elapsedNow()
        assertEquals(451, rows.size)
        assertEquals(0, reads)
        val batchStarted = TimeSource.Monotonic.markNow()
        listing.check(rows.take(12).map { it.metadata.metadata.id })
        val checked = listing.rows(FeatGroup.CLASS)
        assertEquals(12, checked.count { it.checked })
        assertTrue(checked.drop(12).none { it.checked })
        val beforeReopen = reads
        listing.rows(FeatGroup.CLASS)
        assertEquals(beforeReopen, reads)
        println("Feat listing: metadata=$metadataTime, first 12=${batchStarted.elapsedNow()}, total metadata rows=${rows.size}, chunk reads=$reads")
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
