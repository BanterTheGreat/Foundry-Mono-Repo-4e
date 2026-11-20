package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** A power saved from another class loads that class's pool; lists must still offer only the character's own classes' powers. */
class ForeignClassPowersTest {
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

    private suspend fun catalog(extraPackages: Set<String> = emptySet()): ContentCatalog {
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
        val extras = (source.listPackages() as ContractResult.Available).value.filter { it.id in extraPackages }
            .map { PackageRevision(it.id, it.revision) }
        return assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, "modern4e.classes", extras)).value
    }

    private fun evaluation(catalog: ContentCatalog): ChoiceEvaluation {
        val reading = catalog.readSession()
        val preparation = RulesContentPreparation(reading)
        return ChoiceEvaluation(reading, { BuilderState(it, RulesEngine.evaluate(it, preparation.load(it))) }, { preparation.load(it) })
    }

    private fun fighter() = assertIs<ContractResult.Available<CharacterDocument>>(
        ContractCodec.decode(contractFixtures.getValue("sample-modern-fighter.json"))).value

    private suspend fun saved(catalog: ContentCatalog, id: String): SavedSelection {
        val resolved = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup(id)).value!!
        return SavedSelection(resolved.entry.id, resolved.entry.presentation.title, resolved.supplier.packageId, resolved.fingerprint)
    }

    private fun CharacterDocument.with(vararg added: EntryChoice) = copy(levels = levels.map { row ->
        row.copy(entries = row.entries.filterNot { entry -> added.any { it.slot == entry.slot } } +
            if (row.level == 1) added.toList() else emptyList())
    })

    private fun powerOwners(catalog: ContentCatalog) = catalog.search(category = EntryCategory.POWER)
        .mapNotNull { row -> row.metadata.classId?.let { row.metadata.id to it } }.toMap()

    /** Two at-will pool slots of the Fighter, and a Wizard at-will power the Wizard's own pool offers. */
    private class Setup(val first: ChoiceSlotId, val second: ChoiceSlotId, val wizardPower: String)

    private suspend fun setup(catalog: ContentCatalog): Setup {
        val fighter = fighter()
        val slots = RulesEngine.evaluate(fighter, RulesContent.load(fighter, catalog)).choices
            .filter { it.entries.isNotEmpty() && it.slot.choiceId == "modern4e.choice.class-attack-at-will" }.map { it.slot }
        assertTrue(slots.size >= 2, "A Fighter has more than one At-Will slot")
        val level = fighter.levels.first()
        val wizard = fighter.copy(levels = listOf(level.copy(entries = listOf(level.entries.first().copy(
            selection = saved(catalog, "modern4e.class.wizard"))))))
        val wizardPower = RulesEngine.evaluate(wizard, RulesContent.load(wizard, catalog)).choices
            .first { it.slot.choiceId == "modern4e.choice.class-attack-at-will" }.entries
            .first { it.entryId.startsWith("modern4e.power.wizard-power") && it.status == Eligibility.ELIGIBLE }.entryId
        return Setup(slots[0], slots[1], wizardPower)
    }

    @Test fun aSavedPowerOfAnotherClassDoesNotWidenOtherListsButStaysInItsOwnSlot() = runTest {
        val catalog = catalog()
        val setup = setup(catalog)
        val owners = powerOwners(catalog)
        val document = fighter().with(EntryChoice("kept-wizard", setup.first, saved(catalog, setup.wizardPower)))

        val engineOffer = RulesEngine.evaluate(document, RulesContent.load(document, catalog)).choices
            .first { it.slot == setup.second }.entries.map { it.entryId }
        assertTrue(engineOffer.any { owners[it] == "modern4e.class.wizard" },
            "The engine pool does carry the other class's powers, which is what the list must filter")

        val sibling = evaluation(catalog).options(document, 1, setup.second, true).map { it.entry.entry.id }
        assertTrue(sibling.any { owners[it] == "modern4e.class.fighter" }, "The Fighter's own powers are still offered")
        assertTrue(sibling.none { owners[it].let { owner -> owner != null && owner != "modern4e.class.fighter" } },
            "No other class's power is offered in a slot that does not hold one")

        val own = evaluation(catalog).options(document, 1, setup.first, true).map { it.entry.entry.id }
        assertEquals(listOf(setup.wizardPower), own.filter { owners[it] == "modern4e.class.wizard" },
            "The wrong-class power already in the slot is the only one of its class shown there")
        assertTrue(own.any { owners[it] == "modern4e.class.fighter" }, "Own-class replacements remain available")
    }

    @Test fun anotherClassStillAppearsOnceAMulticlassFeatGrantsAccessToIt() = runTest {
        val catalog = catalog(setOf("modern4e.feats"))
        val setup = setup(catalog)
        val owners = powerOwners(catalog)
        val feat = EntryChoice("multiclass-wizard", ChoiceSlotId("creation", "feat", 0), saved(catalog, "modern4e.feat.arcane-initiate"))
        val document = fighter().with(EntryChoice("kept-wizard", setup.first, saved(catalog, setup.wizardPower)), feat)

        val sibling = evaluation(catalog).options(document, 1, setup.second, true).map { it.entry.entry.id }
        assertTrue(sibling.count { owners[it] == "modern4e.class.wizard" } > 1,
            "A multiclass Wizard keeps the Wizard pool")
    }

    @Test fun aCharacterWithoutAnySavedForeignPowerSeesTheSameListAsTheEngineOffers() = runTest {
        val catalog = catalog()
        val setup = setup(catalog)
        val owners = powerOwners(catalog)
        val document = fighter()
        val offered = RulesEngine.evaluate(document, RulesContent.load(document, catalog)).choices
            .first { it.slot == setup.second }.entries.map { it.entryId }.toSet()
        val listed = evaluation(catalog).options(document, 1, setup.second, true).map { it.entry.entry.id }.toSet()
        assertEquals(offered.filter { owners[it].let { owner -> owner == null || owner == "modern4e.class.fighter" } }.toSet(),
            listed)
    }
}
