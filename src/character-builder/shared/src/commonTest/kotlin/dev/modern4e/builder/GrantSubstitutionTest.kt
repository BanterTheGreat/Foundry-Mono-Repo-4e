package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Optional substitutions retain the original grant's provenance, not a new feat allowance. */
class GrantSubstitutionTest {
    private val sourceId = "techniques"
    private val grantId = "technique-master"
    private val sourceInstance = ModernCreation.grantInstance("class", sourceId)
    private val slot = ChoiceSlotId(sourceInstance, grantId, 0)
    private val instance = ModernCreation.grantInstance(sourceInstance, grantId)
    private val technique = ContentEntry("technique", EntryCategory.FEAT, Presentation("Technique Master"),
        Mechanics(version = 2, maximumSelections = 1), Coverage(CoverageStatus.PARTIAL, listOf("Mastery remains manual")))
    private val alchemist = technique.copy(id = "alchemist", presentation = Presentation("Alchemist"))
    private val profile = ContractCodec.json.decodeFromString<EntryChunk>(contractFixtures.getValue("shared-fighter-chunk.json"))
        .entries.single { it.category == EntryCategory.CLASS }.mechanics.classProfile!!.copy(
            proficiencies = mapOf("armor" to emptyList(), "shields" to emptyList(), "weapons" to emptyList(), "implements" to emptyList()))
    private val feature = ContentEntry(sourceId, EntryCategory.FEATURE, Presentation("Techniques"),
        Mechanics(version = 2, grants = listOf(Grant.Entry(grantId, technique.id, replacementEntryIds = listOf(alchemist.id)))),
        Coverage(CoverageStatus.SUPPORTED))
    private val clazz = ContentEntry("class", EntryCategory.CLASS, Presentation("Class"),
        Mechanics(version = 2, grants = listOf(Grant.Entry(sourceId, feature.id)), classProfile = profile), Coverage(CoverageStatus.SUPPORTED))
    private fun saved(entry: ContentEntry) = SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry))
    private fun resolved(entry: ContentEntry) = ContractResult.Available(ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry)))
    private fun document(replacement: ContentEntry? = null, occurrence: String = instance): CharacterDocument =
        CharacterDocument(id = "grant", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Grant"),
            packages = emptyList(), level = 1, abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0),
                Ability.STRENGTH, mapOf(Ability.STRENGTH to 4)), levels = listOf(LevelDecisions(1,
                listOf(EntryChoice("class", ChoiceSlotId("creation", "class", 0), saved(clazz))) +
                    listOfNotNull(replacement?.let { EntryChoice(occurrence, slot, saved(it)) }))))
    private fun content(doc: CharacterDocument, definitions: List<ContentEntry> = listOf(clazz, feature, technique, alchemist)): RulesContent {
        val entries = definitions.associateBy { it.id }
        return RulesContent(entries.mapValues { resolved(it.value) }, doc.levels.flatMap { it.entries }.associate {
            it.selection to (entries[it.selection.entryId]?.let { entry -> resolved(entry) }
                ?: ContractResult.Unavailable(listOf(Diagnostic("test.missing", DiagnosticKind.UNRESOLVED_CONTENT, "Missing", it.slot, it.selection.entryId))))
        })
    }
    private fun evaluate(doc: CharacterDocument = document(), definitions: List<ContentEntry> = listOf(clazz, feature, technique, alchemist)) =
        RulesEngine.evaluate(doc, content(doc, definitions))

    @Test fun absentDecisionUsesDefaultAndOffersOnlyAuthoredSubstitution() {
        val rules = evaluate()
        val grant = rules.entries.single { it.slot == slot }
        assertEquals(technique.id, grant.definition.entry.id)
        assertEquals(instance, grant.instanceId)
        assertTrue(grant.granted)
        assertEquals(listOf(technique.id, alchemist.id), rules.choices.single { it.slot == slot }.entries.map { it.entryId })
        assertTrue(rules.choices.single { it.slot == slot }.optional)
        assertFalse(rules.diagnostics.any { it.slot == slot && it.code == "engine.missingChoice" })
    }

    @Test fun substitutionSurvivesPortableReopenWithOriginalGrantIdentity() {
        val original = document(alchemist)
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(original))).value
        assertEquals(original, reopened)
        val rules = evaluate(reopened)
        val grant = rules.entries.single { it.slot == slot }
        assertEquals(alchemist.id, grant.definition.entry.id)
        assertEquals(instance, grant.instanceId)
        assertTrue(grant.granted)
        assertFalse(rules.entries.any { it.definition.entry.id == technique.id })
        assertEquals(Eligibility.ELIGIBLE, rules.entryEligibility.getValue(instance).status)
    }

    @Test fun removedSourceRetainsOrphanDecisionWithoutGrantingItsBenefit() {
        val doc = document(alchemist)
        val changed = clazz.copy(mechanics = clazz.mechanics.copy(grants = emptyList()))
        val rules = evaluate(doc, listOf(changed, feature, technique, alchemist))
        assertFalse(rules.entries.any { it.definition.entry.id == alchemist.id })
        assertTrue(rules.diagnostics.any { it.code == "engine.orphanEntry" && it.slot == slot })
        assertEquals(alchemist.id, doc.levels.single().entries.last().selection.entryId)
    }

    @Test fun removedAllowanceKeepsSavedDecisionAndDiagnosesDefaultRestoration() {
        val doc = document(alchemist)
        val changed = feature.copy(mechanics = feature.mechanics.copy(grants = listOf(Grant.Entry(grantId, technique.id))))
        val rules = evaluate(doc, listOf(clazz, changed, technique, alchemist))
        assertEquals(technique.id, rules.entries.single { it.slot == slot }.definition.entry.id)
        assertTrue(rules.diagnostics.any { it.code == "engine.grantReplacement" && it.slot == slot })
        assertFalse(rules.choices.any { it.slot == slot })
        assertEquals(alchemist.id, doc.levels.single().entries.last().selection.entryId)
    }

    @Test fun missingSelectedReplacementDoesNotSilentlyRestoreDefault() {
        val doc = document(alchemist)
        val rules = evaluate(doc, listOf(clazz, feature, technique))
        assertFalse(rules.entries.any { it.slot == slot })
        assertTrue(rules.diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT && it.slot == slot })
        assertEquals(alchemist.id, doc.levels.single().entries.last().selection.entryId)
    }

    @Test fun changedGrantIdentityCannotAdoptOldSubstitution() {
        val doc = document(alchemist)
        val changed = feature.copy(mechanics = feature.mechanics.copy(grants = listOf(
            Grant.Entry("new-grant", technique.id, replacementEntryIds = listOf(alchemist.id)))))
        val rules = evaluate(doc, listOf(clazz, changed, technique, alchemist))
        assertTrue(rules.diagnostics.any { it.code == "engine.orphanEntry" && it.slot == slot })
        assertEquals(technique.id, rules.entries.single { it.definition.entry.category == EntryCategory.FEAT }.definition.entry.id)
    }

    @Test fun lateSavedSubstitutionIsPreservedDiagnosedAndCannotRewriteAcquisitionFacts() {
        val original = document(alchemist)
        val selected = original.levels.single().entries.last()
        val doc = original.copy(level = 2, levels = listOf(original.levels.single().copy(entries = original.levels.single().entries.dropLast(1)),
            LevelDecisions(2, entries = listOf(selected))))
        val rules = evaluate(doc)
        assertEquals(1, rules.choices.single { it.slot == slot }.acquisitionLevel)
        assertEquals(technique.id, rules.entries.single { it.slot == slot }.definition.entry.id)
        assertTrue(rules.diagnostics.any { it.code == "engine.grantTiming" && it.slot == slot })
        assertEquals(selected, doc.levels.last().entries.single())
    }

    @Test fun laterAuthoredGrantOpensSubstitutionOnlyAtItsOwnAcquisitionLevel() {
        val original = document()
        val later = feature.copy(mechanics = feature.mechanics.copy(grants = listOf(
            Grant.Entry(grantId, technique.id, atLevel = 2, replacementEntryIds = listOf(alchemist.id)))))
        assertFalse(evaluate(original, listOf(clazz, later, technique, alchemist)).choices.any { it.slot == slot })
        val doc = original.copy(level = 2, levels = original.levels + LevelDecisions(2, entries = listOf(
            EntryChoice(instance, slot, saved(alchemist)))))
        val rules = evaluate(doc, listOf(clazz, later, technique, alchemist))
        assertEquals(2, rules.choices.single { it.slot == slot }.acquisitionLevel)
        assertEquals(alchemist.id, rules.entries.single { it.slot == slot }.definition.entry.id)
        assertFalse(rules.diagnostics.any { it.code == "engine.grantTiming" })
    }

    @Test fun invalidSavedOccurrenceIsDiagnosedWhileRuntimeKeepsStableProvenance() {
        val rules = evaluate(document(alchemist, "unrelated-occurrence"))
        assertEquals(instance, rules.entries.single { it.slot == slot }.instanceId)
        assertTrue(rules.diagnostics.any { it.code == "engine.grantInstance" && it.slot == slot })
    }

    @Test fun substitutionsCannotQualifyThroughTheirOwnOrDependentBenefits() {
        val dependent = ContentEntry("dependent", EntryCategory.FEAT, Presentation("Dependent"), Mechanics(version = 2,
            prerequisites = listOf(Prerequisite.Entry(alchemist.id)), equipmentProficiencies = listOf("PLATE")), Coverage(CoverageStatus.SUPPORTED))
        for (benefit in listOf(emptyList(), listOf("PLATE"))) {
            val restricted = alchemist.copy(mechanics = alchemist.mechanics.copy(
                prerequisites = listOf(Prerequisite.EquipmentProficiency("PLATE")), equipmentProficiencies = benefit))
            val original = document(restricted)
            val doc = original.copy(levels = original.levels.map { it.copy(entries = it.entries +
                EntryChoice("dependent", ChoiceSlotId("creation", "feat", 0), saved(dependent))) })
            val rules = evaluate(doc, listOf(clazz, feature, technique, restricted, dependent))
            assertEquals(Eligibility.INELIGIBLE, rules.entryEligibility.getValue(instance).status)
        }
    }

    @Test fun substitutionDoesNotCreateAnExtraAllowedOccurrenceOfAlchemist() {
        val original = document(alchemist)
        val doc = original.copy(levels = original.levels.map { it.copy(entries = it.entries +
            EntryChoice("chosen-alchemist", ChoiceSlotId("creation", "feat", 0), saved(alchemist))) })
        val rules = evaluate(doc)
        assertEquals(Eligibility.INELIGIBLE, rules.entryEligibility.getValue(instance).status)
        assertEquals(Eligibility.INELIGIBLE, rules.entryEligibility.getValue("chosen-alchemist").status)
        assertTrue(rules.diagnostics.any { it.code == "engine.selectionMaximum" })
    }

    @Test fun editorChoosesChangesAndClearsTheSubstitutionWithoutSpendingRootFeatSlot() = run {
        val definitions = listOf(clazz, feature, technique, alchemist)
        val source = object : ContentSource {
            override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(id = "standard", revision = "1",
                title = "Standard", indexes = listOf("index"), chunks = listOf("chunk"))))
            override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
                definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, "chunk") }))
            override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(EntryChunk("chunk", definitions))
        }
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, "standard", emptyList())).value
        val operations = BuilderOperations(catalog)
        val original = document()
        val advanced = original.copy(level = 2, levels = original.levels + LevelDecisions(2))
        val mistimed = operations.apply(advanced, BuilderEdit.Entry(2, slot, alchemist.id, "late"))
        assertFalse(mistimed.applied)
        assertEquals(advanced, mistimed.state.document)
        assertEquals(listOf(technique.id, alchemist.id), operations.options(original, 1, slot).map { it.entry.entry.id })
        val result = operations.apply(original, BuilderEdit.Entry(1, slot, alchemist.id, "caller-id-is-ignored"))
        assertTrue(result.applied, result.diagnostics.toString())
        val stored = result.state.document.levels.single().entries.single { it.slot == slot }
        assertEquals(instance, stored.instanceId)
        assertFalse(result.state.document.levels.single().entries.any { it.slot == ChoiceSlotId("creation", "feat", 0) })
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(result.state.document))).value
        assertEquals(alchemist.id, operations.evaluate(reopened).rules.entries.single { it.slot == slot }.definition.entry.id)
        val changed = operations.apply(reopened, BuilderEdit.Entry(1, slot, technique.id, "another-ignored-id"))
        assertTrue(changed.applied)
        assertEquals(instance, changed.state.document.levels.single().entries.single { it.slot == slot }.instanceId)
        val cleared = operations.apply(reopened, BuilderEdit.RemoveEntry(slot))
        assertTrue(cleared.applied)
        assertEquals(technique.id, cleared.state.rules.entries.single { it.slot == slot }.definition.entry.id)
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
