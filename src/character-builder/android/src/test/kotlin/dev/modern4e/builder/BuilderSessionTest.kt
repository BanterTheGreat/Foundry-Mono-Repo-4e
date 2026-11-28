package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.defenseDisplay
import dev.modern4e.builder.ui.screens.languageDisplay
import dev.modern4e.builder.ui.screens.sizeDisplay
import dev.modern4e.builder.ui.screens.skillOverviewRows
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.concurrent.atomic.AtomicInteger
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
    private fun sample(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value
    private fun session(storage: CharacterStore = store, source: ContentSource = AndroidContentSource(context.assets)) =
        BuilderSession(storage, source, ::sample).also { it.listings.settleMillis = 0 }

    /**
     * A session whose option listing cache never warms in the background, for tests of the session's own work (edit
     * queue, saves, dialogs, previews). Warm-up itself is covered by [OptionListingCacheTest].
     */
    private fun quietSession(storage: CharacterStore = store, source: ContentSource = AndroidContentSource(context.assets)) =
        session(storage, source).also { it.listings.close() }
    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    @Test fun classAndAncestryRowsAreNeverEligibilityCheckedAndAncestriesListTheirFeatures() = runBlocking {
        val model = session()
        model.create()
        model.listings.settleMillis = 60_000
        for (choice in listOf("class", "ancestry")) {
            var last = emptyList<BuilderOptionRow>()
            model.progressionOptionRows(1, ChoiceSlotId("creation", choice, 0)) { last = it }
            assertTrue(last.isNotEmpty())
            assertTrue(last.all { it.checked && it.option?.eligibility == Eligibility.ELIGIBLE && it.diagnostics.isEmpty() })
        }
        var ancestries = emptyList<BuilderOptionRow>()
        model.progressionOptionRows(1, ChoiceSlotId("creation", "ancestry", 0)) { ancestries = it }
        val deva = ancestries.first { it.metadata.metadata.id == "modern4e.ancestry.deva" }
        assertTrue(deva.checked)
        val features = deva.ancestryGrants
        assertEquals(listOf("Astral Majesty", "Astral Resistance", "Immortal Origin", "Memory of a Thousand Lifetimes"),
            features.map { it.presentation.title })
        assertTrue(features.all { it.presentation.description.isNotBlank() })
    }

    private var touches = 0

    /** An edit that changes the rules inputs (unlike a rename), so every non-root list built earlier is out of date. */
    private suspend fun BuilderSession.touchRules() = edit(BuilderEdit.Adjustment(ManualAdjustment("touch-${touches++}",
        TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.ATHLETICS), ModifierOperation.ADD, 1), "Touch")))

    /** The first rows a picker publishes for one slot; later batches are cancelled before they run. */
    private suspend fun BuilderSession.firstRows(level: Int, slot: ChoiceSlotId, group: FeatGroup? = null): List<BuilderOptionRow> {
        var first: List<BuilderOptionRow>? = null
        try {
            progressionOptionRows(level, slot, group) {
                first = it
                throw kotlinx.coroutines.CancellationException("Only inspect the opening rows")
            }
        } catch (_: kotlinx.coroutines.CancellationException) { }
        return first!!
    }

    private suspend fun BuilderSession.firstFeatRows(group: FeatGroup) = firstRows(1, ChoiceSlotId("creation", "feat", 0), group)

    /** The sample fighter with its attack powers unpicked, so every pool starts open and cold. */
    private fun openPoolSession(source: ContentSource = AndroidContentSource(context.assets)) = BuilderSession(store, source) {
        sample().let { document -> document.copy(levels = document.levels.map { level ->
            level.copy(entries = level.entries.filterNot { it.slot.choiceId.startsWith("modern4e.choice.class-attack") })
        }) }
    }.also { it.listings.settleMillis = 0 }

    /** Every level 1 list the Progression screen can open as a catalog picker, plus the three root pickers and the feat slot. */
    private fun BuilderSession.level1Pickers(): List<Triple<Int, ChoiceSlotId, FeatGroup?>> {
        val state = current!!
        val choices = Progression.levelChoices(state, 1).filter { it.abilities.isEmpty() && it.entries.isNotEmpty() }
            .map { Triple(1, it.slot, null as FeatGroup?) }
        val roots = listOf("class", "ancestry", "theme").map { Triple(1, ChoiceSlotId("creation", it, 0), null as FeatGroup?) }
        val feats = FeatGroup.entries.map { Triple(1, ChoiceSlotId("creation", "feat", 0), it as FeatGroup?) }
        return choices + roots + feats
    }

    private suspend fun BuilderSession.assertEveryLevel1ListIsWarm(message: String) {
        for ((level, slot, group) in level1Pickers()) {
            val rows = firstRows(level, slot, group)
            assertTrue("$message: ${slot.choiceId}#${slot.ordinal} $group opens checked", rows.isNotEmpty() && rows.all { it.checked })
        }
    }

    /** Session wiring: loading a stored character hands it to the cache, which warms every list it can open. */
    @Test fun loadingACharacterWarmsEveryListItCanOpen() = runBlocking {
        val model = quietSession()
        model.create()
        val id = model.current!!.document.id
        // A reloaded character starts cold and warms every list without any edit.
        val reopened = session()
        reopened.load(id)
        reopened.awaitWarmup()
        assertTrue(reopened.errors.isEmpty())
        reopened.assertEveryLevel1ListIsWarm("Reloaded character")
    }

    /** Session wiring: each saved edit is committed into the cache, whose warmed rows follow the new ancestry. */
    @Test fun ancestryFeatRowsFollowTheSelectedAncestryAtEarlyAndLaterLevels() = runBlocking {
        val model = session()
        model.create()
        val ancestrySlot = ChoiceSlotId("creation", "ancestry", 0)
        val human = "modern4e.ancestry.human"
        val dwarf = "modern4e.ancestry.dwarf"

        model.edit(BuilderEdit.Entry(1, ancestrySlot, human, "ancestry-human", true))
        model.awaitWarmup()
        val humanRows = model.firstFeatRows(FeatGroup.ANCESTRY)
        assertTrue(humanRows.isNotEmpty() && humanRows.all { it.checked && human in it.metadata.metadata.featAncestryIds })

        model.edit(BuilderEdit.Entry(1, ancestrySlot, dwarf, "ancestry-dwarf", true))
        model.awaitWarmup()
        val dwarfRows = model.firstFeatRows(FeatGroup.ANCESTRY)
        assertTrue(dwarfRows.isNotEmpty() && dwarfRows.all { it.checked && dwarf in it.metadata.metadata.featAncestryIds })
        assertTrue(humanRows.none { it.metadata.metadata.id in dwarfRows.map { row -> row.metadata.metadata.id } })

        model.edit(BuilderEdit.Level(4))
        val laterRows = model.firstRows(4, ChoiceSlotId("advancement.4", "feat", 0), FeatGroup.ANCESTRY)
        assertEquals(dwarfRows.map { it.metadata.metadata.id }, laterRows.map { it.metadata.metadata.id })
    }

    @Test fun upcomingUtilityCanBePickedAndKeptWhenLoweringLevel() = runBlocking {
        val model = openPoolSession()
        model.create()
        val active = model.current!!
        val preview = model.progressionPreview(active, BuilderSession.MAX_LEVEL)
        val utility = Progression.levelChoices(preview, 2).single { it.slot.choiceId == "modern4e.choice.class-utility-2" }
        assertEquals(active, model.current)
        assertTrue(Progression.levelChoices(active, 2).none { it.slot == utility.slot })

        var rows = emptyList<BuilderOptionRow>()
        model.progressionOptionRows(2, utility.slot) { rows = it }
        val option = rows.first { it.option?.eligibility == Eligibility.ELIGIBLE }
        model.edit(BuilderEdit.Entry(2, utility.slot, option.metadata.metadata.id, model.progressionEntryInstance(2, utility.slot)))
        assertTrue(model.errors.isEmpty())
        val planned = model.current!!.document.levels.single { it.level == 2 }.entries.single { it.slot == utility.slot }
        assertEquals(active.rules, model.current!!.rules)

        model.beginLevelChange()
        model.adjustLevelTarget(2)
        model.confirmLevelChange()
        assertTrue(model.current!!.rules.entries.any { it.instanceId == planned.instanceId })

        model.beginLevelChange()
        model.adjustLevelTarget(1)
        model.confirmLevelChange()
        assertTrue(model.errors.isEmpty())
        assertEquals(active.rules, model.current!!.rules)
        assertEquals(planned, model.current!!.document.levels.single { it.level == 2 }.entries.single { it.slot == utility.slot })
    }

    /** Session wiring: creating another character resets the cache, and a later edit refreshes its warmed rows. */
    @Test fun classFeatPickerScopesAlternativeClassesAndRefreshesForMulticlassAccess() = runBlocking {
        val model = session()
        val slot = ChoiceSlotId("creation", "feat", 0)
        val sharedFeat = "modern4e.feat.phalanx-warrior-paragon-fighter"
        val fighterOnly = "modern4e.feat.deep-gash"

        model.create("modern4e.class.fighter")
        model.awaitWarmup()
        val fighter = model.firstRows(1, slot, FeatGroup.CLASS).associateBy { it.metadata.metadata.id }
        assertTrue(sharedFeat in fighter)
        assertTrue(fighterOnly in fighter)
        assertEquals(Eligibility.INELIGIBLE, fighter.getValue(sharedFeat).option?.eligibility)

        model.create("modern4e.class.warlord")
        model.awaitWarmup()
        val warlord = model.firstRows(1, slot, FeatGroup.CLASS).map { it.metadata.metadata.id }
        assertTrue(sharedFeat in warlord)
        assertFalse(fighterOnly in warlord)

        model.create("modern4e.class.avenger")
        model.awaitWarmup()
        assertFalse(model.firstRows(1, slot, FeatGroup.CLASS).any { it.metadata.metadata.id == sharedFeat })
        model.edit(BuilderEdit.Entry(1, slot, "modern4e.feat.student-of-the-sword", "feat-fighter",
            acceptIneligible = true))
        assertTrue(model.errors.isEmpty())
        model.awaitWarmup()
        assertTrue(model.firstRows(1, slot, FeatGroup.CLASS).any { it.metadata.metadata.id == sharedFeat })
    }

    @Test fun homePreloadsClassAndAncestryRowsBeforeAnyCharacterIsSelected() = runBlocking {
        val real = AndroidContentSource(context.assets)
        val reads = AtomicInteger()
        val ancestryReads = AtomicInteger()
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads.incrementAndGet()
                if (packageId == "modern4e.ancestries") {
                    ancestryReads.incrementAndGet()
                }
                return real.loadChunk(packageId, chunkId)
            }
        }
        // Home's own preload is under test; the cache's background warming is not.
        val model = quietSession(source = source)
        model.preloadHomePickers()
        assertEquals("home", model.page)
        assertNull(model.current)
        assertNull(model.classMenu)
        assertTrue(ancestryReads.get() > 0)

        val preloadedReads = reads.get()
        model.beginCreate()
        assertTrue(model.classMenu!!.all { it.checked })
        assertEquals(preloadedReads, reads.get())
        model.create("modern4e.class.fighter")
        val ancestry = ChoiceSlotId("creation", "ancestry", 0)
        val classSlot = ChoiceSlotId("creation", "class", 0)
        assertTrue(model.listings.warmTargets(model.current!!).none { it.slot == ancestry || it.slot == classSlot })
        val rows = model.firstRows(1, ancestry)
        assertTrue(rows.isNotEmpty() && rows.all { it.checked })
        assertTrue(rows.first { it.metadata.metadata.id == "modern4e.ancestry.deva" }.ancestryGrants.isNotEmpty())

        val differentPackages = model.current!!.document.copy(
            id = "without-ancestry-package",
            packages = model.current!!.document.packages.filterNot { it.packageId == "modern4e.ancestries" },
        )
        store.save(differentPackages, SaveMode.CREATE)
        model.load(differentPackages.id)
        assertEquals(differentPackages.id, model.current!!.document.id)
        assertTrue("The default catalog cannot supply ancestries for this character", model.firstRows(1, ancestry).isEmpty())
    }

    @Test fun characterChangesStopOldPickerUpdatesAndContentFailuresUseBlockingErrors() = runBlocking {
        val real = AndroidContentSource(context.assets)
        var failReads = false
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> =
                if (failReads) ContractResult.Unavailable(listOf(Diagnostic("test.read", DiagnosticKind.IO_FAILURE, "Cannot load content")))
                else real.loadChunk(packageId, chunkId)
        }
        val model = session(source = source)
        model.create()
        // The finished open warm-up has read the content the edit's snapshot reuses below; hold later warming off so
        // only the picker meets the failing reads.
        model.awaitWarmup()
        model.listings.settleMillis = 60_000
        var updates = 0
        val slot = ChoiceSlotId("creation", "feat", 0)
        model.progressionOptionRows(1, slot, FeatGroup.GENERAL) {
            updates++
            model.touchRules()
        }
        assertEquals(1, updates)
        failReads = true
        model.progressionOptionRows(1, slot, FeatGroup.GENERAL) { }
        assertTrue("An edit reuses its catalog snapshot without rereading failed storage", model.errors.isEmpty())
        model.load(model.current!!.document.id)
        model.progressionOptionRows(1, slot, FeatGroup.GENERAL) { }
        assertTrue(model.errors.any { it.kind == DiagnosticKind.IO_FAILURE })
    }
    @Test fun structuredLinguistEditsPersistAndReopenWithGrantsAndRejectedDuplicates() = runBlocking {
        val model = session()
        model.create()
        val id = model.current!!.document.id
        model.edit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "feat", 0), "modern4e.feat.linguist", "linguist"))
        assertTrue(model.errors.isEmpty())
        val occurrence = model.current!!.document.levels.flatMap { it.entries }.single { it.selection.entryId == "modern4e.feat.linguist" }.instanceId
        val choices = model.current!!.rules.choices.filter { it.slot.sourceInstanceId == occurrence && it.valueKind == FactKind.LANGUAGE }
        assertEquals(3, choices.size)
        val picked = mutableSetOf<String>()
        for (choice in choices) {
            val current = model.current!!.rules.choices.single { it.slot == choice.slot }
            val option = current.values.first { it.id !in picked }
            model.edit(BuilderEdit.Value(1, ValueChoice(choice.slot, option.id)))
            assertTrue(model.errors.isEmpty())
            picked += option.id
        }
        val bonus = model.current!!.rules.choices.single { it.slot.sourceInstanceId == occurrence && it.valueKind == FactKind.SKILL_BONUS }
        model.edit(BuilderEdit.Value(1, ValueChoice(bonus.slot, "SOCIETY")))
        assertTrue(model.errors.isEmpty())
        val reopened = session()
        reopened.load(id)
        assertEquals(4, reopened.current!!.document.levels.flatMap { it.values }.count { it.slot.sourceInstanceId == occurrence })
        assertTrue(reopened.current!!.rules.facts.filter { it.kind == FactKind.LANGUAGE }.map { it.value }.containsAll(picked))
        val committed = reopened.current!!.document
        val rejected = reopened.previewProgression(BuilderEdit.Value(1, ValueChoice(choices[1].slot, picked.first())))
        assertNull(rejected)
        assertEquals(committed, reopened.current!!.document)
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
        assertTrue(document.packages.none { it.packageId.contains("proof") || it.packageId.startsWith("test.") })
    }
    @Test fun laterProgressionUsesValidatedAdvancementAndReopens() = runBlocking {
        val document = sample().copy(id = "later-progression", level = 8)
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        val pair = mapOf(Ability.WISDOM to 1, Ability.STRENGTH to 1)
        val advancement = AbilityAdvancement(AdvancementRules.abilitySlot(8), pair)
        val epic = AbilityAdvancement(AdvancementRules.abilitySlot(28), pair)
        val starting = model.current!!.rules.overviewAbilityTotals.getValue(Ability.WISDOM)
        model.edit(BuilderEdit.Advancement(8, advancement))
        model.edit(BuilderEdit.Advancement(14, AbilityAdvancement(AdvancementRules.abilitySlot(14), pair)))
        model.edit(BuilderEdit.Advancement(28, epic))
        assertTrue(model.errors.isEmpty())
        assertEquals(starting + 1, model.current!!.rules.overviewAbilityTotals.getValue(Ability.WISDOM))
        assertFalse(model.current!!.rules.diagnostics.any { it.code in setOf("engine.abilityAdvancement", "engine.missingAdvancement") })

        val reopened = session()
        reopened.load(document.id)
        val levels = reopened.current!!.document.levels
        assertEquals(advancement, levels.single { it.level == 8 }.abilityAdvancements.single())
        assertEquals(epic, levels.single { it.level == 28 }.abilityAdvancements.single())
        reopened.edit(BuilderEdit.Level(28))
        assertEquals(starting + 4, reopened.current!!.rules.overviewAbilityTotals.getValue(Ability.WISDOM))
        reopened.edit(BuilderEdit.Level(7))
        assertEquals(starting, reopened.current!!.rules.overviewAbilityTotals.getValue(Ability.WISDOM))
        assertEquals(epic, reopened.current!!.document.levels.single { it.level == 28 }.abilityAdvancements.single())
        reopened.edit(BuilderEdit.Level(28))
        assertEquals(starting + 4, reopened.current!!.rules.overviewAbilityTotals.getValue(Ability.WISDOM))
    }

    @Test fun reachingParagonEnablesBundledPathsWithoutChangingSavedSuppliersOrOverrideOrder() = runBlocking {
        val base = sample()
        val document = base.copy(id = "paths-existing", level = 10,
            packages = base.packages.filterNot { it.packageId == "modern4e.paths" })
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        model.edit(BuilderEdit.Level(11))
        assertTrue(model.errors.isEmpty())
        val updated = model.current!!.document
        assertEquals(document.packages, updated.packages.filterNot { it.packageId == "modern4e.paths" })
        assertEquals(document.levels.flatMap { it.entries }, updated.levels.flatMap { it.entries })
        assertEquals(1, updated.packages.count { it.packageId == "modern4e.paths" })
        assertTrue(model.progressionOptions(11, ChoiceSlotId("advancement.11", "paragon-path", 0)).isNotEmpty())
        val reopened = session()
        reopened.load(document.id)
        assertEquals(updated.packages, reopened.current!!.document.packages)
    }

    @Test fun levelDialogChangesLevelOnConfirmAndHonorsBothBounds() = runBlocking {
        val document = sample().copy(id = "level-dialog")
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        val before = model.current!!.document

        model.beginLevelChange()
        assertEquals(before.level + 1, model.levelTarget)
        model.adjustLevelTarget(before.level - 3)
        assertEquals(1, model.levelTarget)
        model.adjustLevelTarget(99)
        assertEquals(BuilderSession.MAX_LEVEL, model.levelTarget)
        model.cancelLevelChange()
        assertNull(model.levelTarget)
        model.confirmLevelChange()
        assertEquals(before, model.current!!.document)
        assertEquals(before, (store.load(document.id) as ContractResult.Available).value)

        model.beginLevelChange()
        model.adjustLevelTarget(before.level)
        model.confirmLevelChange()
        assertNull(model.levelTarget)
        assertEquals(before, model.current!!.document)

        model.beginLevelChange()
        model.adjustLevelTarget(4)
        model.confirmLevelChange()
        assertTrue(model.errors.isEmpty())
        assertNull(model.levelTarget)
        assertEquals(4, model.current!!.document.level)
        assertEquals((1..4).toList(), model.current!!.document.levels.map { it.level }.sorted())
        assertTrue(model.current!!.rules.diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION })
        assertEquals(4, (store.load(document.id) as ContractResult.Available).value.level)
        val reopened = session()
        reopened.load(document.id)
        assertEquals(4, reopened.current!!.document.level)

        model.beginLevelChange()
        assertEquals(5, model.levelTarget)
        model.adjustLevelTarget(BuilderSession.MAX_LEVEL)
        model.confirmLevelChange()
        assertEquals(BuilderSession.MAX_LEVEL, model.current!!.document.level)
        model.beginLevelChange()
        assertEquals(BuilderSession.MAX_LEVEL, model.levelTarget)
        model.confirmLevelChange()
        assertEquals(BuilderSession.MAX_LEVEL, model.current!!.document.level)

        val beforeLowering = model.current!!.document
        model.beginLevelChange()
        model.adjustLevelTarget(1)
        model.cancelLevelChange()
        assertEquals(BuilderSession.MAX_LEVEL, model.current!!.document.level)
        model.beginLevelChange()
        model.adjustLevelTarget(0)
        assertEquals(1, model.levelTarget)
        model.confirmLevelChange()
        assertTrue(model.errors.isEmpty())
        reopened.load(document.id)
        assertEquals(1, reopened.current!!.document.level)
        assertEquals(beforeLowering.levels, reopened.current!!.document.levels)
        val history = (store.listRecovery(document.id) as ContractResult.Available).value
        val previousHighLevel = history.single { it.character.level == BuilderSession.MAX_LEVEL }
        assertEquals(beforeLowering, (store.loadRecovery(previousHighLevel.recoveryId) as ContractResult.Available).value)
    }

    @Test fun copyDialogStoresAndOpensANamedCopyAndLeavesTheOriginalAlone() = runBlocking {
        val document = sample().copy(id = "copy-source", identity = sample().identity.copy(name = "Original"))
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        model.refresh()
        val original = model.current!!.document

        model.beginCopy()
        assertEquals("Original (copy)", model.copyName)
        model.cancelCopy()
        assertNull(model.copyName)
        assertEquals(1, (store.list() as ContractResult.Available).value.size)

        model.beginCopy()
        model.copyName = "   "
        model.confirmCopy()
        assertEquals(1, (store.list() as ContractResult.Available).value.size)
        assertEquals("   ", model.copyName)

        model.page = "character"
        model.copyName = "  Twin  "
        model.confirmCopy()
        assertTrue(model.errors.isEmpty())
        assertNull(model.copyName)
        val copy = model.current!!.document
        assertNotEquals(original.id, copy.id)
        assertEquals("Twin", copy.identity.name)
        assertEquals(original.copy(id = copy.id, savedAt = copy.savedAt, identity = original.identity.copy(name = "Twin")), copy)
        assertEquals("character", model.page)
        assertEquals(copy, (store.load(copy.id) as ContractResult.Available).value)
        assertEquals(original, (store.load(original.id) as ContractResult.Available).value)
        assertEquals(setOf(original.id, copy.id), model.characters.map { it.id }.toSet())
        assertTrue((store.listRecovery(copy.id) as ContractResult.Available).value.isEmpty())
    }

    @Test fun disabledBackgroundsKeepTheSavedOriginWithoutOfferingItsSkill() = runBlocking {
        val model = session()
        model.create()
        val id = model.current!!.document.id
        model.edit(model.backgroundEdit("environment", "rural"))
        val reopened = session()
        reopened.load(id)
        assertEquals("rural", Progression.background(reopened.current!!.document, "environment"))
        val slot = ChoiceSlotId("background.environment.rural", "skill", 0)
        assertTrue(reopened.current!!.rules.choices.none { it.slot == slot })
        assertNull(reopened.previewProgression(BuilderEdit.Proficiency(1, ProficiencyChoice(slot, Skill.RELIGION))))
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
        var listCalls = 0
        val storage = object : CharacterStore by store {
            override suspend fun list(): ContractResult<List<CharacterSummary>> {
                listCalls++
                return store.list()
            }
        }
        val model = session(storage)
        model.refresh()
        assertTrue(model.characters.isEmpty())
        model.create()
        val id = model.current!!.document.id
        assertEquals("progression", model.page)
        assertEquals(1, model.characters.size)
        model.beginEdit("Name")
        model.draft = "Discarded"
        model.cancelEdit()
        assertEquals("New character", model.current!!.document.identity.name)
        val listCallsBeforeEdit = listCalls
        model.edit(BuilderEdit.Identity(model.current!!.document.identity.copy(name = "Saved hero", notes = "A story")))
        val saved = model.current!!.document
        model.openLibrary()
        assertEquals("library", model.page)
        assertEquals(listCallsBeforeEdit, listCalls)
        val expectedSummary = CharacterSummary(id, "Saved hero", saved.savedAt, saved.level, "Dwarf", "Fighter")
        assertEquals(expectedSummary, model.characters.single())
        assertEquals("Level 1 Dwarf Fighter", expectedSummary.levelDescription)
        assertEquals(expectedSummary, (store.list() as ContractResult.Available).value.single())
        val reopened = session()
        reopened.load(id)
        assertEquals("progression", reopened.page)
        reopened.page = "stats"
        reopened.navigateBack()
        assertTrue(reopened.confirmReturnToLibrary)
        assertEquals("stats", reopened.page)
        reopened.resolveBackConfirmation(leave = false)
        assertFalse(reopened.confirmReturnToLibrary)
        assertEquals("stats", reopened.page)
        reopened.navigateBack()
        reopened.resolveBackConfirmation(leave = true)
        assertFalse(reopened.confirmReturnToLibrary)
        assertEquals("library", reopened.page)
        assertEquals("Saved hero", reopened.current!!.document.identity.name)
        assertEquals("A story", reopened.current!!.document.identity.notes)
        assertEquals(4, reopened.current!!.rules.overviewAbilityTotals.getValue(Ability.STRENGTH))
        assertTrue((reopened.current!!.rules.displayedSkill(Skill.ATHLETICS) as ContractResult.Available).value.contributors.isNotEmpty())
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
        val originalLibrary = model.characters
        model.beginEdit("Notes")
        model.draft = "Retain this draft"
        fail = true
        model.edit(BuilderEdit.Identity(original.identity.copy(notes = model.draft)))
        assertEquals(original, model.current!!.document)
        assertEquals(originalLibrary, model.characters)
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
    @Test fun anExceptionKeepsItsStackTraceForTheErrorReportUntilReturningHome() = runBlocking {
        val model = quietSession()
        assertNull(model.errorTrace)
        model.run { throw IllegalStateException("boom", IllegalArgumentException("the cause")) }
        assertEquals("boom", model.errors.single().message)
        val trace = model.errorTrace!!
        assertTrue(trace.startsWith("java.lang.IllegalStateException: boom"))
        assertTrue(trace.contains("BuilderSessionTest"))
        assertTrue(trace.contains("Caused by: java.lang.IllegalArgumentException: the cause"))
        model.returnHomeAfterError()
        assertTrue(model.errors.isEmpty())
        assertNull(model.errorTrace)
    }
    @Test fun successfulSavePublishesCalculatedStateWithoutReadingContentAgain() = runBlocking {
        val readsAfterSave = AtomicInteger()
        var saved = false
        var inspectSave: ((CharacterDocument) -> Unit)? = null
        val real = AndroidContentSource(context.assets)
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                if (saved) {
                    readsAfterSave.incrementAndGet()
                }
                return real.loadChunk(packageId, chunkId)
            }
        }
        val storage = object : CharacterStore by store {
            override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?): ContractResult<SaveReceipt> {
                inspectSave?.invoke(document)
                return store.save(document, mode, expected).also {
                    if (inspectSave != null && it is ContractResult.Available) {
                        saved = true
                    }
                }
            }
        }
        // The commit path itself must not read content; background warming would, so keep it out of this test.
        val model = quietSession(storage, source)
        model.create()
        val original = model.current!!
        val adjustment = ManualAdjustment("save-bonus", TypedModifier(
            ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.ATHLETICS), ModifierOperation.ADD, 2), "Training")
        inspectSave = { document ->
            assertSame(original, model.current)
            assertEquals(document, model.pending)
            assertEquals(listOf(adjustment), document.manualAdjustments)
        }
        model.edit(BuilderEdit.Adjustment(adjustment))
        assertTrue(model.errors.isEmpty())
        assertEquals(0, readsAfterSave.get())
        assertNull(model.pending)
        val committed = model.current!!
        assertEquals(committed.document, (store.load(original.document.id) as ContractResult.Available).value)
        assertEquals(original.document.levels, committed.document.levels)
        val before = (original.rules.displayedSkill(Skill.ATHLETICS) as ContractResult.Available).value.total
        val result = (committed.rules.displayedSkill(Skill.ATHLETICS) as ContractResult.Available).value
        assertEquals(before + 2, result.total)
        assertTrue(result.contributors.any { it.label == "Manual Adjustment" })
    }
    private fun bonus(id: String) = BuilderEdit.Adjustment(ManualAdjustment(id, TypedModifier(
        ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.ATHLETICS), ModifierOperation.ADD, 1), id))

    /** A store whose saves wait at [gate] once [blocking] is set, announcing the first one on [entered]. */
    private inner class GatedStore(val gate: CompletableDeferred<Unit> = CompletableDeferred()) : CharacterStore by store {
        @Volatile var blocking = false
        @Volatile var failing: ((CharacterDocument) -> Boolean)? = null
        val entered = CompletableDeferred<Unit>()
        val saves = AtomicInteger()
        override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?): ContractResult<SaveReceipt> {
            if (blocking) {
                entered.complete(Unit)
                gate.await()
            }
            if (failing?.invoke(document) == true) {
                return ContractResult.Unavailable(listOf(Diagnostic("test.full", DiagnosticKind.IO_FAILURE, "Storage full")))
            }
            saves.incrementAndGet()
            return store.save(document, mode, expected)
        }
    }

    @Test fun submittedEditReturnsAtOnceCommitsInTheBackgroundAndHoldsExportUntilStored() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        val original = model.current!!
        assertTrue(model.canExport)
        storage.blocking = true
        model.submitEdit(bonus("first"))
        assertTrue("The call returns while the save is still waiting", model.saving)
        assertFalse("A file taken now could miss the choice", model.canExport)
        storage.entered.await()
        assertSame("Nothing is published before it is stored", original, model.current)
        assertFalse(model.busy)
        storage.gate.complete(Unit)
        model.awaitSaved()
        assertFalse(model.saving)
        assertTrue(model.canExport)
        assertEquals(listOf("first"), model.current!!.document.manualAdjustments.map { it.id })
        assertEquals(model.current!!.document, (store.load(original.document.id) as ContractResult.Available).value)
    }

    @Test fun quickEditsApplyInOrderEachToTheResultOfTheOneBefore() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        storage.blocking = true
        model.submitEdit(bonus("a"))
        model.submitEdit(bonus("b"))
        storage.entered.await()
        model.submitEdit(bonus("c"))
        storage.gate.complete(Unit)
        model.awaitSaved()
        assertTrue(model.errors.isEmpty())
        assertEquals(listOf("a", "b", "c"), model.current!!.document.manualAdjustments.map { it.id })
        assertEquals(3, storage.saves.get() - 1)
        val stored = (store.load(model.current!!.document.id) as ContractResult.Available).value
        assertEquals(listOf("a", "b", "c"), stored.manualAdjustments.map { it.id })
    }

    @Test fun aFailedQueuedEditDropsTheOnesBehindItAndLeavesTheStoredCharacterUntouched() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        val original = model.current!!.document
        storage.failing = { document -> document.manualAdjustments.any { it.id == "bad" } }
        storage.blocking = true
        model.submitEdit(bonus("bad"))
        model.submitEdit(bonus("after"))
        storage.gate.complete(Unit)
        model.awaitSaved()
        assertTrue(model.errors.any { it.code == "test.full" })
        assertFalse(model.saving)
        assertEquals(original, model.current!!.document)
        assertEquals(original, (store.load(original.id) as ContractResult.Available).value)
        assertFalse(model.canExport)
        model.submitEdit(bonus("blocked"))
        assertFalse("Nothing is queued behind an error", model.saving)
        model.returnHomeAfterError()
        storage.failing = null
        model.run { load(original.id) }
        model.submitEdit(bonus("fresh"))
        model.awaitSaved()
        assertEquals(listOf("fresh"), model.current!!.document.manualAdjustments.map { it.id })
    }

    @Test fun aQueuedChoiceShowsInItsSlotUntilItCommitsAndNeverClosesAnOpenDialog() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        val slot = ChoiceSlotId("creation", "class", 0)
        val selected = model.current!!.document.levels.flatMap { it.entries }.single { it.slot == slot }.selection.entryId
        model.beginEdit("Notes")
        storage.blocking = true
        model.submitEdit(BuilderEdit.Entry(1, slot, selected, "new-id", true), "Shown early")
        assertEquals("Shown early", model.pendingSelection(slot)?.title)
        storage.entered.await()
        model.submitEdit(BuilderEdit.RemoveEntry(ChoiceSlotId("creation", "theme", 0)))
        assertNull("Clearing is a pending selection with no title", model.pendingSelection(ChoiceSlotId("creation", "theme", 0))!!.title)
        storage.gate.complete(Unit)
        model.awaitSaved()
        assertNull(model.pendingSelection(slot))
        assertNull(model.pendingSelection(ChoiceSlotId("creation", "theme", 0)))
        assertEquals("The dialog belongs to its own edit", "Notes", model.dialog)
    }

    @Test fun aFieldStaysMarkedSavingUntilItsLastQueuedEditCommits() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        val field = "field-a"
        assertFalse(model.isSaving(field))
        storage.blocking = true
        model.submitEdit(bonus("first"), field = field)
        assertTrue(model.isSaving(field))
        assertFalse("Other fields are untouched", model.isSaving("field-b"))
        storage.entered.await()
        model.submitEdit(bonus("second"), field = field)
        model.submitEdit(bonus("elsewhere"))
        storage.gate.complete(Unit)
        model.awaitSaved()
        assertFalse("The mark clears once every edit for the field has committed", model.isSaving(field))
        assertEquals(listOf("first", "second", "elsewhere"), model.current!!.document.manualAdjustments.map { it.id })
    }

    @Test fun aFieldIsNoLongerSavingWhenItsEditIsRejectedOrDropped() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        storage.failing = { document -> document.manualAdjustments.any { it.id == "bad" } }
        storage.blocking = true
        model.submitEdit(bonus("bad"), field = "failed")
        model.submitEdit(bonus("after"), field = "dropped")
        assertTrue(model.isSaving("failed"))
        assertTrue(model.isSaving("dropped"))
        storage.gate.complete(Unit)
        model.awaitSaved()
        assertTrue(model.errors.any { it.code == "test.full" })
        assertFalse(model.isSaving("failed"))
        assertFalse(model.isSaving("dropped"))
        model.submitEdit(bonus("blocked"), field = "blocked")
        assertFalse("Nothing is queued behind an error", model.isSaving("blocked"))
    }

    @Test fun theFullLengthPreviewIsRememberedForTheCharacterUntilTheSessionLeavesIt() = runBlocking {
        val document = sample().copy(id = "preview-cache")
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        val state = model.current!!
        assertNull("Nothing is remembered before the first preview", model.cachedFuturePreview(document.id))

        model.progressionPreview(state, 5)
        assertNull("Only the full-length preview is the one Levels shows for upcoming levels", model.cachedFuturePreview(document.id))
        val preview = model.progressionPreview(state, BuilderSession.MAX_LEVEL)
        assertEquals(BuilderSession.MAX_LEVEL, preview.document.level)
        assertSame(preview, model.cachedFuturePreview(document.id))
        assertNull("Another character never sees it", model.cachedFuturePreview("someone-else"))

        model.returnHomeAfterError()
        assertNull(model.cachedFuturePreview(document.id))
    }

    @Test fun anUpcomingLevelPreviewIsReusedForTheSameCharacterAndForgottenAfterAnEdit() = runBlocking {
        val document = sample().copy(id = "level-preview-cache")
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        val state = model.current!!
        assertNull("Nothing is cached before the first preview", model.cachedPreview(state, 20))

        val preview = model.progressionPreview(state, 20)
        assertSame("Reopening a sheet for that level needs no new evaluation", preview, model.cachedPreview(state, 20))
        assertSame(preview, model.progressionPreview(state, 20))
        assertNull("Another level is still to be computed", model.cachedPreview(state, 19))

        model.submitEdit(bonus("edited"), field = "edited")
        model.awaitSaved()
        assertNull("An edit changes the character, so the old preview no longer applies", model.cachedPreview(model.current!!, 20))
        assertNull(model.cachedPreview(state, 20))

        model.returnHomeAfterError()
        assertNull(model.cachedPreview(state, 20))
    }

    @Test fun levelDialogCanOpenOnAnyUpcomingLevelWithinTheSupportedRange() = runBlocking {
        val document = sample().copy(id = "level-dialog-target")
        store.save(document, SaveMode.CREATE)
        val model = session()
        model.load(document.id)
        val before = model.current!!.document.level

        model.beginLevelChange(before + 3)
        assertEquals(before + 3, model.levelTarget)
        model.beginLevelChange(BuilderSession.MAX_LEVEL + 5)
        assertEquals(BuilderSession.MAX_LEVEL, model.levelTarget)
        model.beginLevelChange(0)
        assertEquals(1, model.levelTarget)
        model.cancelLevelChange()
        assertEquals("The current level is unchanged until confirmed", before, model.current!!.document.level)

        model.beginLevelChange(before + 2)
        model.confirmLevelChange()
        assertTrue(model.errors.isEmpty())
        assertEquals(before + 2, model.current!!.document.level)
        assertEquals(before + 2, (store.load(document.id) as ContractResult.Available).value.level)
    }

    @Test fun aRejectedQueuedEditClearsItsPendingChoiceAndReportsTheRejection() = runBlocking {
        val model = quietSession()
        model.create()
        val slot = ChoiceSlotId("creation", "class", 0)
        val before = model.current!!.document
        model.submitEdit(BuilderEdit.Entry(1, slot, "missing-entry", "new-id"), "Missing")
        model.awaitSaved()
        assertNull(model.pendingSelection(slot))
        assertTrue(model.errors.isNotEmpty())
        assertEquals(before, model.current!!.document)
    }

    @Test fun exclusiveActionsWaitForSubmittedEditsToCommit() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        storage.blocking = true
        model.submitEdit(bonus("kept"))
        var seen: List<String>? = null
        val action = launch(Dispatchers.Default) { model.run { seen = current!!.document.manualAdjustments.map { it.id } } }
        storage.entered.await()
        delay(100)
        assertNull("The action has not started while the save is waiting", seen)
        storage.gate.complete(Unit)
        action.join()
        assertEquals(listOf("kept"), seen)
    }

    @Test fun aCancelledDirectEditStillFinishesItsWriteAndLeavesMemoryAndStorageAgreeing() = runBlocking {
        val storage = GatedStore()
        val model = quietSession(storage)
        model.create()
        storage.blocking = true
        val edit = launch(Dispatchers.Default) { model.edit(bonus("survives")) }
        storage.entered.await()
        edit.cancel()
        storage.gate.complete(Unit)
        edit.join()
        val id = model.current!!.document.id
        assertEquals(listOf("survives"), model.current!!.document.manualAdjustments.map { it.id })
        assertEquals(model.current!!.document, (store.load(id) as ContractResult.Available).value)
        storage.blocking = false
        model.edit(bonus("next"))
        assertTrue("The next save is not mistaken for a conflict", model.errors.isEmpty())
        assertEquals(listOf("survives", "next"), model.current!!.document.manualAdjustments.map { it.id })
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
        assertTrue("A bad file is not an operational error", model.errors.isEmpty())
        assertNotNull(model.importFailure)
        assertNull(model.preview)
        assertEquals(2, (store.list() as ContractResult.Available).value.size)
    }

    @Test fun unusableImportFileShowsAFailureNamingTheFileWithoutBlockingTheSession() = runBlocking {
        val model = session()
        model.run { inspect("buy milk\neggs", "primary:Download/shopping-list.txt") }
        val failure = model.importFailure!!
        assertEquals("shopping-list.txt", failure.fileName)
        assertTrue(failure.reason.contains("not a Modern 4e character"))
        assertTrue(model.errors.isEmpty())
        assertNull(model.errorTrace)
        assertNull(model.preview)
        assertTrue("The diagnostic text never reaches the player", !failure.reason.contains("Malformed"))

        model.dismissImportFailure()
        assertNull(model.importFailure)

        model.run { inspect("{\"formatVersion\":99}", "Mira.json") }
        assertTrue(model.importFailure!!.reason.contains("newer Builder"))
        var ran = false
        model.run { ran = true }
        assertTrue("The session keeps working while the failure shows", ran)

        model.run { inspect(ContractCodec.encode(sample()), "Fighter.json") }
        assertNull("A usable file clears the earlier failure", model.importFailure)
        assertNotNull(model.preview)
    }

    @Test fun storeFaultDuringImportStillBlocksTheSession() = runBlocking {
        val faulty = object : CharacterStore by store {
            override suspend fun list(): ContractResult<List<CharacterSummary>> =
                ContractResult.Unavailable(listOf(Diagnostic("store.list", DiagnosticKind.IO_FAILURE, "Disk unavailable")))
        }
        val model = session(faulty)
        model.run { inspect(ContractCodec.encode(sample()), "Fighter.json") }
        assertNull(model.importFailure)
        assertEquals("Disk unavailable", model.errors.single().message)
    }
    @Test fun personalDetailsCancelSaveAndReopenWithoutChangingBuild() = runBlocking {
        val model = session()
        model.create()
        val initial = model.current!!.document
        assertEquals("Medium", model.current!!.sizeDisplay())
        val derivedLanguages = model.current!!.languageDisplay()
        assertTrue(derivedLanguages.contains("Dwarven"))
        model.edit(BuilderEdit.Identity(initial.identity.copy(languages = "Legacy text", size = "Large")))
        model.beginEdit("Languages")
        assertNull(model.dialog)
        model.beginEdit("Size")
        assertNull(model.dialog)
        assertEquals("Medium", model.current!!.sizeDisplay())
        val details = mapOf("Gender" to "Woman", "Age" to "28", "Deity" to "Erathis",
            "Notes" to "  First line.\nSecond line.")
        for ((field, value) in details) {
            model.beginEdit(field)
            model.draft = "Discard this"
            model.cancelEdit()
            model.beginEdit(field)
            assertEquals("", model.draft)
            model.draft = "$value  \t\n"
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
        assertEquals("Legacy text", reopened.current!!.document.identity.languages)
        assertEquals(derivedLanguages, reopened.current!!.languageDisplay())
        assertEquals("Large", reopened.current!!.document.identity.size)
        assertEquals("Medium", reopened.current!!.sizeDisplay())
        reopened.beginEdit("Size")
        assertNull(reopened.dialog)
        reopened.beginEdit("Deity")
        reopened.draft = ""
        reopened.saveIdentityDraft()
        reopened.load(initial.id)
        assertEquals("", reopened.current!!.document.identity.deity)
        assertEquals("28", reopened.current!!.document.identity.age)
    }

    @Test fun detailsThatTheRulesNeverReadSaveWithoutRecalculatingAndBackgroundsStillDo() = runBlocking {
        val model = session()
        model.create()
        val first = model.current!!
        for ((field, value) in mapOf("Gender" to "Woman", "Age" to "28", "Deity" to "Erathis", "Name" to "Renamed")) {
            model.beginEdit(field)
            model.draft = value
            model.saveIdentityDraft()
        }
        val renamed = model.current!!
        assertEquals("Erathis", renamed.document.identity.deity)
        assertEquals("Renamed", renamed.document.identity.name)
        assertSame("Details the rules never read keep the calculated rules", first.rules, renamed.rules)
        assertEquals(first.rules.diagnostics, renamed.rules.diagnostics)
        assertNull(model.dialog)
        assertEquals("Renamed", model.characters.single().name)
        val stored = (store.load(first.document.id) as ContractResult.Available).value
        assertEquals(renamed.document.identity, stored.identity)

        val environment = ModernCreation.environments.keys.first { it != renamed.document.identity.environment }
        model.edit(BuilderEdit.Identity(renamed.document.identity.copy(environment = environment)))
        assertEquals(environment, model.current!!.document.identity.environment)
        assertNotSame("A background changes the rules inputs, so they are calculated again", renamed.rules, model.current!!.rules)
    }

    @Test fun skillsOverviewListsTheCatalogWithCommittedRanksAndTotals() = runBlocking {
        val model = session()
        model.create()
        val rules = model.current!!.rules
        val rows = rules.skillOverviewRows()
        assertEquals(Skill.catalog, rows.map { it.skill })
        assertTrue(rows.any { it.rank == SkillRank.TRAINED })
        assertTrue(rows.any { it.rank == SkillRank.UNTRAINED })
        assertEquals(rules.proficiencies.keys, rows.filter { it.rank == SkillRank.TRAINED }.map { it.skill }.toSet())
        assertEquals(Skill.catalog.map { rules.displayedSkill(it) }, rows.map { it.modifier })
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
        assertNotNull(model.importFailure)
        assertTrue(model.errors.isEmpty())
        model.run { error("Storage fault") }
        assertTrue(model.errors.isNotEmpty())
        model.returnHomeAfterError()
        assertNull(model.importFailure)
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
        val before = (original.rules.displayedSkill(Skill.ATHLETICS) as ContractResult.Available).value.total
        val item = original.document.equipment.first()
        model.edit(BuilderEdit.Equipment(item.copy(equipped = !item.equipped)))
        model.edit(BuilderEdit.Adjustment(ManualAdjustment("bonus", TypedModifier(
            ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.ATHLETICS), ModifierOperation.ADD, 2), "Training")))
        val reopened = session()
        reopened.load(original.document.id)
        assertEquals(!item.equipped, reopened.current!!.document.equipment.first { it.instanceId == item.instanceId }.equipped)
        val result = (reopened.current!!.rules.displayedSkill(Skill.ATHLETICS) as ContractResult.Available).value
        assertEquals(before + 2, result.total)
        assertTrue(result.contributors.any { it.label == "Manual Adjustment" })
        reopened.edit(BuilderEdit.RemoveAdjustment("bonus"))
        assertEquals(before, (reopened.current!!.rules.displayedSkill(Skill.ATHLETICS) as ContractResult.Available).value.total)
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

    /** Each draft resolves every candidate power; overlapping drafts exhausted the phone's heap (OutOfMemoryError). */
    @Test fun overlappingDraftsAreEvaluatedOneAtATime() = runBlocking {
        val inFlight = AtomicInteger()
        val peak = AtomicInteger()
        val real = AndroidContentSource(context.assets)
        val counting = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                peak.accumulateAndGet(inFlight.incrementAndGet(), ::maxOf)
                try {
                    Thread.sleep(20)
                    return real.loadChunk(packageId, chunkId)
                } finally {
                    inFlight.decrementAndGet()
                }
            }
        }
        val model = BuilderSession(store, counting) {
            (ContractCodec.decode(context.assets.open("samples/sample-modern-fighter.json")
                .bufferedReader(Charsets.UTF_8).use { it.readText() }) as ContractResult.Available).value
        }
        // Only drafts are measured here, so background warming stays off.
        model.listings.close()
        model.create()
        val slot = ChoiceSlotId("creation", "class", 0)
        val classId = model.progressionOptions(1, slot).first().entry.entry.id
        peak.set(0)
        val drafts = (1..6).map { index ->
            async(Dispatchers.Default) { model.previewProgression(BuilderEdit.Entry(1, slot, classId, "draft-$index", true)) }
        }.awaitAll()
        assertTrue(drafts.all { it != null })
        assertEquals(1, peak.get())
    }

    @Test fun classMenuListsEveryClassAndCancelCreatesNothing() = runBlocking {
        val model = session()
        model.beginCreate()
        val menu = model.classMenu!!
        assertTrue(model.errors.isEmpty())
        assertTrue(menu.size >= 19)
        assertTrue(menu.all { it.metadata.metadata.category == EntryCategory.CLASS })
        assertTrue(menu.any { it.metadata.metadata.id == "modern4e.class.wizard" })
        val titles = menu.map { it.metadata.metadata.title }
        assertEquals("Classes are listed alphabetically, like the prototype's class list", titles.sortedBy { it.lowercase() }, titles)
        assertEquals("The menu only opens; nothing is created yet", "home", model.page)
        model.cancelCreate()
        assertNull(model.classMenu)
        model.refresh()
        assertTrue(model.characters.isEmpty())
        assertNull(model.current)
    }

    @Test fun classMenuOpensWithTheSameCheckedDescriptionsAsProgression() = runBlocking {
        val model = session()
        assertNull(model.classMenu)
        model.beginCreate()
        val menu = model.classMenu!!
        assertTrue(menu.all { it.checked && !it.option?.entry?.entry?.presentation?.description.isNullOrBlank() })

        model.create("modern4e.class.wizard")
        var progression = emptyList<BuilderOptionRow>()
        model.progressionOptionRows(1, ChoiceSlotId("creation", "class", 0)) { progression = it }
        assertEquals(progression, menu)
    }

    @Test fun confirmingAClassCreatesAndPersistsACharacterAndOpensLevels() = runBlocking {
        val model = session()
        model.beginCreate()
        model.create("modern4e.class.wizard")
        assertTrue(model.errors.isEmpty())
        assertNull(model.classMenu)
        val document = model.current!!.document
        val chosen = document.levels.flatMap { it.entries }.single { it.slot == ChoiceSlotId("creation", "class", 0) }
        assertEquals("modern4e.class.wizard", chosen.selection.entryId)
        assertEquals("Wizard", chosen.selection.savedTitle)
        assertEquals("progression", model.page)
        assertEquals(listOf(document.id), model.characters.map { it.id })
        val reloaded = session().also { it.load(document.id) }
        assertEquals(document.levels, reloaded.current!!.document.levels)
        assertEquals(document.abilities, reloaded.current!!.document.abilities)
    }

    @Test fun newWizardShowsAllFourDefensesWhileCreationChoicesRemainOpen() = runBlocking {
        val model = session()
        model.create("modern4e.class.wizard")
        val rules = model.current!!.rules

        assertEquals("13", rules.defenseDisplay(Statistic.AC))
        assertEquals("12", rules.defenseDisplay(Statistic.FORTITUDE))
        assertEquals("16", rules.defenseDisplay(Statistic.REFLEX))
        assertEquals("14", rules.defenseDisplay(Statistic.WILL))
    }

    @Test fun everyClassStartsWithOnlyItsMainAbilityAtFour() = runBlocking {
        val model = session()
        model.beginCreate()
        for (entry in model.classMenu!!) {
            model.create(entry.metadata.metadata.id)
            assertTrue("${entry.metadata.metadata.id}: ${model.errors}", model.errors.isEmpty())
            val state = model.current!!
            val classes = state.rules.entries.filter { it.definition.entry.category == EntryCategory.CLASS }
            assertEquals(entry.metadata.metadata.id, classes.single().definition.entry.id)
            val allocation = state.document.abilities
            val mainAbilities = classes.single().definition.entry.mechanics.classProfile!!.mainAbilities
            assertEquals(mainAbilities, state.rules.choices.single { it.slot == allocation.source }.abilities)
            assertEquals(mainAbilities.first(), allocation.mainAbility)
            assertEquals(Ability.entries.associateWith { if (it == allocation.mainAbility) 4 else 0 }, allocation.points)
            assertEquals(5, Progression.remainingPoints(allocation))
            assertFalse(Progression.validAllocation(allocation))
        }
    }

    @Test fun choosingAClassMainAbilityPreservesAllocatedPointsAndSurvivesReload() = runBlocking {
        val model = session()
        model.create("modern4e.class.cleric")
        val document = model.current!!.document
        val offered = model.current!!.rules.choices.single { it.slot == document.abilities.source }.abilities
        assertEquals(listOf(Ability.STRENGTH, Ability.WISDOM), offered)

        val initial = document.abilities.copy(points = document.abilities.points + mapOf(
            Ability.WISDOM to 2, Ability.CONSTITUTION to 2, Ability.CHARISMA to 1,
        ))
        val changed = Progression.changeMainAbility(initial, Ability.WISDOM)
        assertEquals(4, changed.points[Ability.WISDOM])
        assertEquals(2, changed.points[Ability.STRENGTH])
        assertEquals(0, Progression.remainingPoints(changed))
        assertTrue(Progression.validAllocation(changed))
        assertEquals(initial, Progression.changeMainAbility(changed, Ability.STRENGTH))
        assertFalse(Progression.canAdjustAbility(changed, Ability.WISDOM, -1))

        model.edit(BuilderEdit.Allocation(changed))
        assertTrue(model.errors.isEmpty())
        val reloaded = session().also { it.load(document.id) }.current!!
        assertEquals(changed, reloaded.document.abilities)
        assertFalse(reloaded.rules.diagnostics.any { it.code in setOf("engine.mainAbility", "engine.abilityAllocation") })
    }

    @Test fun anUnknownClassIsReportedAndNothingIsCreated() = runBlocking {
        val model = session()
        model.create("modern4e.class.nonexistent")
        assertTrue(model.errors.isNotEmpty())
        assertNull(model.current)
        model.returnHomeAfterError()
        model.refresh()
        assertTrue(model.characters.isEmpty())
    }

    @Test fun bundledChunksAreDecodedOnceAndShared() = runBlocking {
        val source = AndroidContentSource(context.assets)
        val packageId = "modern4e.classes"
        val chunkId = (source.listPackages() as ContractResult.Available).value.single { it.id == packageId }.chunks.first()
        val first = (source.loadChunk(packageId, chunkId) as ContractResult.Available).value
        val second = (source.loadChunk(packageId, chunkId) as ContractResult.Available).value
        assertSame(first, second)
    }
}
