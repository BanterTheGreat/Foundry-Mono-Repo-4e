package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*
import kotlin.time.TimeSource

/**
 * Pins today's content reads for the level-19 regression Fighter so refactors cannot quietly make evaluation or
 * listings slower. The thresholds are exact on purpose: when an improvement lowers a number, lower the threshold
 * with it; raise one only with a stated reason.
 */
class PerformanceBaselineTest {
    /** Production content that counts every index and chunk it hands out. */
    private class CountingSource : ContentSource {
        val chunks = mutableListOf<Pair<String, String>>()
        val indexes = mutableListOf<Pair<String, String>>()
        override suspend fun listPackages() = CurrentDataFixtures.listPackages()
        override suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex> {
            indexes += packageId to indexId
            return CurrentDataFixtures.loadIndex(packageId, indexId)
        }
        override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
            chunks += packageId to chunkId
            return CurrentDataFixtures.loadChunk(packageId, chunkId)
        }
    }

    private val fixture = assertIs<ContractResult.Available<CharacterDocument>>(
        ContractCodec.decode(contractFixtures.getValue("sample-regression-fighter-19.json"))).value

    private suspend fun open(source: ContentSource) = assertIs<ContractResult.Available<ContentCatalog>>(
        ContentCatalog.open(source, "modern4e.classes", fixture.packages)).value

    @Test
    fun regressionFighterIsACompleteProductionCharacter() = synchronous {
        val state = BuilderOperations(open(CurrentDataFixtures)).evaluate(fixture)
        assertEquals(19, state.document.level)
        assertEquals(emptyList(), state.rules.diagnostics.filter { it.kind != DiagnosticKind.INCOMPLETE_AUTOMATION },
            "Only automation coverage may be reported for a complete character")
        fun owns(id: String) = state.rules.entries.any { it.definition.entry.id == id }
        assertTrue(owns("modern4e.path.notorious-celebrity"))
        assertTrue(owns("modern4e.power.path-summon-audience"), "Path grants arrive through level 19")
        assertTrue(owns("modern4e.feat.student-of-battle"), "One multiclass feat")
        for ((replaced, replacement) in listOf("modern4e.power.fighter-power1429" to "modern4e.power.fighter-power10478",
            "modern4e.power.fighter-power10153" to "modern4e.power.fighter-power10002",
            "modern4e.power.fighter-power1524" to "modern4e.power.fighter-power10005")) {
            assertFalse(owns(replaced), "$replaced is retired by its daily replacement")
            assertTrue(owns(replacement))
        }
        assertEquals(6, state.rules.overviewAbilityTotals.getValue(Ability.STRENGTH))
        assertEquals(4, state.rules.overviewAbilityTotals.getValue(Ability.CONSTITUTION))
        assertEquals(4, state.rules.overviewAbilityTotals.getValue(Ability.DEXTERITY))
        assertEquals(listOf("DRACONIC", "ELVEN", "GIANT", "DIPLOMACY"),
            state.document.levels.single { it.level == 4 }.values.map { it.value })
    }

    @Test
    fun evaluatingTheRegressionFighterReadsAFixedSetOfContent() = synchronous {
        val source = CountingSource()
        val operations = BuilderOperations(open(source))
        val opened = source.indexes.size to source.chunks.size
        val started = TimeSource.Monotonic.markNow()
        operations.evaluate(fixture)
        val firstTime = started.elapsedNow()
        val first = source.chunks.toList()
        source.chunks.clear()
        // Each command starts a fresh read session, so evaluating again decodes the same chunks again.
        val again = TimeSource.Monotonic.markNow()
        operations.evaluate(fixture)
        // Wall-clock time is reported for manual comparison only; it is never asserted.
        println("Level 19 regression Fighter evaluation: first $firstTime, again ${again.elapsedNow()}")
        assertEquals(mapOf(
            "index reads to open the catalog" to 9,
            "chunk reads to open the catalog" to 0,
            "chunk reads for one evaluation" to 24,
            "distinct chunks for one evaluation" to 24,
            "chunk reads for a second evaluation" to 24,
        ), mapOf(
            "index reads to open the catalog" to opened.first,
            "chunk reads to open the catalog" to opened.second,
            "chunk reads for one evaluation" to first.size,
            "distinct chunks for one evaluation" to first.toSet().size,
            "chunk reads for a second evaluation" to source.chunks.size,
        ))
    }

    private val listings = listOf(
        Triple("feat 18", 18, ChoiceSlotId("advancement.18", "feat", 0)),
        Triple("utility 17", 17, ChoiceSlotId("fighter", "modern4e.choice.class-utility-17", 0)),
        Triple("encounter 13", 13, ChoiceSlotId("fighter", "modern4e.choice.class-attack-encounter-13", 0)),
        Triple("paragon path", 11, ChoiceSlotId("advancement.11", "paragon-path", 0)),
    )

    /** List and check every row (every tab of a feat slot) as a picker or the warm-up would; returns the row count. */
    private suspend fun BuilderOperations.checkAll(level: Int, slot: ChoiceSlotId): Int {
        val existing = fixture.levels.flatMap { it.entries }.single { it.slot == slot }.instanceId
        val listing = optionListing(fixture, level, slot, existing)
        return (if (slot.choiceId == "feat") FeatGroup.entries else listOf(null)).sumOf { group ->
            val ids = listing.rows(group).map { it.metadata.metadata.id }
            assertTrue(listing.check(ids).all { it.checked })
            ids.size
        }
    }

    @Test
    fun checkingRepresentativeListingsReadsAFixedSetOfContent() = synchronous {
        val measured = mutableListOf<String>()
        for ((name, level, slot) in listings) {
            val source = CountingSource()
            val rows = BuilderOperations(open(source)).browsingSession().checkAll(level, slot)
            measured += "$name alone: $rows rows, ${source.chunks.size} chunk reads"
        }
        // One browsing session shares decoded chunks between listings, as the Android warm-up does.
        val source = CountingSource()
        val browsing = BuilderOperations(open(source)).browsingSession()
        for ((name, level, slot) in listings) {
            val before = source.chunks.size
            browsing.checkAll(level, slot)
            measured += "$name shared: ${source.chunks.size - before} chunk reads"
        }
        measured += "shared distinct chunks: ${source.chunks.toSet().size}"
        assertEquals(listOf(
            "feat 18 alone: 610 rows, 77 chunk reads",
            "utility 17 alone: 354 rows, 24 chunk reads",
            "encounter 13 alone: 164 rows, 24 chunk reads",
            "paragon path alone: 35 rows, 26 chunk reads",
            "feat 18 shared: 77 chunk reads",
            "utility 17 shared: 0 chunk reads",
            "encounter 13 shared: 0 chunk reads",
            "paragon path shared: 2 chunk reads",
            "shared distinct chunks: 79",
        ), measured)
    }

    private fun synchronous(block: suspend () -> Unit) {
        var completed = false
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                result.getOrThrow()
                completed = true
            }
        })
        assertTrue(completed)
    }
}
