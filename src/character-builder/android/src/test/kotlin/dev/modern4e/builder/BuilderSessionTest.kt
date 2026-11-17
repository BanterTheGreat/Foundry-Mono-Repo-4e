package dev.modern4e.builder

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

/** Exercises the UI coordinator against real bundled rules and private persistence, including failure injection. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BuilderSessionTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore
    private fun sample(): CharacterDocument = (ContractCodec.decode(context.assets.open("proof/samples/sample-fighter-1-base.json")
        .bufferedReader().use { it.readText() }) as ContractResult.Available).value
    /** Historical coordinator assertions use a named proof source, never the production catalog. */
    private fun legacySource() = object : ContentSource {
        private fun text(packageId: String, assetId: String) = context.assets.open("proof/$packageId/$assetId.json")
            .bufferedReader(Charsets.UTF_8).use { it.readText() }
        override suspend fun listPackages() = ContractResult.Available(listOf("modern4e.fighter-proof", "modern4e.fighter-proof.override").map {
            (ContractCodec.decodeManifest(text(it, "manifest")) as ContractResult.Available).value
        })
        override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
            ContractCodec.json.decodeFromString<ContentIndex>(text(packageId, indexId)))
        override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(
            ContractCodec.json.decodeFromString<EntryChunk>(text(packageId, chunkId)))
    }
    private fun session(storage: CharacterStore = store, source: ContentSource = legacySource()) =
        BuilderSession(storage, source, ::sample)
    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }
    @Test fun productionCreationUsesModernIdentityWithoutAdoptingLegacyDecisions() = runBlocking {
        val model = BuilderSession(store, AndroidContentSource(context.assets)) {
            (ContractCodec.decode(context.assets.open("samples/sample-modern-fighter.json")
                .bufferedReader(Charsets.UTF_8).use { it.readText() }) as ContractResult.Available).value
        }
        model.create()
        assertTrue(model.errors.isEmpty())
        val document = model.current!!.document
        val selected = document.levels.flatMap { it.entries }.single()
        assertEquals("modern4e.class.fighter", selected.selection.entryId)
        assertEquals("modern4e.classes", selected.selection.supplierPackageId)
        assertTrue(model.current!!.rules.choices.any { it.slot.choiceId == "modern4e.choice.class-attack-at-will" })
        assertEquals(document, (store.load(document.id) as ContractResult.Available).value)
        assertTrue(sample().levels.first().entries.any { it.selection.entryId == "class3" })
    }
    @Test fun laterProgressionRemainsPortableAndExplicitlyIncomplete() = runBlocking {
        val document = sample().copy(id = "later-progression", level = 4)
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        val advancement = AbilityAdvancement(ChoiceSlotId("advancement.4", "ability", 0), mapOf(Ability.WISDOM to 1))
        model.edit(BuilderEdit.LaterDecisions(LevelDecisions(4, abilityAdvancements = listOf(advancement))))
        assertTrue(model.errors.isEmpty())
        assertTrue(model.current!!.rules.ability(Ability.WISDOM) is ContractResult.Unavailable)
        assertTrue(model.current!!.rules.diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION })
        val reopened = session()
        reopened.load(document.id)
        assertEquals(advancement, reopened.current!!.document.levels.single { it.level == 4 }.abilityAdvancements.single())
        assertTrue(reopened.progressionOptions(4, ChoiceSlotId("advancement.4", "feat", 0)).isNotEmpty())
    }

    @Test fun progressionBackgroundClearsSkillAndPersistsIndependentOrigin() = runBlocking {
        val model = session()
        model.create()
        val id = model.current!!.document.id
        val original = model.current!!.document
        val candidate = model.previewProgression(model.backgroundEdit("environment", "rural"))!!
        assertEquals(original, model.current!!.document)
        assertEquals("rural", candidate.document.identity.environment)
        assertTrue(candidate.document.levels.flatMap { it.proficiencies }.none {
            it.slot.sourceInstanceId.startsWith("background.environment.")
        })
        assertTrue(candidate.rules.choices.any { it.slot == ChoiceSlotId("background.environment.rural", "skill", 0) })
        model.edit(model.backgroundEdit("environment", "rural"))
        val reopened = session()
        reopened.load(id)
        assertEquals("rural", Progression.background(reopened.current!!.document, "environment"))
        val slot = ChoiceSlotId("background.environment.rural", "skill", 0)
        reopened.edit(BuilderEdit.Proficiency(1, ProficiencyChoice(slot, Skill.PERCEPTION)))
        assertEquals(Skill.PERCEPTION, reopened.current!!.document.levels.flatMap { it.proficiencies }.single { it.slot == slot }.skill)
    }

    @Test fun progressionBatchRejectsAtomicallyAndKeepsStableEntryOccurrence() = runBlocking {
        val model = session()
        model.create()
        val original = model.current!!.document
        val slot = ChoiceSlotId("creation", "class", 0)
        val selected = original.levels.flatMap { it.entries }.single { it.slot == slot }
        val options = model.progressionOptions(1, slot)
        assertTrue(options.any { it.entry.entry.id == selected.selection.entryId })
        val draft = model.previewProgression(BuilderEdit.Entry(1, slot, selected.selection.entryId, "new-id", true))!!
        assertEquals(selected.instanceId, draft.document.levels.flatMap { it.entries }.single { it.slot == slot }.instanceId)
        assertNull(model.previewProgression(BuilderEdit.Batch(listOf(
            BuilderEdit.Identity(original.identity.copy(name = "Must not publish")),
            BuilderEdit.Entry(1, slot, "missing-entry", "new-id")
        ))))
        assertEquals(original, model.current!!.document)
    }

    @Test fun createCancelSaveReopenAndContributors() = runBlocking {
        val model = session()
        model.refresh()
        assertTrue(model.characters.isEmpty())
        model.create()
        val id = model.current!!.document.id
        assertEquals("character", model.page)
        assertEquals(1, model.characters.size)
        model.beginEdit("Name")
        model.draft = "Discarded"
        model.cancelEdit()
        assertEquals("New character", model.current!!.document.identity.name)
        model.edit(BuilderEdit.Identity(model.current!!.document.identity.copy(name = "Saved hero", notes = "A story")))
        val reopened = session()
        reopened.load(id)
        assertEquals("Saved hero", reopened.current!!.document.identity.name)
        assertEquals("A story", reopened.current!!.document.identity.notes)
        assertEquals(4, (reopened.current!!.rules.ability(Ability.STRENGTH) as ContractResult.Available).value.total)
        assertTrue((reopened.current!!.rules.skill(Skill.ATHLETICS) as ContractResult.Available).value.contributors.isNotEmpty())
        model.showRecoveries(id)
        assertEquals(1, model.recoveries!!.size)
    }
    @Test fun saveFailureBlocksWorkUntilReturningHomeWithoutPublishingDraft() = runBlocking {
        var fail = false
        val failing = object : CharacterStore by store {
            override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?): ContractResult<SaveReceipt> =
                if (fail) ContractResult.Unavailable(listOf(Diagnostic("test.full", DiagnosticKind.IO_FAILURE, "Storage full")))
                else store.save(document, mode, expected)
        }
        val model = session(failing)
        model.create()
        val original = model.current!!.document
        model.beginEdit("Notes")
        model.draft = "Retain this draft"
        fail = true
        model.edit(BuilderEdit.Identity(original.identity.copy(notes = model.draft)))
        assertEquals(original, model.current!!.document)
        assertEquals("Retain this draft", model.pending!!.identity.notes)
        assertEquals("Notes", model.dialog)
        assertTrue(model.errors.any { it.code == "test.full" })
        assertEquals(original, (store.load(original.id) as ContractResult.Available).value)
        var continued = false
        model.run { continued = true }
        assertFalse(continued)
        model.returnHomeAfterError()
        assertEquals("home", model.page)
        assertNull(model.current)
        assertNull(model.pending)
        assertNull(model.dialog)
        assertEquals("", model.draft)
        assertTrue(model.libraryNeedsRefresh)
        fail = false
        model.run { openLibrary() }
        assertEquals("library", model.page)
        model.run { load(original.id) }
        assertEquals(original, model.current!!.document)
        assertTrue(model.errors.isEmpty())
    }
    @Test fun importCollisionCopyCancelRecoveryAndInvalidInput() = runBlocking {
        val model = session()
        val original = sample()
        model.inspect(ContractCodec.encode(original))
        model.import(ImportAction.IMPORT)
        for (timestamp in listOf("2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z")) {
            model.inspect(ContractCodec.encode(original.copy(savedAt = timestamp)))
            assertEquals(original.savedAt, model.preview!!.existingDetails!!.savedAt)
            assertEquals(timestamp, model.preview!!.incomingDetails.savedAt)
            model.import(ImportAction.CANCEL)
            assertEquals(original, (store.load(original.id) as ContractResult.Available).value)
        }
        model.inspect(ContractCodec.encode(original))
        model.import(ImportAction.COPY)
        assertEquals(2, model.characters.size)
        model.inspect(ContractCodec.encode(original.copy(identity = CharacterIdentity("Replacement"))))
        model.import(ImportAction.REPLACE)
        model.showRecoveries(original.id)
        model.recover(model.recoveries!!.single().recoveryId)
        assertEquals(original, model.preview!!.incoming)
        model.import(ImportAction.REPLACE)
        assertEquals(original, (store.load(original.id) as ContractResult.Available).value)
        model.inspect("{\"formatVersion\":99}")
        assertTrue(model.errors.any { it.kind == DiagnosticKind.INCOMPATIBLE_FORMAT })
        assertNull(model.preview)
        assertEquals(2, (store.list() as ContractResult.Available).value.size)
    }
    @Test fun personalDetailsCancelSaveAndReopenWithoutChangingBuild() = runBlocking {
        val model = session()
        model.create()
        val initial = model.current!!.document
        val details = mapOf("Gender" to "Woman", "Age" to "28", "Deity" to "Erathis",
            "Languages" to "Common, Dwarven", "Size" to "Medium")
        for ((field, value) in details) {
            model.beginEdit(field)
            model.draft = "Discard this"
            model.cancelEdit()
            model.beginEdit(field)
            assertEquals("", model.draft)
            model.draft = value
            model.saveIdentityDraft()
        }
        val reopened = session()
        reopened.load(initial.id)
        for ((field, value) in details) {
            reopened.beginEdit(field)
            assertEquals(value, reopened.draft)
            reopened.cancelEdit()
        }
        assertEquals(initial.abilities, reopened.current!!.document.abilities)
        assertEquals(initial.levels, reopened.current!!.document.levels)
        reopened.beginEdit("Deity")
        reopened.draft = ""
        reopened.saveIdentityDraft()
        reopened.load(initial.id)
        assertEquals("", reopened.current!!.document.identity.deity)
        assertEquals("28", reopened.current!!.document.identity.age)
    }

    @Test fun deletionRequiresConfirmationAndPreservesOtherCharactersAndRecovery() = runBlocking {
        val model = session()
        model.create()
        val first = model.characters.single()
        model.edit(BuilderEdit.Identity(model.current!!.document.identity.copy(notes = "Keep backup")))
        val backups = (store.listRecovery(first.id) as ContractResult.Available).value
        assertEquals(1, backups.size)
        model.requestDeletion(first)
        assertTrue(store.load(first.id) is ContractResult.Available)
        model.cancelDeletion()
        assertNull(model.deleting)
        model.confirmDeletion()
        assertTrue(store.load(first.id) is ContractResult.Available)
        model.create()
        val second = model.current!!.document.id
        model.requestDeletion(first)
        model.confirmDeletion()
        assertNull(model.deleting)
        assertEquals(listOf(second), model.characters.map { it.id })
        assertTrue(store.load(first.id) is ContractResult.Unavailable)
        assertTrue(store.load(second) is ContractResult.Available)
        assertTrue(store.loadRecovery(backups.single().recoveryId) is ContractResult.Available)
        model.requestDeletion(model.characters.single())
        model.confirmDeletion()
        assertNull(model.current)
        assertTrue(model.characters.isEmpty())
    }

    @Test fun deletionFailureReturnsHomeAndPreservesSavedCharacter() = runBlocking {
        var fail = true
        val failing = object : CharacterStore by store {
            override suspend fun delete(id: String): ContractResult<Boolean> = if (fail) {
                ContractResult.Unavailable(listOf(Diagnostic("test.delete", DiagnosticKind.IO_FAILURE, "Cannot delete")))
            } else {
                store.delete(id)
            }
        }
        val model = session(failing)
        model.create()
        val character = model.characters.single()
        model.requestDeletion(character)
        model.confirmDeletion()
        assertEquals(character, model.deleting)
        assertEquals(listOf(character), model.characters)
        assertTrue(model.errors.any { it.code == "test.delete" })
        assertTrue(store.load(character.id) is ContractResult.Available)
        fail = false
        model.run { confirmDeletion() }
        assertNotNull(model.deleting)
        assertTrue(store.load(character.id) is ContractResult.Available)
        model.returnHomeAfterError()
        assertNull(model.deleting)
        assertNull(model.current)
        assertEquals("home", model.page)
        model.run { openLibrary() }
        assertTrue(model.errors.isEmpty())
        assertEquals(listOf(character), model.characters)
    }

    @Test fun importFailureResetDropsAllWorkflowStateAndAllowsFreshImport() = runBlocking {
        val model = session()
        model.create()
        val original = model.current!!.document
        model.beginEdit("Notes")
        model.draft = "Unsaved"
        model.inspect(ContractCodec.encode(original))
        model.showRecoveries(original.id)
        model.requestDeletion(model.characters.single())
        model.run { inspect("unsupported character data") }
        assertTrue(model.errors.isNotEmpty())
        model.returnHomeAfterError()
        assertNull(model.preview)
        assertNull(model.recoveries)
        assertNull(model.deleting)
        assertNull(model.description)
        assertNull(model.dialog)
        assertNull(model.current)
        assertEquals("", model.draft)
        assertEquals(original, (store.load(original.id) as ContractResult.Available).value)
        model.run { inspect(ContractCodec.encode(original)) }
        assertNotNull(model.preview)
        assertTrue(model.errors.isEmpty())
    }

    @Test fun caughtExceptionBlocksFurtherActionsUntilReset() = runBlocking {
        val model = session()
        model.run { error("Unexpected failure") }
        assertFalse(model.busy)
        assertEquals("Unexpected failure", model.errors.single().message)
        var ran = false
        model.run { ran = true }
        assertFalse(ran)
        model.returnHomeAfterError()
        model.run { ran = true }
        assertTrue(ran)
    }

    @Test fun equipmentAndAdjustmentPersistAndRecalculate() = runBlocking {
        val model = session()
        model.create()
        val original = model.current!!
        val before = (original.rules.skill(Skill.ATHLETICS) as ContractResult.Available).value.total
        val item = original.document.equipment.first()
        model.edit(BuilderEdit.Equipment(item.copy(equipped = !item.equipped)))
        model.edit(BuilderEdit.Adjustment(ManualAdjustment("bonus", TypedModifier(
            ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.ATHLETICS), ModifierOperation.ADD, 2), "Training")))
        val reopened = session()
        reopened.load(original.document.id)
        assertEquals(!item.equipped, reopened.current!!.document.equipment.first { it.instanceId == item.instanceId }.equipped)
        val result = (reopened.current!!.rules.skill(Skill.ATHLETICS) as ContractResult.Available).value
        assertEquals(before + 2, result.total)
        assertTrue(result.contributors.any { it.label == "Manual Adjustment" })
        reopened.edit(BuilderEdit.RemoveAdjustment("bonus"))
        assertEquals(before, (reopened.current!!.rules.skill(Skill.ATHLETICS) as ContractResult.Available).value.total)
    }
    @Test fun missingContentRetainsTitleAndAllowsIdentityEdits() = runBlocking {
        val original = sample().let { doc -> doc.copy(levels = doc.levels.map { level -> level.copy(entries = level.entries.map { choice ->
            choice.copy(selection = choice.selection.copy(supplierPackageId = "missing.package", savedTitle = "Missing custom entry"))
        }) }) }
        store.save(original, SaveMode.CREATE)
        val model = session()
        model.load(original.id)
        assertTrue(model.current!!.rules.diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT })
        assertTrue(model.current!!.rules.ability(Ability.STRENGTH) is ContractResult.Unavailable)
        model.edit(BuilderEdit.Identity(original.identity.copy(notes = "Still editable")))
        assertEquals("Still editable", model.current!!.document.identity.notes)
        assertEquals("Missing custom entry", model.current!!.document.levels.first().entries.first().selection.savedTitle)
        model.details(original.levels.first().entries.first().selection)
        assertNull(model.description)
    }
}
