package dev.modern4e.builder

import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * The option listing cache on its own: picker batching, warm-up order and coverage, settling, yielding to pickers and
 * pending edits, retention across edits, the bounded working set and quiet read failures, driven by a manual clock and
 * committed states, without a session or storage. A settle delay the clock is never advanced past holds warming off.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OptionListingCacheTest {
    private val context get() = RuntimeEnvironment.getApplication()

    private fun sample(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value

    /** The sample fighter with its attack powers unpicked, so every pool starts open and cold. */
    private fun openPools(): CharacterDocument = sample().let { document -> document.copy(levels = document.levels.map { level ->
        level.copy(entries = level.entries.filterNot { it.slot.choiceId.startsWith("modern4e.choice.class-attack") })
    }) }

    /** The bundled content, counting every chunk read into [reads]. */
    private fun countingSource(reads: AtomicInteger): ContentSource {
        val real = AndroidContentSource(context.assets)
        return object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                reads.incrementAndGet()
                return real.loadChunk(packageId, chunkId)
            }
        }
    }

    /** Every cache a test opened; closed afterwards so no warm-up outlives its test. */
    private val caches = mutableListOf<OptionListingCache>()

    @After fun closeCaches() {
        caches.forEach { it.close() }
    }

    /** A clock the test advances by hand, so a settle delay ends exactly when the test says. */
    private class ManualClock : WarmupClock {
        private val now = MutableStateFlow(0L)

        override fun now(): Long = now.value

        override suspend fun sleepUntil(deadline: Long) {
            now.first { it >= deadline }
        }

        fun advance(millis: Long) = now.update { it + millis }
    }

    private class Fixture(val cache: OptionListingCache, val operations: BuilderOperations, val catalog: ContentCatalog,
        var state: BuilderState, val pendingEdits: MutableStateFlow<Int>, val clock: ManualClock) {
        private var touches = 0

        /** Apply an edit as the session would and hand the committed state to the cache. */
        suspend fun commit(edit: BuilderEdit) {
            val result = operations.apply(state.document, edit)
            assertTrue(result.diagnostics.toString(), result.applied)
            state = result.state
            cache.committed(state, catalog, operations)
        }

        /** A rules change that touches every listing's inputs without changing what any slot offers. */
        suspend fun touchRules() = commit(BuilderEdit.Adjustment(ManualAdjustment("touch-${touches++}",
            TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.ATHLETICS), ModifierOperation.ADD, 1), "Touch")))

        /** The rows a picker publishes first; later batches are cancelled before they run. */
        suspend fun firstRows(level: Int, slot: ChoiceSlotId, group: FeatGroup? = null): List<BuilderOptionRow> {
            var first = emptyList<BuilderOptionRow>()
            try {
                cache.browse(level, slot, group) {
                    first = it
                    throw CancellationException("Only inspect the opening rows")
                }
            } catch (_: CancellationException) { }
            return first
        }

        /** Every level 1 list the Levels screen can open as a catalog picker, plus the three root pickers and the feat slot. */
        fun level1Pickers(): List<Triple<Int, ChoiceSlotId, FeatGroup?>> {
            val choices = Progression.levelChoices(state, 1).filter { it.abilities.isEmpty() && it.entries.isNotEmpty() }
                .map { Triple(1, it.slot, null as FeatGroup?) }
            val roots = listOf("class", "ancestry", "theme").map { Triple(1, ChoiceSlotId("creation", it, 0), null as FeatGroup?) }
            val feats = FeatGroup.entries.map { Triple(1, ChoiceSlotId("creation", "feat", 0), it as FeatGroup?) }
            return choices + roots + feats
        }

        /** Every list the level 1 Levels screen can open is already checked. */
        suspend fun assertEveryLevel1ListIsWarm(message: String) {
            for ((level, slot, group) in level1Pickers()) {
                val rows = firstRows(level, slot, group)
                assertTrue("$message: ${slot.choiceId}#${slot.ordinal} $group opens checked", rows.isNotEmpty() && rows.all { it.checked })
            }
        }

        /** Level 1 attack-power slots that still have no selection, in the order the Levels screen lists them. */
        fun emptyAttackSlots(): List<ChoiceSlotId> {
            val filled = state.document.levels.flatMap { it.entries }.map { it.slot }.toSet()
            return Progression.levelChoices(state, 1).filter { Progression.isAttackPowerChoice(state, it) && it.slot !in filled }.map { it.slot }
        }

        /** Indexed power IDs, as the session classifies ancestry power choices. */
        fun powerEntryIds(): Set<String> = catalog.search(category = EntryCategory.POWER).mapTo(mutableSetOf()) { it.metadata.id }
    }

    /**
     * A cache opened on [document], warming it at once as opening a character does.
     *
     * @param homeRoots whether Home prepared the Class and Ancestry rows, so the cache neither lists nor warms them.
     */
    private suspend fun fixture(document: CharacterDocument = sample(),
        source: ContentSource = AndroidContentSource(context.assets), homeRoots: Boolean = false): Fixture {
        val catalog = (ContentCatalog.open(source, "modern4e.classes", document.packages) as ContractResult.Available).value
        val operations = BuilderOperations(catalog)
        val pendingEdits = MutableStateFlow(0)
        val clock = ManualClock()
        val preloaded: (CharacterDocument, Int, ChoiceSlotId) -> List<BuilderOptionRow>? = { _, level, slot ->
            if (homeRoots && ListingRetention.isRootList(level, slot)) emptyList() else null
        }
        val cache = OptionListingCache(preloaded, pendingEdits, clock = clock).also { caches += it }
        val state = operations.evaluate(document)
        cache.reset(OptionListingCache.Snapshot(state, catalog, operations))
        return Fixture(cache, operations, catalog, state, pendingEdits, clock)
    }

    @Test fun editsSettleBeforeWarmingStartsAndASupersededEditNeverWarms() = runBlocking {
        val world = fixture()
        world.cache.awaitWarmup()
        world.cache.settleMillis = 300
        val before = world.cache.warmBatchCount

        world.touchRules()
        world.clock.advance(299)
        delay(100)
        assertEquals("Nothing starts until edits stop arriving", before, world.cache.warmBatchCount)
        val featSlot = ChoiceSlotId("creation", "feat", 0)
        assertTrue(world.firstRows(1, featSlot, FeatGroup.CLASS).none { it.checked })

        // The next edit replaces the pending warm-up instead of letting it run out its delay.
        world.touchRules()
        world.clock.advance(299)
        delay(100)
        assertEquals("The superseded warm-up never starts", before, world.cache.warmBatchCount)
        world.clock.advance(1)
        world.cache.awaitWarmup()
        assertTrue(world.cache.warmBatchCount > before)
        world.assertEveryLevel1ListIsWarm("Final document")
    }

    @Test fun anOpenPickerPausesBackgroundWarmingUntilItIsDone() = runBlocking {
        val world = fixture()
        world.cache.awaitWarmup()
        world.cache.settleMillis = 0
        // A rules change leaves every list with eligibility to recheck, and warming starts at once.
        world.touchRules()
        var duringPicker = -1
        try {
            world.cache.browse(1, ChoiceSlotId("creation", "feat", 0), FeatGroup.GENERAL) {
                val before = world.cache.warmBatchCount
                // The picker holds no lock here, so any batch in this window can only be background warming.
                delay(400)
                duringPicker = world.cache.warmBatchCount - before
                throw CancellationException("Only hold the picker open")
            }
        } catch (_: CancellationException) { }
        assertEquals("Background warming waits while a picker is open", 0, duringPicker)
        val afterPicker = world.cache.warmBatchCount
        world.cache.awaitWarmup()
        assertTrue("Warming resumes once the picker is closed", world.cache.warmBatchCount > afterPicker)
        world.assertEveryLevel1ListIsWarm("After the picker closed")
    }

    @Test fun aPendingEditPausesBackgroundWarmingUntilItCommits() = runBlocking {
        val world = fixture()
        world.cache.awaitWarmup()
        world.cache.settleMillis = 0
        world.pendingEdits.value = 1
        world.touchRules()
        val before = world.cache.warmBatchCount
        delay(400)
        assertEquals("Background warming waits for a pending edit", before, world.cache.warmBatchCount)
        world.pendingEdits.value = 0
        world.cache.awaitWarmup()
        assertTrue(world.cache.warmBatchCount > before)
        world.assertEveryLevel1ListIsWarm("After the edit committed")
    }

    @Test fun warmingTheWorkingSetStaysBoundedAndNeverLeavesAnUnmadeChoiceCold() = runBlocking {
        val opened = fixture()
        val level19 = opened.operations.apply(sample(), BuilderEdit.Level(19)).also { assertTrue(it.applied) }.state.document
        val world = fixture(level19)
        world.cache.awaitWarmup()
        assertTrue("${world.cache.retainedCount()} listings", world.cache.retainedCount() <= OptionListingCache.OPTION_LISTING_LIMIT)
        val unmade = world.cache.warmTargets(world.state).takeWhile { !it.idle }
        assertTrue(unmade.isNotEmpty())
        for (target in unmade) {
            val rows = world.firstRows(target.level, target.slot, target.group)
            assertTrue("${target.slot.sourceInstanceId} ${target.slot.choiceId} ${target.group} opens checked",
                rows.isEmpty() || rows.all { it.checked })
        }
    }

    @Test fun levelNineteenWarmupDecodesEachChunkAFewTimesNotOncePerFeatSlot() = runBlocking {
        val real = AndroidContentSource(context.assets)
        val loads = ConcurrentHashMap<Pair<String, String>, AtomicInteger>()
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                loads.getOrPut(packageId to chunkId) { AtomicInteger() }.incrementAndGet()
                return real.loadChunk(packageId, chunkId)
            }
        }
        val world = fixture(source = source)
        world.cache.awaitWarmup()
        world.cache.settleMillis = 0
        loads.clear()
        world.commit(BuilderEdit.Level(19))
        world.cache.awaitWarmup()
        val featSlots = (1..19).count { Progression.level(it).feat }
        assertTrue(featSlots > 10)
        val worst = loads.entries.maxByOrNull { it.value.get() }!!
        assertTrue("Chunks are decoded once per session, not once per slot: ${worst.key} x${worst.value.get()}", worst.value.get() <= 4)
    }

    @Test fun warmupReadFailuresStayQuietAndThePickerRecovers() = runBlocking {
        val real = AndroidContentSource(context.assets)
        var failReads = false
        val source = object : ContentSource by real {
            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> =
                if (failReads) ContractResult.Unavailable(listOf(Diagnostic("test.read", DiagnosticKind.IO_FAILURE, "Cannot load content")))
                else real.loadChunk(packageId, chunkId)
        }
        val world = fixture(source = source)
        world.cache.awaitWarmup()
        world.cache.settleMillis = 0
        val edited = world.operations.apply(world.state.document, BuilderEdit.Entry(1, ChoiceSlotId("creation", "ancestry", 0),
            "modern4e.ancestry.human", "ancestry-human", true))
        assertTrue(edited.applied)
        world.state = edited.state
        // Reads fail only once the edit is computed, so the background warm-up is what meets the failure.
        failReads = true
        world.cache.committed(world.state, world.catalog, world.operations)
        world.cache.awaitWarmup()
        failReads = false
        var last: List<BuilderOptionRow> = emptyList()
        val failures = world.cache.browse(1, ChoiceSlotId("creation", "feat", 0), FeatGroup.ANCESTRY) { last = it }
        assertTrue(failures.toString(), failures.isEmpty())
        assertTrue(last.isNotEmpty() && last.all { it.checked })
    }

    @Test fun featRowsArriveBeforeChecksResumeAfterCancellationAndInvalidateAfterEdits() = runBlocking {
        val reads = AtomicInteger()
        val world = fixture(source = countingSource(reads))
        world.cache.awaitWarmup()
        // The picker's own batching is checked on a cold list; the clock never reaches the settle deadline, so nothing warms it.
        world.touchRules()
        val slot = ChoiceSlotId("creation", "feat", 0)
        reads.set(0)
        var updates = 0
        try {
            world.cache.browse(1, slot, FeatGroup.GENERAL) { rows ->
                updates++
                if (updates == 1) {
                    assertTrue(rows.isNotEmpty())
                    assertTrue(rows.all { !it.checked && it.option != null })
                    assertEquals(0, reads.get())
                } else {
                    assertEquals(minOf(OptionListingCache.OPTION_BATCH_SIZE, rows.size), rows.count { it.checked })
                    throw CancellationException("Dismiss picker after the first batch")
                }
            }
            fail("Picker cancellation should stop remaining batches")
        } catch (_: CancellationException) {
            // Reopening continues the same immutable browsing snapshot.
        }
        var reopened: List<BuilderOptionRow>? = null
        world.cache.browse(1, slot, FeatGroup.GENERAL) { rows ->
            if (reopened == null) {
                assertEquals(minOf(OptionListingCache.OPTION_BATCH_SIZE, rows.size), rows.count { it.checked })
            }
            reopened = rows
        }
        assertTrue(reopened!!.all { it.checked })
        val completedReads = reads.get()
        var cachedUpdates = 0
        world.cache.browse(1, slot, FeatGroup.GENERAL) {
            cachedUpdates++
            assertTrue(it.all { row -> row.checked })
        }
        assertEquals(1, cachedUpdates)
        assertEquals(completedReads, reads.get())
        world.touchRules()
        assertTrue("An edit refreshes the list", world.firstRows(1, slot, FeatGroup.GENERAL).none { it.checked })
    }

    @Test fun everyEditWarmsEveryListAgainWithoutFurtherContentReads() = runBlocking {
        val reads = AtomicInteger()
        val world = fixture(source = countingSource(reads))
        world.cache.settleMillis = 0
        val edits = listOf(
            BuilderEdit.Entry(1, ChoiceSlotId("creation", "ancestry", 0), "modern4e.ancestry.human", "ancestry-human", true),
            BuilderEdit.Entry(1, ChoiceSlotId("creation", "class", 0), "modern4e.class.wizard", "class-wizard", true),
            BuilderEdit.Identity(world.state.document.identity.copy(name = "Renamed")),
        )
        for (edit in edits) {
            world.commit(edit)
            world.cache.awaitWarmup()
            val warmed = reads.get()
            world.assertEveryLevel1ListIsWarm("After ${edit::class.simpleName}")
            assertEquals("Opening warmed lists reads no further content", warmed, reads.get())
        }
    }

    @Test fun aCharacterWithoutClassOrAncestryStillWarmsAndMissingChoicesAreNotFailures() = runBlocking {
        val bare = sample().let { document -> document.copy(levels = document.levels.map { level ->
            level.copy(entries = level.entries.filterNot { it.slot.choiceId == "class" || it.slot.choiceId == "ancestry" })
        }) }
        val world = fixture(bare)
        world.cache.awaitWarmup()
        val featSlot = ChoiceSlotId("creation", "feat", 0)
        for (group in FeatGroup.entries) {
            assertTrue("$group reports no failure", world.cache.browse(1, featSlot, group) { }.isEmpty())
        }
        assertTrue(world.firstRows(1, featSlot, FeatGroup.CLASS).isEmpty())
        assertTrue(world.firstRows(1, featSlot, FeatGroup.ANCESTRY).isEmpty())
        assertTrue(world.firstRows(1, featSlot, FeatGroup.GENERAL).let { it.isNotEmpty() && it.all { row -> row.checked } })
        assertTrue(world.firstRows(1, ChoiceSlotId("creation", "class", 0)).let { it.isNotEmpty() && it.all { row -> row.checked } })
    }

    @Test fun powerPicksAndClassChangesWarmTheRemainingAttackPowerPools() = runBlocking {
        val reads = AtomicInteger()
        val world = fixture(openPools(), countingSource(reads))
        world.cache.settleMillis = 0
        world.cache.awaitWarmup()
        val slots = world.emptyAttackSlots()
        assertEquals(5, slots.size)
        val opened = reads.get()
        for (slot in slots) {
            assertTrue("Opening the character warms ${slot.choiceId}#${slot.ordinal}", world.firstRows(1, slot).let { it.isNotEmpty() && it.all { row -> row.checked } })
        }
        assertEquals("Pools warmed on open read no further content", opened, reads.get())

        val pickedSlot = slots.first()
        val siblingSlot = slots.first { it.choiceId == pickedSlot.choiceId && it != pickedSlot }
        val warmedRows = world.firstRows(1, pickedSlot)
        val pick = warmedRows.first { it.option?.eligibility == Eligibility.ELIGIBLE }.metadata.metadata.id
        val instance = world.cache.instanceFor(1, pickedSlot)
        world.cache.settleMillis = 60_000
        world.commit(BuilderEdit.Entry(1, pickedSlot, pick, instance, true))
        assertEquals(instance, world.state.document.levels.flatMap { it.entries }.first { it.slot == pickedSlot }.instanceId)
        assertEquals("The same picker immediately reuses its checked rows", warmedRows, world.firstRows(1, pickedSlot))
        assertTrue("A sibling slot must recheck eligibility", world.firstRows(1, siblingSlot).none { it.checked })
        var siblingRows = emptyList<BuilderOptionRow>()
        world.cache.browse(1, siblingSlot, null) { siblingRows = it }
        assertEquals(Eligibility.INELIGIBLE, siblingRows.first { it.metadata.metadata.id == pick }.option?.eligibility)

        world.cache.settleMillis = 0
        world.commit(BuilderEdit.Identity(world.state.document.identity.copy(notes = "No rules inputs changed")))
        world.cache.awaitWarmup()
        val remaining = world.emptyAttackSlots()
        assertEquals(slots - slots.first(), remaining)
        val afterPick = reads.get()
        for (slot in remaining) {
            val rows = world.firstRows(1, slot)
            assertTrue(rows.isNotEmpty())
            assertTrue("Warmed pool ${slot.choiceId}#${slot.ordinal} opens checked", rows.all { it.checked })
        }
        assertEquals("Opening warmed pools reads no further content", afterPick, reads.get())

        // Leaving the class and returning to it is a class change, which warms the pools again.
        val classSlot = ChoiceSlotId("creation", "class", 0)
        world.commit(BuilderEdit.Entry(1, classSlot, "modern4e.class.wizard", "class-wizard", true))
        world.commit(BuilderEdit.Entry(1, classSlot, "modern4e.class.fighter", "class-fighter", true))
        world.cache.awaitWarmup()
        val afterClass = reads.get()
        val reopened = world.emptyAttackSlots()
        assertTrue(reopened.isNotEmpty())
        for (slot in reopened) {
            assertTrue(world.firstRows(1, slot).let { it.isNotEmpty() && it.all { row -> row.checked } })
        }
        assertEquals(afterClass, reads.get())
    }

    @Test fun reachedUtilityPoolsAreDisplayedAndWarmedAlongsideAttackPowersAndFeats() = runBlocking {
        val world = fixture(openPools())
        world.cache.settleMillis = 0
        world.commit(BuilderEdit.Level(2))
        val state = world.state
        val utility = state.rules.choices.first { it.slot.choiceId == "modern4e.choice.class-utility-2" }
        assertFalse(Progression.isAttackPowerChoice(state, utility))
        assertTrue("The screen lists its authored level 2 utility pool", Progression.levelChoices(state, 2).any { it.slot == utility.slot })
        val slot = world.emptyAttackSlots().first()
        world.commit(BuilderEdit.Identity(state.document.identity.copy(name = "Renamed")))
        world.cache.awaitWarmup()
        assertTrue("A rename leaves the pools warm", world.firstRows(1, slot).all { it.checked })
        assertTrue(world.firstRows(2, utility.slot).let { it.isNotEmpty() && it.all { row -> row.checked } })
        // The level 2 feat slot is warmed once the character reaches level 2.
        val level2 = world.firstRows(2, ChoiceSlotId("advancement.2", "feat", 0), FeatGroup.CLASS)
        assertTrue(level2.isNotEmpty() && level2.all { it.checked })
    }

    @Test fun classAndAncestryListsNeverRefreshWhileEveryOtherLevelOneListDoes() = runBlocking {
        val world = fixture()
        world.cache.awaitWarmup()
        val roots = listOf("class", "ancestry").map { ChoiceSlotId("creation", it, 0) }
        // The clock never reaches the settle deadline, so neither edit warms anything again.
        world.touchRules()
        world.commit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "ancestry", 0), "modern4e.ancestry.human", "ancestry-human", true))
        for (slot in roots) {
            assertTrue("${slot.choiceId} list survives every edit", world.firstRows(1, slot).let { it.isNotEmpty() && it.all { row -> row.checked } })
        }
        assertTrue("Other level 1 lists were rebuilt", world.firstRows(1, ChoiceSlotId("creation", "feat", 0), FeatGroup.CLASS).none { it.checked })
    }

    @Test fun laterLevelEditsKeepEarlierLevelListsButEarlierEditsRefreshLaterOnes() = runBlocking {
        val world = fixture(openPools())
        world.cache.settleMillis = 0
        world.commit(BuilderEdit.Level(2))
        world.cache.awaitWarmup()
        val level2Feat = ChoiceSlotId("advancement.2", "feat", 0)
        val pool = world.emptyAttackSlots().first()
        assertTrue(world.firstRows(1, pool).all { it.checked })
        assertTrue(world.firstRows(2, level2Feat, FeatGroup.CLASS).let { it.isNotEmpty() && it.all { row -> row.checked } })

        // A level 2 pick keeps every level 1 list and the edited feat slot checked.
        world.cache.settleMillis = 60_000
        val feat = world.firstRows(2, level2Feat, FeatGroup.GENERAL).first { it.option?.eligibility == Eligibility.ELIGIBLE }
        val instance = world.cache.instanceFor(2, level2Feat)
        world.commit(BuilderEdit.Entry(2, level2Feat, feat.metadata.metadata.id, instance, true))
        assertTrue("Level 1 pool stays checked", world.firstRows(1, pool).all { it.checked })
        assertTrue("Level 1 feat tab stays checked", world.firstRows(1, ChoiceSlotId("creation", "feat", 0), FeatGroup.CLASS).all { it.checked })
        assertTrue("Other tabs in the same level 2 feat picker stay checked", world.firstRows(2, level2Feat, FeatGroup.CLASS).all { it.checked })

        // A level 1 decision refreshes the lists above it as well.
        world.touchRules()
        assertTrue(world.firstRows(1, pool).none { it.checked })
        assertTrue(world.firstRows(2, level2Feat, FeatGroup.CLASS).none { it.checked })
    }

    @Test fun warmupQueuesUnmadeChoicesByLevelThenOpenedPickersThenIdleMadeChoices() = runBlocking {
        val world = fixture(openPools(), homeRoots = true)
        world.commit(BuilderEdit.Level(4))
        val state = world.state
        val filled = state.document.levels.flatMap { it.entries }.map { it.slot }.toSet()
        val targets = world.cache.warmTargets(state)

        // Everything still unmade comes first, nearest level first: the five open attack pools, then the level 2 and 4 feats.
        val unmade = targets.takeWhile { !it.idle }
        assertTrue(unmade.none { it.slot in filled })
        assertEquals(unmade.map { it.level }, unmade.map { it.level }.sorted())
        assertEquals(5, unmade.count { it.level == 1 && it.slot.choiceId.startsWith("modern4e.choice.class-attack-") })
        for (level in listOf(2, 4)) {
            assertEquals(listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL),
                unmade.filter { it.slot == ChoiceSlotId("advancement.$level", "feat", 0) }.map { it.group })
        }
        assertTrue("A level 1 pool precedes a level 2 feat", unmade.indexOfFirst { it.level == 1 } < unmade.indexOfFirst { it.level == 2 })

        // The rest are choices already made, which only run when idle; their feat tabs are the very last targets.
        val idle = targets.drop(unmade.size)
        assertTrue(idle.isNotEmpty() && idle.all { it.idle && it.slot in filled })
        val featSlot = ChoiceSlotId("creation", "feat", 0)
        assertEquals(listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL), idle.takeLast(3).map { it.group })
        assertTrue(idle.takeLast(3).all { it.slot == featSlot })
        assertTrue(idle.dropLast(3).none { it.slot.choiceId == "feat" })
        assertTrue(idle.dropLast(3).any { it.slot.choiceId == "modern4e.choice.fighter-reactivity" })
    }

    @Test fun anOpenedMadeChoiceIsRecheckedAheadOfIdleOnes() = runBlocking {
        val world = fixture()
        val before = world.cache.warmTargets(world.state)
        val unmade = before.takeWhile { !it.idle }
        val lastIdle = before.last { it.idle && it.slot.choiceId != "feat" && it.slot.sourceInstanceId != "creation" }
        assertEquals("No opened pickers yet, so every made choice is idle", before.size - unmade.size, before.count { it.idle })

        world.firstRows(lastIdle.level, lastIdle.slot)
        val after = world.cache.warmTargets(world.state)
        assertEquals(unmade.size + 1, after.takeWhile { !it.idle }.size)
        assertEquals("The opened picker is queued right behind the unmade choices", lastIdle.copy(idle = false), after[unmade.size])
        assertEquals(before.size, after.size)
        assertEquals(before.filter { it != lastIdle }, after.filter { it.slot != lastIdle.slot })
    }

    @Test fun filledFeatSlotsWarmLastAndEveryFeatSlotStillWarmsOncePerTab() = runBlocking {
        val world = fixture()
        world.cache.settleMillis = 0
        world.commit(BuilderEdit.Level(19))
        world.cache.awaitWarmup()
        // Level 1 holds Skill Training and level 2 gets a pick; every later feat slot stays empty.
        val level2Feat = ChoiceSlotId("advancement.2", "feat", 0)
        val pick = world.firstRows(2, level2Feat, FeatGroup.GENERAL).first { it.option?.eligibility == Eligibility.ELIGIBLE }
        world.commit(BuilderEdit.Entry(2, level2Feat, pick.metadata.metadata.id, world.cache.instanceFor(2, level2Feat), true))
        world.cache.awaitWarmup()

        val state = world.state
        val filled = state.document.levels.flatMap { it.entries }.map { it.slot }.toSet()
        val targets = world.cache.warmTargets(state)
        val slots = (1..19).filter { Progression.level(it).feat }
            .map { ChoiceSlotId(if (it == 1) "creation" else "advancement.$it", "feat", 0) }
        val tabs = listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL)
        for (slot in slots) {
            assertEquals("Every feat slot warms once per tab: ${slot.sourceInstanceId}", tabs,
                targets.filter { it.slot == slot }.map { it.group })
        }
        assertEquals(slots.size * tabs.size, targets.count { it.slot.choiceId == "feat" })
        val filledSlots = slots.filter { it in filled }
        assertEquals(listOf(ChoiceSlotId("creation", "feat", 0), level2Feat), filledSlots)
        assertTrue(slots.size > filledSlots.size)

        val emptyFeats = targets.filter { it.slot.choiceId == "feat" && it.slot !in filled }
        val filledFeats = targets.filter { it.slot.choiceId == "feat" && it.slot in filled }
        assertEquals((slots.size - filledSlots.size) * tabs.size, emptyFeats.size)
        assertEquals(filledSlots.size * tabs.size, filledFeats.size)
        // The level 2 feat was opened above, so it is rechecked ahead of speculative work; level 1's feat tabs are the idle tail.
        val openedFeats = filledFeats.filter { it.slot == level2Feat }
        val idleFeats = filledFeats - openedFeats.toSet()
        assertEquals(tabs.size, openedFeats.size)
        assertTrue(openedFeats.none { it.idle })
        assertTrue(idleFeats.all { it.idle })
        assertEquals(idleFeats, targets.takeLast(idleFeats.size))
        assertTrue(targets.dropLast(idleFeats.size).none { it.slot == ChoiceSlotId("creation", "feat", 0) })
        // Unfilled feat tabs run in level order, ahead of every choice that is already made.
        assertTrue(emptyFeats.none { it.idle })
        assertEquals(emptyFeats.map { it.level }, emptyFeats.map { it.level }.sorted())
        val firstIdle = targets.indexOfFirst { it.idle }
        assertTrue(targets.take(firstIdle).all { it.slot !in filled || it.slot == level2Feat })
        assertTrue(targets.drop(firstIdle).all { it.idle })
        assertTrue(targets.drop(firstIdle).any { it.slot.choiceId == "modern4e.choice.fighter-reactivity" })
        val roots = targets.filter { it.slot.sourceInstanceId == "creation" && it.slot.choiceId in setOf("class", "ancestry", "theme") }
        assertTrue(roots.isNotEmpty())
        assertTrue(roots.all { it.idle == (it.slot in filled) })
        // Everything is still warmed eventually: no list the picker can open is left cold.
        for (slot in slots) {
            for (group in tabs) {
                val rows = world.firstRows(if (slot.sourceInstanceId == "creation") 1 else slot.sourceInstanceId.substringAfter('.').toInt(), slot, group)
                assertTrue("${slot.sourceInstanceId} $group opens checked", rows.isNotEmpty() && rows.all { it.checked })
            }
        }
    }

    @Test fun higherLevelFeatRowsUseSharedEligibilityAndWarmAllReachedFeatSlots() = runBlocking {
        val world = fixture(sample().copy(id = "later-feats", level = 19))
        var rows = emptyList<BuilderOptionRow>()
        world.cache.browse(18, ChoiceSlotId("advancement.18", "feat", 0), FeatGroup.GENERAL) { rows = it }
        assertTrue(rows.isNotEmpty())
        assertTrue(rows.all { it.checked })
        assertTrue(rows.none { row -> row.diagnostics.any { it.code == "android.progression" } })
        val targets = world.cache.warmTargets(world.state)
        val featLevels = targets.filter { it.slot.choiceId == "feat" }.map { it.level }.toSet()
        assertEquals((1..19).filter { Progression.level(it).feat }.toSet(), featLevels)
        assertTrue(targets.none { it.level > 19 })
    }

    @Test fun levelTwentyFeatSlotIsWarmedAndNothingAboveItIs() = runBlocking {
        val world = fixture(sample().copy(id = "level-twenty-feats", level = 20))
        val targets = world.cache.warmTargets(world.state)
        val featLevels = targets.filter { it.slot.choiceId == "feat" }.map { it.level }.toSet()
        assertTrue("Level 20 feat slot is a real offer", 20 in featLevels)
        assertEquals((1..20).filter { Progression.level(it).feat }.toSet(), featLevels)
        assertTrue(targets.none { it.level > AdvancementRules.LAST_ENFORCED_LEVEL })
    }

    @Test fun aReachedParagonPathPickerWarmsOnOpen() = runBlocking {
        val opened = fixture()
        val pathSlot = ChoiceSlotId("advancement.11", "paragon-path", 0)
        fun pathTargets(world: Fixture) = world.cache.warmTargets(world.state).filter { it.slot == pathSlot }
        assertTrue("A level 1 character has not reached the path", pathTargets(opened).isEmpty())

        val level10 = fixture(opened.operations.apply(sample(), BuilderEdit.Level(10)).also { assertTrue(it.applied) }.state.document)
        assertTrue("Level 10 has not reached the path", pathTargets(level10).isEmpty())

        val level19 = fixture(opened.operations.apply(sample(), BuilderEdit.Level(19)).also { assertTrue(it.applied) }.state.document)
        level19.cache.awaitWarmup()
        val path = pathTargets(level19).single()
        assertEquals(11, path.level)
        assertFalse("An unmade path is not speculative", path.idle)
        val rows = level19.firstRows(11, pathSlot)
        assertTrue("The path lists candidates", rows.isNotEmpty())
        assertTrue("The path opens checked", rows.all { it.checked })
    }

    @Test fun changingAncestryWarmsItsNewPowerChoiceFirst() = runBlocking {
        val world = fixture()
        world.cache.settleMillis = 0
        val ancestry = ChoiceSlotId("creation", "ancestry", 0)
        val original = world.state.document.levels.flatMap { it.entries }.single { it.slot == ancestry }
        world.commit(BuilderEdit.Entry(1, ancestry, "modern4e.ancestry.dragonborn", original.instanceId, true))

        val state = world.state
        val choice = Progression.ancestryPowerChoices(state, world.powerEntryIds()).single()
        val targets = world.cache.warmTargets(state)
        assertEquals(choice.slot, targets.first().slot)
        assertFalse("The new choice is unmade, so it is not speculative", targets.first().idle)
        assertEquals(1, targets.count { it.slot == choice.slot })

        world.cache.awaitWarmup()
        val rows = world.firstRows(1, choice.slot)
        assertEquals(setOf("modern4e.power.dragon-breath", "modern4e.power.dragonfear"), rows.map { it.metadata.metadata.id }.toSet())
        assertTrue(rows.all { it.checked })
    }

    @Test fun onlyListsTheCharacterCanEditAreWarmed() = runBlocking {
        val world = fixture()
        // Instance IDs stay stable across a class swap, so compare the choices themselves.
        fun owners() = world.cache.warmTargets(world.state).filter { it.slot.sourceInstanceId != "creation" }.map { it.slot.choiceId }
        val fighter = owners()
        assertTrue(fighter.isNotEmpty())
        assertTrue("A Fighter never warms Avenger choices: $fighter", fighter.none { it.contains("avenger", ignoreCase = true) })
        val active = world.state.rules.entries.map { it.instanceId }.toSet()
        assertTrue("Every warmed pool belongs to an active source", world.cache.warmTargets(world.state)
            .filter { it.slot.sourceInstanceId != "creation" && it.slot.sourceInstanceId != "advancement.2" }
            .all { it.slot.sourceInstanceId in active })

        world.commit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "class", 0), "modern4e.class.avenger", "class-avenger", true))
        val avenger = owners()
        assertTrue("An Avenger warms its own choices: $avenger", avenger.any { it.contains("avenger", ignoreCase = true) })
        assertTrue("...and none of the Fighter's: $avenger", avenger.none { it.contains("fighter", ignoreCase = true) })
        assertTrue("Fighter pools no longer apply once the class changes", avenger.none { it == "modern4e.choice.fighter-reactivity" })
    }
}
