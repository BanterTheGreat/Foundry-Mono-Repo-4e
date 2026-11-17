package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class ContentReconciliationTest {
    private val base = ContentEntry("fighter", EntryCategory.CLASS, Presentation("Fighter"),
        Mechanics(choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH)))), Coverage(CoverageStatus.SUPPORTED))
    private val custom = base.copy(presentation = Presentation("Custom Fighter"))
    private val packages = listOf(PackageRevision("standard", "1"), PackageRevision("custom", "1"))
    private val saved = SavedSelection("fighter", "Saved Fighter", "custom", ContractCodec.fingerprint(custom))
    private fun document() = CharacterDocument(id = "character", savedAt = "2026-11-17T00:00:00Z",
        identity = CharacterIdentity("Proof"), packages = packages, level = 1,
        abilities = AbilityAllocation(ChoiceSlotId("class-instance", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.INTELLIGENCE to 1)),
        levels = listOf(LevelDecisions(1, entries = listOf(EntryChoice("class-instance", ChoiceSlotId("creation", "class", 0), saved)))))

    private inner class Source : ContentSource {
        var definitions = linkedMapOf("standard" to base, "custom" to custom)
        var revision = "1"
        var failChunks = false
        override suspend fun listPackages() = ContractResult.Available(definitions.keys.map {
            PackageManifest(id = it, revision = revision, title = it, indexes = listOf("index"), chunks = listOf("chunk")) })
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
            definitions[packageId]?.let { listOf(EntryMetadata(it.id, it.category, it.presentation.title, "chunk")) }.orEmpty()))
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> =
            if (failChunks) ContractResult.Unavailable(listOf(Diagnostic("io.test", DiagnosticKind.IO_FAILURE, "Cannot read")))
            else ContractResult.Available(EntryChunk("chunk", listOfNotNull(definitions[packageId])))
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
    private fun roundTrip(document: CharacterDocument) = value(ContractCodec.decode(ContractCodec.encode(document)))

    @Test fun currentDefinitionsRecalculateButOnlyExplicitAcknowledgmentAdvancesBaselines() = run {
        val source = Source()
        val ops = ContentReconciliation(source, "standard")
        val doc = document()
        assertFalse(value(ops.reconcile(doc)).selections.single().acknowledgmentRequired)
        source.revision = "2"
        source.definitions["custom"] = custom.copy(presentation = Presentation("Updated Fighter"), mechanics = base.mechanics.copy(
            modifiers = listOf(TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.MEDICINE), ModifierOperation.ADD, 2))))
        val refreshed = value(ops.reconcile(doc))
        assertEquals(doc, refreshed.state.document)
        assertTrue(refreshed.selections.single().acknowledgmentRequired)
        assertEquals(2, refreshed.changedPackages.size)
        // Missing proficiency decisions are diagnostics, but do not invent proficiency bonuses.
        assertEquals(3, value(refreshed.state.rules.skill(Skill.MEDICINE)).total)
        val acknowledged = value(ops.acknowledge(doc))
        assertFalse(acknowledged.selections.single().acknowledgmentRequired)
        assertTrue(acknowledged.changedPackages.isEmpty())
        assertEquals("Updated Fighter", acknowledged.state.document.levels.single().entries.single().selection.savedTitle)
        assertEquals(doc.abilities, acknowledged.state.document.abilities)
        assertEquals(acknowledged.state.document, roundTrip(acknowledged.state.document))
        assertFalse(value(ops.reconcile(roundTrip(acknowledged.state.document))).selections.single().acknowledgmentRequired)
    }

    @Test fun revisionOnlyChangeDoesNotInventADefinitionChange() = run {
        val source = Source()
        source.revision = "2"
        val state = value(ContentReconciliation(source, "standard").reconcile(document()))
        assertFalse(state.selections.single().acknowledgmentRequired)
        assertEquals(2, state.changedPackages.size)
    }

    @Test fun missingOverridePreservesProvenanceUntilDeliberateSwitch() = run {
        val source = Source()
        source.definitions.remove("custom")
        val ops = ContentReconciliation(source, "standard")
        val doc = document()
        val state = value(ops.reconcile(doc))
        assertFalse(state.selections.single().detailsAvailable)
        assertEquals("Saved Fighter", state.selections.single().saved.savedTitle)
        assertIs<ContractResult.Unavailable>(state.state.rules.skill(Skill.MEDICINE))
        assertEquals(doc, value(ops.acknowledge(doc)).state.document)
        assertEquals(doc, roundTrip(state.state.document))
        val catalog = value(ContentCatalog.open(source, "standard", doc.packages))
        val edited = BuilderOperations(catalog).apply(doc, BuilderEdit.Identity(CharacterIdentity("Renamed")))
        assertTrue(edited.applied)
        assertEquals(doc.levels, edited.state.document.levels)
        val preview = value(ops.preview(doc, listOf(packages.first())))
        assertEquals("standard", preview.proposed.state.document.levels.single().entries.single().selection.supplierPackageId)
        assertTrue(preview.proposed.selections.single().detailsAvailable)
        assertEquals(1, value(preview.proposed.state.rules.skill(Skill.MEDICINE)).total)
        assertEquals(1, preview.affectedSelections.size)
        assertEquals(preview.proposed, value(ops.commit(doc, preview)))
        assertIs<ContractResult.Unavailable>(ops.commit(edited.state.document, preview))
    }

    @Test fun removedEntryAndReadFailuresRemainUnresolved() = run {
        val source = Source()
        source.definitions["custom"] = custom.copy(id = "different")
        val ops = ContentReconciliation(source, "standard")
        assertFalse(value(ops.reconcile(document())).selections.single().detailsAvailable)
        assertEquals(saved, value(ops.acknowledge(document())).state.document.levels.single().entries.single().selection)
        source.failChunks = true
        assertFalse(value(ops.preview(document(), listOf(packages.first()))).proposed.selections.single().detailsAvailable)
        assertEquals(saved, value(ops.acknowledge(document())).state.document.levels.single().entries.single().selection)
    }

    @Test fun reorderingReportsInvalidChoicesAndCancelLeavesDecisionsUntouched() = run {
        val source = Source()
        source.definitions["third"] = custom.copy(presentation = Presentation("Third Fighter"),
            mechanics = base.mechanics.copy(prerequisites = listOf(Prerequisite.Level(2))))
        val ops = ContentReconciliation(source, "standard")
        val doc = document()
        val order = packages + PackageRevision("third", "1")
        val preview = value(ops.preview(doc, order))
        assertEquals("third", preview.proposed.selections.single().saved.supplierPackageId)
        assertTrue(preview.proposed.state.rules.diagnostics.any { it.kind == DiagnosticKind.INVALID_SELECTION && it.entryId == "fighter" })
        assertEquals(saved, doc.levels.single().entries.single().selection)
        assertEquals(doc, value(ops.reconcile(doc)).state.document)
        val reverse = value(ops.preview(doc, listOf(order[0], order[2], order[1])))
        assertEquals("custom", reverse.proposed.selections.single().saved.supplierPackageId)
        assertTrue(reverse.affectedSelections.isEmpty())
        assertIs<ContractResult.Unavailable>(ops.preview(doc, packages + packages))
    }

    @Test fun missingInventoryDoesNotBlockUnrelatedCalculationsAndSurvivesSwitchAndExport() = run {
        val source = Source()
        val ops = ContentReconciliation(source, "standard")
        val unknown = SavedSelection("lost-item", "Lost item title", "absent", "old")
        val doc = document().copy(equipment = listOf(EquipmentSelection("inventory", unknown, quantity = 3,
            configuration = mapOf("note" to "keep"))))
        val reconciled = value(ops.reconcile(doc))
        assertTrue(reconciled.selections.first().detailsAvailable)
        assertFalse(reconciled.selections.last().detailsAvailable)
        assertEquals(1, value(reconciled.state.rules.skill(Skill.MEDICINE)).total)
        val preview = value(ops.preview(doc, listOf(packages.first())))
        val committed = value(ops.commit(doc, preview))
        assertEquals(doc.equipment, committed.state.document.equipment)
        assertEquals(committed.state.document, roundTrip(committed.state.document))
        assertTrue(preview.affectedSelections.any { it.instanceId == "inventory" && !it.detailsAvailable })
        val equipped = doc.copy(equipment = doc.equipment.map { it.copy(equipped = true) })
        assertIs<ContractResult.Unavailable>(value(ops.reconcile(equipped)).state.rules.skill(Skill.MEDICINE))
        assertEquals(doc.equipment, value(ops.acknowledge(doc)).state.document.equipment)
    }

    @Test fun inventoryReplacementsAndRepeatedSelectionsSurviveAcknowledgment() = run {
        val source = Source()
        val ops = ContentReconciliation(source, "standard")
        val doc = document().copy(equipment = listOf(EquipmentSelection("inventory", saved)),
            levels = listOf(document().levels.single().copy(replacements = listOf(Replacement(
                ChoiceSlotId("creation", "feat", 0), EntryChoice("replacement", ChoiceSlotId("later", "feat", 0), saved), ReplacementKind.RETRAINING)))))
        source.definitions["custom"] = custom.copy(presentation = Presentation("New title"))
        val state = value(ops.reconcile(doc))
        assertEquals(listOf("class-instance", "replacement", "inventory"), state.selections.map { it.instanceId })
        assertTrue(state.selections.all { it.acknowledgmentRequired })
        val acknowledged = value(ops.acknowledge(doc))
        assertTrue(acknowledged.selections.all { !it.acknowledgmentRequired && it.saved.savedTitle == "New title" })
        assertEquals(doc.equipment.single().instanceId, acknowledged.state.document.equipment.single().instanceId)
        assertEquals(acknowledged.state.document, roundTrip(acknowledged.state.document))
        source.definitions.clear()
        assertIs<ContractResult.Unavailable>(ops.reconcile(doc))
    }
}
