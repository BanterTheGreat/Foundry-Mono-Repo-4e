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
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * The option listing cache on its own: warm-up order, settling, yielding to pickers and pending edits, the bounded
 * working set and quiet read failures, driven by a manual clock and committed states, without a session or storage.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OptionListingCacheTest {
    private val context get() = RuntimeEnvironment.getApplication()

    private fun sample(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value

    /** A clock the test advances by hand, so a settle delay ends exactly when the test says. */
    private class ManualClock : WarmupClock {
        private val now = MutableStateFlow(0L)

        override suspend fun sleep(millis: Long) {
            val until = now.value + millis
            now.first { it >= until }
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

        /** Every list the level 1 Levels screen can open is already checked. */
        suspend fun assertEveryLevel1ListIsWarm(message: String) {
            val unmade = cache.warmTargets(state).filter { it.level == 1 }
            assertTrue(unmade.isNotEmpty())
            for (target in unmade) {
                val rows = firstRows(target.level, target.slot, target.group)
                assertTrue("$message: ${target.slot.choiceId} ${target.group} opens checked", rows.isNotEmpty() && rows.all { it.checked })
            }
        }
    }

    private suspend fun fixture(document: CharacterDocument = sample(),
        source: ContentSource = AndroidContentSource(context.assets)): Fixture {
        val catalog = (ContentCatalog.open(source, "modern4e.classes", document.packages) as ContractResult.Available).value
        val operations = BuilderOperations(catalog)
        val pendingEdits = MutableStateFlow(0)
        val clock = ManualClock()
        val cache = OptionListingCache({ _, _, _ -> null }, pendingEdits, clock = clock)
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
}
