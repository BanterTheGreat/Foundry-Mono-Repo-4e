package dev.modern4e.builder

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Snapshot of which option listings survive typical Levels edits on the level-19 regression Fighter. It reads only what
 * a reopened picker publishes first, so it stays valid when listing retention moves behind another interface:
 *
 * - retained: every row still carries its checked result;
 * - rebased k/n: the definitions were kept but k of n rows must be checked again (their IDs when there are few);
 * - fresh: no row carries a definition, so the listing was dropped and is built again;
 * - empty: the slot lists no candidates.
 *
 * When a refactor retains more, update the snapshot to the improved outcome; anything that retains less needs a reason.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ListingRetentionBaselineTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore

    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    private data class Target(val name: String, val level: Int, val slot: ChoiceSlotId, val group: FeatGroup? = null)

    private val featSlot = ChoiceSlotId("advancement.18", "feat", 0)
    private val targets = listOf(
        Target("feat 18 class", 18, featSlot, FeatGroup.CLASS),
        Target("feat 18 ancestry", 18, featSlot, FeatGroup.ANCESTRY),
        Target("feat 18 general", 18, featSlot, FeatGroup.GENERAL),
        Target("utility 17", 17, ChoiceSlotId("fighter", "modern4e.choice.class-utility-17", 0)),
        Target("encounter 13", 13, ChoiceSlotId("fighter", "modern4e.choice.class-attack-encounter-13", 0)),
        Target("paragon path", 11, ChoiceSlotId("advancement.11", "paragon-path", 0)),
        Target("linguist language", 4, ChoiceSlotId("feat-4", "modern4e.choice.linguist.languages", 0)),
    )

    /** The rows a reopened picker publishes before it checks anything. */
    private suspend fun BuilderSession.firstRows(target: Target): List<BuilderOptionRow> {
        var result = emptyList<BuilderOptionRow>()
        try {
            progressionOptionRows(target.level, target.slot, target.group) {
                result = it
                throw CancellationException("Inspect retained rows before eligibility checks")
            }
        } catch (_: CancellationException) { }
        return result
    }

    private fun outcome(rows: List<BuilderOptionRow>): String {
        val pending = rows.filterNot { it.checked }
        return when {
            rows.isEmpty() -> "empty"
            pending.isEmpty() -> "retained"
            rows.all { it.option == null } -> "fresh"
            else -> "rebased ${pending.size}/${rows.size}" +
                (if (pending.size <= 3) " " + pending.map { it.metadata.metadata.id } else "") +
                rows.count { it.option == null }.let { new -> if (new > 0) ", $new new" else "" }
        }
    }

    /** Record what each listing publishes first, then check it completely so the next edit starts from finished lists. */
    private suspend fun BuilderSession.snapshot(): List<String> = targets.map { target ->
        val first = outcome(firstRows(target))
        progressionOptionRows(target.level, target.slot, target.group) { }
        assertTrue(errors.toString(), errors.isEmpty())
        assertTrue("${target.name} finished checking", firstRows(target).all { it.checked })
        "${target.name}: $first"
    }

    @Test fun typicalLevelsEditsRetainRebaseOrDropAFixedSetOfListings() = runBlocking {
        val document = RegressionFighter.document()
        store.save(document, SaveMode.CREATE)
        val model = BuilderSession(store, AndroidContentSource(context.assets)) { document }
        model.load(document.id)
        // Opening always warms at once; let it finish, then keep later warming away from the lists under observation.
        model.awaitWarmup()
        model.listings.settleMillis = 60_000
        val observed = linkedMapOf("open" to model.snapshot())
        for ((step, edit) in RegressionFighter.edits) {
            model.edit(edit)
            assertTrue(model.errors.toString(), model.errors.isEmpty())
            observed[step] = model.snapshot()
        }

        // A selection edit below level 18 rechecks only the feat rows that can depend on it. Until the retention verdict
        // counted only changed selections and resolved retired originals through the occurrence timeline, the daily
        // replacements at 9 and 15 made every such edit recheck all 236 feat rows (77/77, 11/11 and 148/148).
        // Value choices list no entries; their values come from the rules.
        val featsRechecked = listOf("feat 18 class: rebased 77/77", "feat 18 ancestry: rebased 11/11",
            "feat 18 general: rebased 148/148")
        val structural = featsRechecked + listOf("utility 17: rebased 354/354", "encounter 13: rebased 164/164")
        assertEquals(linkedMapOf(
            "open" to listOf("feat 18 class: retained", "feat 18 ancestry: retained", "feat 18 general: retained",
                "utility 17: retained", "encounter 13: retained", "paragon path: fresh", "linguist language: empty"),
            "unrelated feat" to listOf("feat 18 class: retained", "feat 18 ancestry: retained", "feat 18 general: rebased 49/148",
                "utility 17: retained", "encounter 13: retained", "paragon path: retained", "linguist language: empty"),
            "encounter power" to listOf("feat 18 class: retained", "feat 18 ancestry: retained", "feat 18 general: rebased 48/148",
                "utility 17: retained", "encounter 13: rebased 164/164",
                "paragon path: retained", "linguist language: empty"),
            "ability at 4" to structural + listOf("paragon path: rebased 35/35", "linguist language: empty"),
            "level 1 skill" to structural + listOf("paragon path: rebased 35/35", "linguist language: empty"),
            "paragon path" to structural + listOf("paragon path: retained", "linguist language: empty"),
        ), observed)
    }
}
