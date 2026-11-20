package dev.modern4e.builder

import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Pins the content reads, warm-up batches and retained listings of a fixed sequence of Levels edits on the level-19
 * regression Fighter. The numbers are exact on purpose: when an improvement lowers one, lower the threshold with it;
 * raise one only with a stated reason.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SessionWorkBaselineTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore

    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    @Test fun levelsEditsOnTheRegressionFighterDoAFixedAmountOfWork() = runBlocking {
        val real = AndroidContentSource(context.assets)
        val chunks = AtomicInteger()
        val indexes = AtomicInteger()
        val source = object : ContentSource by real {
            override suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex> {
                indexes.incrementAndGet()
                return real.loadIndex(packageId, indexId)
            }

            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                chunks.incrementAndGet()
                return real.loadChunk(packageId, chunkId)
            }
        }
        val document = RegressionFighter.document()
        store.save(document, SaveMode.CREATE)
        val model = BuilderSession(store, source) { document }.also { it.listings.settleMillis = 0 }
        val measured = mutableListOf<String>()
        var batches = 0
        suspend fun record(step: String) {
            model.awaitWarmup()
            assertTrue(model.errors.toString(), model.errors.isEmpty())
            measured += "$step: ${indexes.getAndSet(0)} index reads, ${chunks.getAndSet(0)} chunk reads, " +
                "${model.listings.warmBatchCount - batches} warm batches, ${model.listings.retainedCount()} retained"
            batches = model.listings.warmBatchCount
        }

        model.load(document.id)
        record("open")
        for ((step, edit) in RegressionFighter.edits) {
            model.edit(edit)
            record(step)
        }

        // Each edit re-reads the 24 chunks one evaluation needs (see PerformanceBaselineTest); the path edit reads 2 more.
        assertEquals(listOf(
            "open: 9 index reads, 101 chunk reads, 641 warm batches, 31 retained",
            "unrelated feat: 0 index reads, 24 chunk reads, 142 warm batches, 31 retained",
            "encounter power: 0 index reads, 24 chunk reads, 293 warm batches, 31 retained",
            "ability at 4: 0 index reads, 24 chunk reads, 525 warm batches, 31 retained",
            "level 1 skill: 0 index reads, 24 chunk reads, 636 warm batches, 31 retained",
            "paragon path: 0 index reads, 26 chunk reads, 301 warm batches, 31 retained",
        ), measured)
    }
}
