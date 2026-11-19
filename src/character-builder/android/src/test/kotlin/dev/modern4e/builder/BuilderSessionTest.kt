package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.defenseDisplay
import dev.modern4e.builder.ui.screens.languageDisplay
import dev.modern4e.builder.ui.screens.sizeDisplay
import dev.modern4e.builder.ui.screens.skillOverviewRows
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
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
        BuilderSession(storage, source, ::sample).also { it.warmupSettleMillis = 0 }
    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    @Test fun featRowsArriveBeforeChecksResumeAfterCancellationAndInvalidateAfterEdits() = runBlocking {
        var reads = 0
        val real = AndroidContentSource(context.assets)
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads++
                return real.loadChunk(packageId, chunkId)
            }
        }
        val model = session(source = source)
        model.create()
        model.awaitWarmup()
        // The picker's own batching is checked on a cold list, so hold background warming off from here on.
        model.warmupSettleMillis = 60_000
        model.touchRules()
        val slot = ChoiceSlotId("creation", "feat", 0)
        reads = 0
        var updates = 0
        try {
            model.progressionOptionRows(1, slot, FeatGroup.GENERAL) { rows ->
                updates++
                if (updates == 1) {
                    assertTrue(rows.isNotEmpty())
                    assertTrue(rows.all { !it.checked && it.option == null })
                    assertEquals(0, reads)
                } else {
                    assertEquals(minOf(BuilderSession.OPTION_BATCH_SIZE, rows.size), rows.count { it.checked })
                    throw kotlinx.coroutines.CancellationException("Dismiss picker after the first batch")
                }
            }
            fail("Picker cancellation should stop remaining batches")
        } catch (_: kotlinx.coroutines.CancellationException) {
            // Reopening continues the same immutable browsing snapshot.
        }
        var reopened: List<BuilderOptionRow>? = null
        model.progressionOptionRows(1, slot, FeatGroup.GENERAL) { rows ->
            if (reopened == null) {
                assertEquals(minOf(BuilderSession.OPTION_BATCH_SIZE, rows.size), rows.count { it.checked })
            }
            reopened = rows
        }
        assertTrue(reopened!!.all { it.checked })
        val completedReads = reads
        var cachedUpdates = 0
        model.progressionOptionRows(1, slot, FeatGroup.GENERAL) {
            cachedUpdates++
            assertTrue(it.all { row -> row.checked })
        }
        assertEquals(1, cachedUpdates)
        assertEquals(completedReads, reads)
        model.touchRules()
        try {
            model.progressionOptionRows(1, slot, FeatGroup.GENERAL) {
                assertTrue(it.none { row -> row.checked })
                throw kotlinx.coroutines.CancellationException("Only inspect refreshed metadata")
            }
        } catch (_: kotlinx.coroutines.CancellationException) { }
    }

    @Test fun classAndAncestryRowsAreNeverEligibilityCheckedAndAncestriesListTheirFeatures() = runBlocking {
        val model = session()
        model.create()
        model.warmupSettleMillis = 60_000
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
    }.also { it.warmupSettleMillis = 0 }

    /** Level 1 attack-power slots that still have no selection, in the order the Progression screen lists them. */
    private fun BuilderSession.emptyAttackSlots(): List<ChoiceSlotId> {
        val state = current!!
        val filled = state.document.levels.flatMap { it.entries }.map { it.slot }.toSet()
        return Progression.levelChoices(state, 1).filter { Progression.isAttackPowerChoice(state, it) && it.slot !in filled }.map { it.slot }
    }

    @Test fun powerPicksAndClassChangesWarmTheRemainingAttackPowerPools() = runBlocking {
        var reads = 0
        val real = AndroidContentSource(context.assets)
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads++
                return real.loadChunk(packageId, chunkId)
            }
        }
        val model = openPoolSession(source)
        model.create()
        model.awaitWarmup()
        val slots = model.emptyAttackSlots()
        assertEquals(5, slots.size)
        val opened = reads
        for (slot in slots) {
            assertTrue("Opening the character warms ${slot.choiceId}#${slot.ordinal}", model.firstRows(1, slot).let { it.isNotEmpty() && it.all { row -> row.checked } })
        }
        assertEquals("Pools warmed on open read no further content", opened, reads)

        val pickedSlot = slots.first()
        val siblingSlot = slots.first { it.choiceId == pickedSlot.choiceId && it != pickedSlot }
        val warmedRows = model.firstRows(1, pickedSlot)
        val pick = warmedRows.first { it.option?.eligibility == Eligibility.ELIGIBLE }.metadata.metadata.id
        val instance = model.progressionEntryInstance(1, pickedSlot)
        model.warmupSettleMillis = 60_000
        model.edit(BuilderEdit.Entry(1, pickedSlot, pick, instance, true))
        assertTrue(model.errors.isEmpty())
        assertEquals(instance, model.current!!.document.levels.flatMap { it.entries }.first { it.slot == pickedSlot }.instanceId)
        assertEquals("The same picker immediately reuses its checked rows", warmedRows, model.firstRows(1, pickedSlot))
        assertTrue("A sibling slot must recheck eligibility", model.firstRows(1, siblingSlot).none { it.checked })
        var siblingRows = emptyList<BuilderOptionRow>()
        model.progressionOptionRows(1, siblingSlot) { siblingRows = it }
        assertEquals(Eligibility.INELIGIBLE, siblingRows.first { it.metadata.metadata.id == pick }.option?.eligibility)

        model.warmupSettleMillis = 0
        val document = model.current!!.document
        model.edit(BuilderEdit.Identity(document.identity.copy(notes = "No rules inputs changed")))
        model.awaitWarmup()
        val remaining = model.emptyAttackSlots()
        assertEquals(slots - slots.first(), remaining)
        val afterPick = reads
        for (slot in remaining) {
            val rows = model.firstRows(1, slot)
            assertTrue(rows.isNotEmpty())
            assertTrue("Warmed pool ${slot.choiceId}#${slot.ordinal} opens checked", rows.all { it.checked })
        }
        assertEquals("Opening warmed pools reads no further content", afterPick, reads)

        // Leaving the class and returning to it is a class change, which warms the pools again.
        val classSlot = ChoiceSlotId("creation", "class", 0)
        model.edit(BuilderEdit.Entry(1, classSlot, "modern4e.class.wizard", "class-wizard", true))
        model.edit(BuilderEdit.Entry(1, classSlot, "modern4e.class.fighter", "class-fighter", true))
        assertTrue(model.errors.isEmpty())
        model.awaitWarmup()
        val afterClass = reads
        val reopened = model.emptyAttackSlots()
        assertTrue(reopened.isNotEmpty())
        for (slot in reopened) {
            assertTrue(model.firstRows(1, slot).let { it.isNotEmpty() && it.all { row -> row.checked } })
        }
        assertEquals(afterClass, reads)
    }

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

    @Test fun loadingACharacterWarmsEveryListItCanOpenAndMissingChoicesAreNotErrors() = runBlocking {
        val model = session()
        model.create()
        val id = model.current!!.document.id
        // A reloaded character starts cold and warms every list without any edit.
        val reopened = session()
        reopened.load(id)
        reopened.awaitWarmup()
        assertTrue(reopened.errors.isEmpty())
        reopened.assertEveryLevel1ListIsWarm("Reloaded character")

        // Without a class or ancestry the lists that need them still warm, and that is not an error.
        val bare = BuilderSession(store, AndroidContentSource(context.assets)) {
            sample().let { document -> document.copy(levels = document.levels.map { level ->
                level.copy(entries = level.entries.filterNot { it.slot.choiceId == "class" || it.slot.choiceId == "ancestry" })
            }) }
        }
        bare.warmupSettleMillis = 0
        bare.create()
        bare.awaitWarmup()
        assertTrue(bare.errors.isEmpty())
        assertTrue(bare.firstFeatRows(FeatGroup.CLASS).isEmpty())
        assertTrue(bare.firstFeatRows(FeatGroup.ANCESTRY).isEmpty())
        assertTrue(bare.firstFeatRows(FeatGroup.GENERAL).let { it.isNotEmpty() && it.all { row -> row.checked } })
        assertTrue(bare.firstRows(1, ChoiceSlotId("creation", "class", 0)).let { it.isNotEmpty() && it.all { row -> row.checked } })
    }

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

    @Test fun utilityPoolsTheScreenDoesNotOfferAreNotWarmedButEveryOtherEditStillWarms() = runBlocking {
        val model = openPoolSession()
        model.create()
        model.edit(BuilderEdit.Level(2))
        assertTrue(model.errors.isEmpty())
        val state = model.current!!
        val utility = state.rules.choices.first { it.slot.choiceId == "modern4e.choice.class-utility-2" }
        assertFalse(Progression.isAttackPowerChoice(state, utility))
        assertTrue("The screen lists no level 2 utility pool", Progression.levelChoices(state, 2).none { it.slot == utility.slot })
        val slot = model.emptyAttackSlots().first()
        model.edit(BuilderEdit.Identity(state.document.identity.copy(name = "Renamed")))
        model.awaitWarmup()
        assertTrue("A rename leaves the pools warm", model.firstRows(1, slot).all { it.checked })
        assertTrue(model.firstRows(2, utility.slot).none { it.checked })
        // The level 2 feat slot is warmed once the character reaches level 2.
        val level2 = model.firstRows(2, ChoiceSlotId("advancement.2", "feat", 0), FeatGroup.CLASS)
        assertTrue(level2.isNotEmpty() && level2.all { it.checked })
    }

    @Test fun everyEditWarmsEveryListAgainWithoutFurtherContentReads() = runBlocking {
        var reads = 0
        val real = AndroidContentSource(context.assets)
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads++
                return real.loadChunk(packageId, chunkId)
            }
        }
        val model = session(source = source)
        model.create()
        val edits = listOf(
            BuilderEdit.Entry(1, ChoiceSlotId("creation", "ancestry", 0), "modern4e.ancestry.human", "ancestry-human", true),
            BuilderEdit.Entry(1, ChoiceSlotId("creation", "class", 0), "modern4e.class.wizard", "class-wizard", true),
            BuilderEdit.Identity(model.current!!.document.identity.copy(name = "Renamed")),
        )
        for (edit in edits) {
            model.edit(edit)
            assertTrue(model.errors.isEmpty())
            model.awaitWarmup()
            val warmed = reads
            model.assertEveryLevel1ListIsWarm("After ${edit::class.simpleName}")
            assertEquals("Opening warmed lists reads no further content", warmed, reads)
        }
    }

    @Test fun classAndAncestryListsNeverRefreshWhileEveryOtherLevelOneListDoes() = runBlocking {
        val model = session()
        model.create()
        model.awaitWarmup()
        val roots = listOf("class", "ancestry").map { ChoiceSlotId("creation", it, 0) }
        model.warmupSettleMillis = 60_000
        model.touchRules()
        model.edit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "ancestry", 0), "modern4e.ancestry.human", "ancestry-human", true))
        assertTrue(model.errors.isEmpty())
        for (slot in roots) {
            assertTrue("${slot.choiceId} list survives every edit", model.firstRows(1, slot).let { it.isNotEmpty() && it.all { row -> row.checked } })
        }
        assertTrue("Other level 1 lists were rebuilt", model.firstFeatRows(FeatGroup.CLASS).none { it.checked })
    }

    @Test fun laterLevelEditsKeepEarlierLevelListsButEarlierEditsRefreshLaterOnes() = runBlocking {
        val model = openPoolSession()
        model.create()
        model.edit(BuilderEdit.Level(2))
        assertTrue(model.errors.isEmpty())
        model.awaitWarmup()
        val level2Feat = ChoiceSlotId("advancement.2", "feat", 0)
        val pool = model.emptyAttackSlots().first()
        assertTrue(model.firstRows(1, pool).all { it.checked })
        assertTrue(model.firstRows(2, level2Feat, FeatGroup.CLASS).let { it.isNotEmpty() && it.all { row -> row.checked } })

        // A level 2 pick keeps every level 1 list and the edited feat slot checked.
        model.warmupSettleMillis = 60_000
        val feat = model.firstRows(2, level2Feat, FeatGroup.GENERAL).first { it.option?.eligibility == Eligibility.ELIGIBLE }
        val instance = model.progressionEntryInstance(2, level2Feat)
        model.edit(BuilderEdit.Entry(2, level2Feat, feat.metadata.metadata.id, instance, true))
        assertTrue(model.errors.isEmpty())
        assertTrue("Level 1 pool stays checked", model.firstRows(1, pool).all { it.checked })
        assertTrue("Level 1 feat tab stays checked", model.firstFeatRows(FeatGroup.CLASS).all { it.checked })
        assertTrue("Other tabs in the same level 2 feat picker stay checked", model.firstRows(2, level2Feat, FeatGroup.CLASS).all { it.checked })

        // A level 1 decision refreshes the lists above it as well.
        model.touchRules()
        assertTrue(model.firstRows(1, pool).none { it.checked })
        assertTrue(model.firstRows(2, level2Feat, FeatGroup.CLASS).none { it.checked })
    }

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
        val model = session(source = source)
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
        assertTrue(model.warmTargets(model.current!!).none { it.slot == ancestry || it.slot == classSlot })
        val rows = model.firstRows(1, ancestry)
        assertTrue(rows.isNotEmpty() && rows.all { it.checked })
        assertTrue(rows.first { it.metadata.metadata.id == "modern4e.ancestry.deva" }.ancestryGrants.isNotEmpty())
        model.awaitWarmup()

        val differentPackages = model.current!!.document.copy(
            id = "without-ancestry-package",
            packages = model.current!!.document.packages.filterNot { it.packageId == "modern4e.ancestries" },
        )
        store.save(differentPackages, SaveMode.CREATE)
        model.load(differentPackages.id)
        assertEquals(differentPackages.id, model.current!!.document.id)
        assertTrue("The default catalog cannot supply ancestries for this character", model.firstRows(1, ancestry).isEmpty())
        model.awaitWarmup()
    }

    @Test fun warmupPrioritizesClassFeaturesThenPowersThenFeatTabsThenOtherPickers() = runBlocking {
        val model = session()
        model.preloadHomePickers()
        model.create()
        val state = model.current!!
        val targets = model.warmTargets(state)
        val features = targets.takeWhile { it.slot.choiceId.startsWith("modern4e.choice.fighter-") }
        assertTrue(features.any { it.slot.choiceId == "modern4e.choice.fighter-reactivity" })
        val powers = targets.drop(features.size).takeWhile { it.slot.choiceId.startsWith("modern4e.choice.class-attack-") }
        assertEquals(5, powers.size)
        val remainder = targets.drop(features.size + powers.size)
        assertEquals(listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL), remainder.take(3).map { it.group })
        assertEquals(ChoiceSlotId("creation", "theme", 0), remainder.last().slot)
        model.awaitWarmup()
    }

    @Test fun changingAncestryWarmsItsNewPowerChoiceFirst() = runBlocking {
        val model = session()
        model.create()
        model.awaitWarmup()
        val ancestry = ChoiceSlotId("creation", "ancestry", 0)
        val original = model.current!!.document.levels.flatMap { it.entries }.single { it.slot == ancestry }
        model.edit(BuilderEdit.Entry(1, ancestry, "modern4e.ancestry.dragonborn", original.instanceId, true))
        assertTrue(model.errors.isEmpty())

        val state = model.current!!
        val choice = Progression.ancestryPowerChoices(state, model.powerEntryIds()).single()
        val targets = model.warmTargets(state)
        assertEquals(choice.slot, targets.first().slot)
        assertEquals(1, targets.count { it.slot == choice.slot })
        assertTrue(targets.drop(1).first().slot.choiceId.startsWith("modern4e.choice.fighter-"))

        model.awaitWarmup()
        val rows = model.firstRows(1, choice.slot)
        assertEquals(setOf("modern4e.power.dragon-breath", "modern4e.power.dragonfear"), rows.map { it.metadata.metadata.id }.toSet())
        assertTrue(rows.all { it.checked })
    }

    @Test fun onlyListsTheCharacterCanEditAreWarmed() = runBlocking {
        val model = session()
        model.create()
        model.awaitWarmup()
        // Instance IDs stay stable across a class swap, so compare the choices themselves.
        fun BuilderSession.owners() = warmTargets(current!!).filter { it.slot.sourceInstanceId != "creation" }.map { it.slot.choiceId }
        val fighter = model.owners()
        assertTrue(fighter.isNotEmpty())
        assertTrue("A Fighter never warms Avenger choices: $fighter", fighter.none { it.contains("avenger", ignoreCase = true) })
        val state = model.current!!
        val active = state.rules.entries.map { it.instanceId }.toSet()
        assertTrue("Every warmed pool belongs to an active source", warmTargetsOwnedBy(model, active))

        model.edit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "class", 0), "modern4e.class.avenger", "class-avenger", true))
        assertTrue(model.errors.isEmpty())
        val avenger = model.owners()
        assertTrue("An Avenger warms its own choices: $avenger", avenger.any { it.contains("avenger", ignoreCase = true) })
        assertTrue("...and none of the Fighter's: $avenger", avenger.none { it.contains("fighter", ignoreCase = true) })
        assertTrue("Fighter pools no longer apply once the class changes", avenger.none { it == "modern4e.choice.fighter-reactivity" })
    }

    private fun warmTargetsOwnedBy(model: BuilderSession, active: Set<String>) = model.warmTargets(model.current!!)
        .filter { it.slot.sourceInstanceId != "creation" && it.slot.sourceInstanceId != "advancement.2" }
        .all { it.slot.sourceInstanceId in active }

    @Test fun editsSettleBeforeWarmingStartsAndASupersededEditNeverWarms() = runBlocking {
        val model = session()
        model.create()
        model.awaitWarmup()
        model.warmupSettleMillis = 60_000
        model.touchRules()
        assertTrue("Nothing starts until edits stop arriving", model.firstFeatRows(FeatGroup.CLASS).none { it.checked })
        // The next edit replaces the pending warm-up instead of waiting out its delay.
        model.warmupSettleMillis = 0
        model.touchRules()
        model.awaitWarmup()
        assertTrue(model.errors.isEmpty())
        model.assertEveryLevel1ListIsWarm("Final document")
    }

    @Test fun warmupReadFailuresStayQuietAndThePickerRecovers() = runBlocking {
        val real = AndroidContentSource(context.assets)
        var failReads = false
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> =
                if (failReads) ContractResult.Unavailable(listOf(Diagnostic("test.read", DiagnosticKind.IO_FAILURE, "Cannot load content")))
                else real.loadChunk(packageId, chunkId)
        }
        var armed = false
        val storage = object : CharacterStore by store {
            override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?) =
                store.save(document, mode, expected).also { failReads = armed }
        }
        val model = session(storage, source)
        model.create()
        armed = true
        // Reads fail only once the edit is stored, so the background warm-up is what meets the failure.
        model.edit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "ancestry", 0), "modern4e.ancestry.human", "ancestry-human", true))
        model.awaitWarmup()
        assertTrue("A background failure never opens the blocking error flow", model.errors.isEmpty())
        failReads = false
        var last: List<BuilderOptionRow> = emptyList()
        model.progressionOptionRows(1, ChoiceSlotId("creation", "feat", 0), FeatGroup.ANCESTRY) { last = it }
        assertTrue(model.errors.isEmpty())
        assertTrue(last.isNotEmpty() && last.all { it.checked })
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
        // A warmed list would never read content again, so keep background warming out of this failure scenario.
        model.awaitWarmup()
        model.warmupSettleMillis = 60_000
        var updates = 0
        val slot = ChoiceSlotId("creation", "feat", 0)
        model.progressionOptionRows(1, slot, FeatGroup.GENERAL) {
            updates++
            model.touchRules()
        }
        assertEquals(1, updates)
        failReads = true
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
        assertEquals(before.levels.filter { it.level == 1 }, reopened.current!!.document.levels)
        val history = (store.listRecovery(document.id) as ContractResult.Available).value
        val previousHighLevel = history.single { it.character.level == BuilderSession.MAX_LEVEL }
        assertEquals(beforeLowering, (store.loadRecovery(previousHighLevel.recoveryId) as ContractResult.Available).value)
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
        val model = session(storage, source)
        model.create()
        // The commit path itself must not read content; background warming would, so keep it out of this window.
        model.awaitWarmup()
        model.warmupSettleMillis = 60_000
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
        assertEquals("Medium", model.current!!.sizeDisplay())
        val derivedLanguages = model.current!!.languageDisplay()
        assertTrue(derivedLanguages.contains("Dwarven"))
        model.edit(BuilderEdit.Identity(initial.identity.copy(languages = "Legacy text")))
        model.beginEdit("Languages")
        assertNull(model.dialog)
        val details = mapOf("Gender" to "Woman", "Age" to "28", "Deity" to "Erathis",
            "Size" to "Large", "Notes" to "  First line.\nSecond line.")
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
        assertEquals("Large", reopened.current!!.sizeDisplay())
        reopened.beginEdit("Deity")
        reopened.draft = ""
        reopened.saveIdentityDraft()
        reopened.load(initial.id)
        assertEquals("", reopened.current!!.document.identity.deity)
        assertEquals("28", reopened.current!!.document.identity.age)
    }

    @Test fun skillsOverviewListsTrainedAndUntrainedSkillsWithCommittedTotals() = runBlocking {
        val model = session()
        model.create()
        val rules = model.current!!.rules
        val rows = rules.skillOverviewRows()
        assertEquals(Skill.entries.toList(), rows.map { it.skill })
        assertTrue(rows.any { it.proficient })
        assertTrue(rows.any { !it.proficient })
        assertEquals(rules.proficiencies.keys, rows.filter { it.proficient }.map { it.skill }.toSet())
        assertEquals(Skill.entries.map { rules.displayedSkill(it) }, rows.map { it.modifier })
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
        model.create()
        model.awaitWarmup()
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

        assertEquals("14", rules.defenseDisplay(Statistic.AC))
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
