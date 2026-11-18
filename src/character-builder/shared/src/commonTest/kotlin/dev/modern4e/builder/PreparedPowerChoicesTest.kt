package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Plain class powers are judged against one activation of the slot's character; everything else falls back. */
class PreparedPowerChoicesTest {
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

    private suspend fun catalog(): ContentCatalog {
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
        return assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, "modern4e.classes", emptyList())).value
    }

    /** One picker's evaluation, with every content preparation recorded by the document it was asked to load. */
    private class Picker(catalog: ContentCatalog, fastPowers: Boolean) {
        private val reading = catalog.readSession()
        private val preparation = RulesContentPreparation(reading)
        val prepared = mutableListOf<CharacterDocument>()
        val evaluation = ChoiceEvaluation(reading, { BuilderState(it, RulesEngine.evaluate(it, preparation.load(it))) },
            { prepared += it; preparation.load(it) }, fastPowers)
    }

    private fun sample() = assertIs<ContractResult.Available<CharacterDocument>>(
        ContractCodec.decode(contractFixtures.getValue("sample-modern-fighter.json"))).value

    /** Power slots offered by the class at the character's level, with the acquisition level their IDs encode. */
    private suspend fun poolSlots(catalog: ContentCatalog, document: CharacterDocument) = RulesEngine.evaluate(document,
        RulesContent.load(document, catalog)).choices.filter { it.entries.isNotEmpty() && "class-attack" in it.slot.choiceId }
        .map { it.slot to (Regex("-(\\d+)$").find(it.slot.choiceId)?.groupValues?.get(1)?.toInt() ?: 1) }

    private fun occupied(document: CharacterDocument, slot: ChoiceSlotId) = document.levels.flatMap { it.entries }.any { it.slot == slot }

    private suspend fun taken(power: String, slot: ChoiceSlotId, catalog: ContentCatalog): EntryChoice {
        val resolved = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.power.fighter-$power")).value!!
        return EntryChoice("taken-$power", slot, SavedSelection(resolved.entry.id, resolved.entry.presentation.title,
            resolved.supplier.packageId, resolved.fingerprint))
    }

    /** Compares every pool entry, returning the IDs whose candidate activation could not be skipped. */
    private suspend fun compare(catalog: ContentCatalog, document: CharacterDocument, slots: List<Pair<ChoiceSlotId, Int>>): Set<String> {
        val declined = mutableSetOf<String>()
        for ((slot, level) in slots) {
            val fast = Picker(catalog, true)
            val full = Picker(catalog, false)
            val expected = full.evaluation.options(document, level, slot, true)
            val actual = fast.evaluation.options(document, level, slot, true)
            assertTrue(expected.isNotEmpty(), "$slot offers powers")
            assertEquals(expected, actual, "Fast path must reproduce eligibility and diagnostics for every option of $slot")
            val baselines = fast.prepared.count { !occupied(it, slot) }
            val candidates = fast.prepared.filter { occupied(it, slot) }.map { copy ->
                copy.levels.flatMap { it.entries }.single { it.slot == slot }.selection.entryId
            }
            assertTrue(baselines <= 1, "The slot's character is prepared at most once, not per power")
            assertEquals(expected.size, full.prepared.count { occupied(it, slot) }, "Candidate activation prepares every power")
            assertEquals(baselines + candidates.size, fast.prepared.size)
            declined += candidates
        }
        return declined
    }

    @Test fun levelOnePoolsMatchCandidateActivationIncludingRepeatsAndNeedNoPerPowerPreparation() = runTest {
        val catalog = catalog()
        val document = sample()
        val slots = poolSlots(catalog, document)
        assertTrue(slots.size >= 3)
        assertTrue(compare(catalog, document, slots).isEmpty(), "Level 1 pools hold only plain powers")

        // A power already held in a sibling slot is ineligible for repeats, exactly as candidate activation reports.
        val atWill = slots.filter { "class-attack-at-will" in it.first.choiceId }
        assertTrue(atWill.size >= 2, "At-will powers fill more than one slot")
        val held = taken("power992", atWill.first().first, catalog)
        val withTaken = document.copy(levels = document.levels.map { it.copy(entries = it.entries + held) })
        compare(catalog, withTaken, poolSlots(catalog, withTaken))
        val sibling = Picker(catalog, true).evaluation.options(withTaken, 1, atWill[1].first, true)
        val repeat = sibling.single { it.entry.entry.id == "modern4e.power.fighter-power992" }
        assertEquals(Eligibility.INELIGIBLE, repeat.eligibility)
        assertTrue(repeat.diagnostics.any { it.code == "engine.selectionMaximum" })
        assertTrue(sibling.any { it.entry.entry.id != repeat.entry.entry.id && it.eligibility == Eligibility.ELIGIBLE })
    }

    @Test fun skillProficiencyPowersFallBackToCandidateActivationAndStillAgree() = runTest {
        val catalog = catalog()
        val sample = sample()
        val document = sample.copy(level = 10, levels = listOf(sample.levels.first()) + (2..10).map { LevelDecisions(it) })
        val slots = poolSlots(catalog, document)
        assertTrue(slots.any { it.second == 5 }, "The level 5 daily pool is offered")
        val declined = compare(catalog, document, slots)
        // The bundle's third gated power (level 13) is only reachable by replacement, never from a pool slot.
        assertEquals(setOf("modern4e.power.fighter-power10153", "modern4e.power.fighter-power4324"), declined,
            "Exactly the skill-proficiency powers a pool offers need candidate activation")
    }

    @Test fun plainPowersWithOtherMechanicsOrConflictsAreDeclined() = runTest {
        val catalog = catalog()
        val document = sample()
        val (slot, level) = poolSlots(catalog, document).first()
        val power = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.power.fighter-power992")).value!!
        val resolved = ContractResult.Available(power)
        val content = RulesContent.load(
            RulesEngine.preparePowerChoices(document, level, slot).baseline, catalog)
        fun checker() = RulesEngine.preparePowerChoices(document, level, slot)
        assertNotNull(checker().check(power, resolved, content, "instance"))

        fun variant(mechanics: Mechanics) = power.copy(entry = power.entry.copy(mechanics = mechanics))
        val grants = variant(power.entry.mechanics.copy(grants = listOf(Grant.Proficiency("skill", Skill.ARCANA))))
        assertNull(checker().check(grants, ContractResult.Available(grants), content, "instance"))
        val skill = variant(power.entry.mechanics.copy(prerequisites = listOf(Prerequisite.Proficiency(Skill.ATHLETICS))))
        assertNull(checker().check(skill, ContractResult.Available(skill), content, "instance"))
        val feat = variant(power.entry.mechanics).let { it.copy(entry = it.entry.copy(category = EntryCategory.FEAT)) }
        assertNull(checker().check(feat, ContractResult.Available(feat), content, "instance"))
        // A saved selection that resolves to another definition is never trusted.
        assertNull(checker().check(power, ContractResult.Available(grants), content, "instance"))
        assertNull(checker().check(power, ContractResult.Unavailable(listOf(Diagnostic("test.missing", DiagnosticKind.UNRESOLVED_CONTENT, "Unavailable"))), content, "instance"))
        // A slot without a matching level decision, or an occurrence already using the instance ID, is declined.
        assertNull(RulesEngine.preparePowerChoices(document, 2, slot).check(power, resolved, content, "instance"))
        val rootInstance = document.levels.flatMap { it.entries }.first().instanceId
        assertNull(checker().check(power, resolved, content, rootInstance))
        val prepared = checker()
        prepared.check(power, resolved, content, "instance")
        prepared.check(power, resolved, content, "other")
        assertEquals(1, prepared.baselinePreparations)
    }
}
