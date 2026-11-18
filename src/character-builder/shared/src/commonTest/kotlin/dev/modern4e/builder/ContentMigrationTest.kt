package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class ContentMigrationTest {
    private val target = ContentEntry("modern4e.class.fighter", EntryCategory.CLASS, Presentation("Modern Fighter"),
        Mechanics(), Coverage(CoverageStatus.UNIMPLEMENTED, listOf("Manual combat")))
    private val old = SavedSelection("class3", "Original Fighter", "legacy", "original-fingerprint")
    private val mapping = ContentIdMapping("class3", target.id, EntryCategory.CLASS)
    private val power = target.copy(id = "modern4e.power.attack", category = EntryCategory.POWER)
    private val item = target.copy(id = "modern4e.weapon.sword", category = EntryCategory.ITEM)
    private val oldPower = old.copy(entryId = "power1")
    private val oldItem = old.copy(entryId = "item1")
    private val mappings = listOf(mapping, ContentIdMapping("power1", power.id, EntryCategory.POWER),
        ContentIdMapping("item1", item.id, EntryCategory.ITEM))
    private fun document() = CharacterDocument(id = "migration-test", savedAt = "2026-11-18T12:00:00Z",
        identity = CharacterIdentity("Keep identity"), packages = listOf(PackageRevision("legacy", "old")), level = 2,
        abilities = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH, mapOf(Ability.STRENGTH to 4)),
        levels = listOf(LevelDecisions(1, entries = listOf(EntryChoice("fighter", ChoiceSlotId("creation", "class", 0), old))),
            LevelDecisions(2, replacements = listOf(Replacement(ChoiceSlotId("fighter", "attack", 0),
                EntryChoice("later", ChoiceSlotId("fighter", "attack", 0), oldPower), ReplacementKind.RETRAINING)))),
        equipment = listOf(EquipmentSelection("inventory", oldItem, quantity = 3, configuration = mapOf("custom" to "keep"))))

    private val source = object : ContentSource {
        override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(id = "modern", revision = "2",
            title = "Modern", indexes = listOf("index"), chunks = listOf("entries"))))
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
            listOf(target, power, item).map { EntryMetadata(it.id, it.category, it.presentation.title, "entries") }))
        override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(EntryChunk("entries", listOf(target, power, item)))
    }
    private fun run(block: suspend () -> Unit) {
        var result: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) { result = value }
        })
        checkNotNull(result).getOrThrow()
    }
    private fun <T> value(result: ContractResult<T>) = assertIs<ContractResult.Available<T>>(result).value
    private suspend fun operations() = ContentMigration(value(ContentCatalog.open(source, "modern", listOf(PackageRevision("modern", "2")))))

    @Test fun adoptionIsExplicitAndPortableAndRetainsOriginalProvenance() = run {
        val original = document()
        val ops = operations()
        val preview = value(ops.preview(original, "reviewed-fighter-v1", mappings))
        assertEquals("class3", original.levels.first().entries.single().selection.entryId)
        assertEquals(3, preview.changes.size)
        val adopted = value(ops.commit(original, preview))
        assertEquals(original.abilities, adopted.abilities)
        assertEquals(original.identity, adopted.identity)
        assertEquals(original.levels[1].replacements.single().replaces, adopted.levels[1].replacements.single().replaces)
        assertEquals(original.equipment.single().configuration, adopted.equipment.single().configuration)
        assertEquals(3, adopted.equipment.single().quantity)
        assertEquals(listOf(PackageRevision("legacy", "old"), PackageRevision("modern", "2")), adopted.packages)
        assertEquals(3, adopted.contentMigrations.size)
        assertEquals(listOf(old, oldPower, oldItem), adopted.contentMigrations.map { it.original })
        assertEquals(listOf(target.id, power.id, item.id), adopted.contentMigrations.map { it.adopted.entryId })
        assertEquals(adopted, value(ContractCodec.decode(ContractCodec.encode(adopted))))
        assertFalse(ContractCodec.encode(original).contains("contentMigrations"))
        val repeated = value(ops.preview(adopted, "reviewed-fighter-v1", mappings))
        assertTrue(repeated.changes.isEmpty())
        assertEquals(adopted, repeated.proposed)
    }

    @Test fun missingWrongCategoryAndUnmappedChoicesRemainUntouched() = run {
        val ops = operations()
        val original = document()
        for (candidate in listOf(mapping.copy(targetId = "modern4e.class.missing"), mapping.copy(category = EntryCategory.POWER))) {
            val preview = value(ops.preview(original, "reviewed", listOf(candidate)))
            assertTrue(preview.changes.all { it.proposed is ContractResult.Unavailable })
            assertEquals(original.levels, preview.proposed.levels)
            assertEquals(original.equipment, preview.proposed.equipment)
            assertTrue(preview.proposed.contentMigrations.isEmpty())
            assertEquals(original.packages, preview.proposed.packages)
        }
        assertTrue(value(ops.preview(original, "empty", emptyList())).changes.isEmpty())
        assertEquals(original, value(ops.preview(original, "empty", emptyList())).proposed)
    }

    @Test fun staleAndAmbiguousPlansCannotCommit() = run {
        val ops = operations()
        val original = document()
        val preview = value(ops.preview(original, "reviewed", listOf(mapping)))
        assertIs<ContractResult.Unavailable>(ops.commit(original.copy(identity = CharacterIdentity("Edited")), preview))
        assertIs<ContractResult.Unavailable>(ops.preview(original, "reviewed", listOf(mapping, mapping)))
        assertIs<ContractResult.Unavailable>(ops.preview(original, "", listOf(mapping)))
        assertIs<ContractResult.Unavailable>(ops.preview(original, "chain", listOf(mapping,
            ContentIdMapping(target.id, "next", EntryCategory.CLASS))))
    }

    @Test fun reviewedFighterPlanResolvesRealSharedDefinitionsWithoutGuessingOtherIds() = run {
        val plan = ContractCodec.json.decodeFromString<ContentMigrationPlan>(productionFixtures.getValue("migrations/fighter-v1.json"))
        assertEquals(175, plan.mappings.size)
        val packages = CurrentDataFixtures.sample().packages
        val catalog = value(ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", packages))
        for (mapping in plan.mappings) {
            assertEquals(mapping.category, value(catalog.lookup(mapping.targetId))!!.entry.category)
        }
        val original = document().copy(equipment = emptyList())
        val preview = value(ContentMigration(catalog).preview(original, plan))
        assertEquals(target.id, preview.proposed.levels.first().entries.single().selection.entryId)
        assertEquals(original.abilities, preview.proposed.abilities)
        assertFalse(plan.mappings.any { it.sourceId == "featmissing" })
    }

    @Test fun destinationPrecedenceSurvivesPortableReopenAndContextMismatchesArePreserved() = run {
        val destination = CurrentDataFixtures.sample(custom = true).packages
        val catalog = value(ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", destination))
        val original = document().copy(packages = destination.reversed() + document().packages,
            equipment = listOf(EquipmentSelection("wrong-context", old)))
        val preview = value(ContentMigration(catalog).preview(original, "explicit-order", listOf(mapping)))
        assertEquals(document().packages + destination, preview.proposed.packages)
        assertEquals(old, preview.proposed.equipment.single().selection)
        assertIs<ContractResult.Unavailable>(preview.changes.single { it.instanceId == "wrong-context" }.proposed)
        val reopened = value(ContractCodec.decode(ContractCodec.encode(preview.proposed)))
        val reopenedCatalog = value(ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", reopened.packages))
        val saved = reopened.levels.first().entries.single().selection
        assertEquals(CurrentDataFixtures.overrideId, saved.supplierPackageId)
        assertFalse(value(reopenedCatalog.resolve(saved)).acknowledgmentRequired)
    }
}
