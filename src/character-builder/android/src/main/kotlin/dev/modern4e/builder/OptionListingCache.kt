package dev.modern4e.builder

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/** Waits out the settle delay before background warming; production sleeps, tests advance a manual clock. */
fun interface WarmupClock {
    suspend fun sleep(millis: Long)
}

/**
 * The option listings of the open character, kept checked across picker reopens and edits. It owns its snapshot of
 * the character and content, the least-recently-used working set, which pickers were opened lately, background
 * warming and its yielding to foreground work, and the one staleness check every step makes.
 *
 * Locks: [heavy] serializes every heavy evaluation (listing checks here, edits and previews in the session) so they
 * never run concurrently and exhaust the heap; the listing lock guards the working set. The cache never takes the
 * session's edit lock. Warming releases [heavy] between small batches and waits while a picker fills or an edit is
 * pending, so neither waits long behind it.
 *
 * @param preloaded rows prepared elsewhere for a slot, such as Home's Class and Ancestry rows; null when none.
 * @param pendingEdits submitted edits not yet committed; warming waits while there are any.
 */
internal class OptionListingCache(
    private val preloaded: (CharacterDocument, Int, ChoiceSlotId) -> List<BuilderOptionRow>?,
    private val pendingEdits: StateFlow<Int>,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    background: CoroutineDispatcher = Dispatchers.Default,
    private val clock: WarmupClock = WarmupClock { delay(it) },
) {
    /** The character, its content catalog and the operations reading it, which every listing belongs to. */
    class Snapshot(val state: BuilderState, val catalog: ContentCatalog?, val operations: BuilderOperations?)

    @Volatile private var snapshot: Snapshot? = null
    private val heavyWork = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + background)
    private var warming: Job? = null
    /** Access-ordered, so the listings dropped first when the working set is full are the least recently used. */
    private val listings = LinkedHashMap<Pair<Int, ChoiceSlotId>, BuilderOptionListing>(16, 0.75f, true)
    /** Pickers the user opened lately, oldest first, so their rows are rechecked ahead of speculative warming. Guarded by [listings]. */
    private val openedPickers = linkedSetOf<Pair<Int, ChoiceSlotId>>()
    /** Pickers currently filling their rows; background warming waits for this to reach zero between batches. */
    private val pickerDemand = MutableStateFlow(0)
    /** Shared read session for new listings, so a warm-up decodes each chunk and evaluates the character once. Guarded by [listings]. */
    private var browsingOperations: BuilderOperations? = null
    private val warmBatches = AtomicInteger()

    /** How long a committed edit waits for further edits before background warming starts. */
    var settleMillis = 300L

    /** Run heavy evaluation work one piece at a time, between listing batches. */
    suspend fun <T> heavy(block: suspend () -> T): T = heavyWork.withLock { block() }

    /**
     * Another character or content: stop warming, forget every listing and opened picker, then start over from [next]
     * and warm it at once. Null leaves the cache empty.
     */
    fun reset(next: Snapshot?) {
        warming?.cancel()
        warming = null
        drop()
        synchronized(listings) { openedPickers.clear() }
        snapshot = next
        if (next != null) {
            warm(0)
        }
    }

    /**
     * An edit committed [updated]: stop warming, carry every listing over by its [ListingRetention] verdict, then warm
     * again once edits settle. A different [catalog] starts over instead, keeping nothing.
     */
    suspend fun committed(updated: BuilderState, catalog: ContentCatalog?, operations: BuilderOperations?) {
        if (catalog !== snapshot?.catalog) {
            reset(null)
        }
        warming?.cancel()
        warming = null
        // Serialized with checks, so cancelled warming cannot mutate the inherited rows.
        heavyWork.withLock {
            synchronized(listings) {
                val previous = snapshot?.state
                // Keep catalog reads across edits, but prepare rules against the new document.
                browsingOperations = browsingOperations?.nextBrowsingSession()
                for ((key, retained) in listings.toMap()) {
                    if (previous == null) {
                        listings.remove(key)
                        continue
                    }
                    val verdict = ListingRetention.verdict(previous, updated, retained)
                    val browsing = if (verdict is RetentionVerdict.Rebase) {
                        browsingOperations ?: operations?.browsingSession()?.also { browsingOperations = it }
                    } else {
                        null
                    }
                    val listing = retained.retainedAfter(verdict, updated, browsing)
                    if (listing == null) {
                        listings.remove(key)
                    } else if (listing !== retained) {
                        // A kept listing is not touched, so it keeps its place in the least-recently-used order.
                        listings[key] = listing
                    }
                }
                snapshot = Snapshot(updated, catalog, operations)
            }
        }
        warm(settleMillis)
    }

    /** New selections save the same occurrence ID the picker used to check its candidates. */
    fun instanceFor(level: Int, slot: ChoiceSlotId): String =
        synchronized(listings) { listings[level to slot]?.newInstanceId } ?: UUID.randomUUID().toString()

    /**
     * Publish a slot's rows for a picker, then check small batches, publishing after each. Background warming waits
     * while this runs and resumes from the same listing. Returns content read failures for the caller to report.
     */
    suspend fun browse(level: Int, slot: ChoiceSlotId, group: FeatGroup?,
        onUpdate: suspend (List<BuilderOptionRow>) -> Unit): List<Diagnostic> {
        val original = snapshot ?: return emptyList()
        synchronized(listings) {
            openedPickers.remove(level to slot)
            openedPickers.add(level to slot)
            if (openedPickers.size > OPENED_PICKER_LIMIT) {
                openedPickers.remove(openedPickers.first())
            }
        }
        // An open picker outranks background warming, which resumes from the same listing once this returns.
        pickerDemand.update { it + 1 }
        return try {
            browseRows(original, level, slot, group, onUpdate)
        } finally {
            pickerDemand.update { it - 1 }
        }
    }

    /** Whether [original] is still the character and content the cache holds; work for an older one stops. */
    private fun isCurrent(original: Snapshot): Boolean {
        val now = snapshot
        return now?.state?.document == original.state.document && now.catalog === original.catalog
    }

    /**
     * Fill the retained listing for an active slot, publishing after each checked batch. The picker and
     * the background warm-up both run this, so a warmed list opens already checked. Returns content read
     * failures for the caller to handle; nothing here is published as a blocking error.
     */
    private suspend fun browseRows(original: Snapshot, level: Int, slot: ChoiceSlotId, group: FeatGroup?,
        onUpdate: suspend (List<BuilderOptionRow>) -> Unit): List<Diagnostic> {
        if (original.catalog != null && isCurrent(original)) {
            preloadedRows(original.state.document, level, slot)?.let {
                onUpdate(it)
                return emptyList()
            }
        }
        val listing = retainedListing(original, level, slot)
        if (listing == null) {
            if (isCurrent(original)) {
                onUpdate(emptyList())
            }
            return emptyList()
        }
        var rows = withContext(io) { heavyWork.withLock { listing.rows(group) } }
        if (!isCurrent(original)) {
            return emptyList()
        }
        onUpdate(rows)
        // The lock is released between batches, so edits and previews queue ahead of the next batch.
        for (batch in rows.filterNot { it.checked }.chunked(OPTION_BATCH_SIZE)) {
            currentCoroutineContext().ensureActive()
            if (!isCurrent(original)) {
                return emptyList()
            }
            val checked = withContext(io) { heavyWork.withLock { listing.check(batch.map { it.metadata.metadata.id }) } }
            if (!isCurrent(original)) {
                return emptyList()
            }
            val failures = checked.flatMap { it.diagnostics }.filter { it.kind == DiagnosticKind.IO_FAILURE }
            if (failures.isNotEmpty()) {
                return failures.distinct()
            }
            rows = withContext(io) { heavyWork.withLock { listing.rows(group) } }
            onUpdate(rows)
        }
        return emptyList()
    }

    /**
     * The retained listing for a slot, created from the snapshot when absent. Null when the snapshot changed since
     * [original], when the slot has nothing to list, or when [create] is false and none is retained. Creating one past
     * [OPTION_LISTING_LIMIT] drops the least recently used; the checked rows are small beside the content itself.
     */
    private suspend fun retainedListing(original: Snapshot, level: Int, slot: ChoiceSlotId,
        create: Boolean = true): BuilderOptionListing? = withContext(io) { heavyWork.withLock {
        if (!isCurrent(original)) {
            return@withLock null
        }
        val retained = synchronized(listings) { listings[level to slot] }
        if (retained != null || !create) {
            return@withLock retained
        }
        val document = original.state.document
        val browsing = browsingOperations ?: original.operations?.browsingSession()?.also { browsingOperations = it }
        val featState = if (slot.choiceId == "feat" && level > document.level) {
            browsing?.evaluate(document.copy(level = level)) ?: original.state
        } else {
            original.state
        }
        synchronized(listings) {
            if (!isCurrent(original)) {
                return@synchronized null
            }
            val key = level to slot
            listings[key] ?: run {
                val newInstanceId = document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
                    ?.instanceId ?: UUID.randomUUID().toString()
                val featClasses = if (slot.choiceId == "feat") featState.featClasses() else null
                browsing?.optionListing(document, level, slot, newInstanceId, featClasses, featState.featAncestries())?.also {
                    listings[key] = it
                    while (listings.size > OPTION_LISTING_LIMIT) {
                        listings.remove(listings.keys.first())
                    }
                }
            }
        }
    } }

    /** Suspends until no picker is filling and no submitted edit is waiting to commit, so background work never delays either. */
    private suspend fun awaitForeground() {
        if (pickerDemand.value == 0 && pendingEdits.value == 0) {
            return
        }
        combine(pickerDemand, pendingEdits) { picking, unsaved -> picking == 0 && unsaved == 0 }.first { it }
    }

    /** Root Class and Ancestry rows prepared elsewhere; every other slot is listed here. */
    private fun preloadedRows(document: CharacterDocument, level: Int, slot: ChoiceSlotId): List<BuilderOptionRow>? =
        if (ListingRetention.isRootList(level, slot)) preloaded(document, level, slot) else null

    /**
     * Finish the most useful missing work, so the lists the user is likely to open next open already filled in. The queue
     * is rebuilt from the character after every edit (see [warmTargets]), and each target only does what its retained
     * listing still lacks (see [warmTarget]), so completed lists are skipped, a rebased list rechecks only its affected
     * rows, and slots the character no longer offers are simply absent. A character with no class or ancestry simply has
     * rows without eligibility to show; a failed read drops the working set and leaves the rest to the picker.
     *
     * [settle] holds the first batch back until edits stop arriving, so a burst of taps never queues behind background
     * work, and every later batch yields to an open picker or a pending edit.
     */
    private fun warm(settle: Long) {
        val original = snapshot ?: return
        if (original.operations == null) {
            return
        }
        val targets = warmTargets(original.state)
        warming = scope.launch {
            clock.sleep(settle)
            for (target in targets) {
                // A failed read is left for the picker to meet and report; its half-checked rows are discarded.
                if (warmTarget(original, target).isNotEmpty()) {
                    drop()
                    return@launch
                }
            }
        }
    }

    /**
     * Finish only what a warm target still lacks: list its rows if the listing is new or rebased, then check just the rows
     * without a result, a few at a time. A complete listing costs one short lock hold. Between batches it yields to an open
     * picker or a pending edit, whose work then resumes from the same listing. Speculative targets (see [WarmTarget.idle])
     * continue an existing listing but never create one once the working set is full. Returns content read failures.
     */
    private suspend fun warmTarget(original: Snapshot, target: WarmTarget): List<Diagnostic> {
        if (!isCurrent(original) || preloadedRows(original.state.document, target.level, target.slot) != null) {
            return emptyList()
        }
        awaitForeground()
        val room = synchronized(listings) { listings.size < OPTION_LISTING_LIMIT }
        val listing = retainedListing(original, target.level, target.slot, create = !target.idle || room) ?: return emptyList()
        val missing = withContext(io) { heavyWork.withLock {
            if (listing.isComplete(target.group)) emptyList() else listing.rows(target.group).filterNot { it.checked }
        } }
        for (batch in missing.chunked(WARM_BATCH_SIZE)) {
            currentCoroutineContext().ensureActive()
            awaitForeground()
            if (!isCurrent(original)) {
                return emptyList()
            }
            val checked = withContext(io) { heavyWork.withLock { listing.check(batch.map { it.metadata.metadata.id }) } }
            warmBatches.incrementAndGet()
            val failures = checked.flatMap { it.diagnostics }.filter { it.kind == DiagnosticKind.IO_FAILURE }
            if (failures.isNotEmpty()) {
                return failures.distinct()
            }
        }
        return emptyList()
    }

    /**
     * A listing the background warm-up may fill. [idle] marks speculative work (a choice already made and not lately
     * opened) that only runs once everything the user is likely to open next is done.
     */
    internal data class WarmTarget(val level: Int, val slot: ChoiceSlotId, val group: FeatGroup?, val idle: Boolean = false)

    /**
     * Only lists this character can actually edit: choices come from the engine's active sources, so another
     * class's choices (an Avenger's Vindicator's Censure, say) are never offered to a Fighter and never warmed.
     *
     * Order: every choice still unmade, by level (the next one the character will face first). Within a level that is
     * unfilled ancestry power choices, Class Feature choices, power pools, the Class, Ancestry and General tabs of an
     * empty feat slot (back to back, sharing one set of prepared facts), other choices, then the root pickers. After
     * those come choices already made that the user opened lately, most recent first. Last are the remaining made
     * choices, marked [WarmTarget.idle]: power pools and class features before feat tabs, by level. A loaded character
     * usually has all of those filled and opens at most one or two, so they are nice-to-haves that never delay an open
     * decision.
     */
    fun warmTargets(state: BuilderState): List<WarmTarget> {
        val document = state.document
        val filled = document.levels.filter { it.level <= document.level }.flatMap { it.entries }.map { it.slot }.toSet()
        val offered = (1..minOf(document.level, 19)).flatMap { level ->
            Progression.levelChoices(state, level).filter { it.abilities.isEmpty() && it.entries.isNotEmpty() }.map { level to it }
        }
        val powerEntryIds = snapshot?.catalog?.search(category = EntryCategory.POWER).orEmpty().mapTo(mutableSetOf()) { it.metadata.id }
        val ancestryPowerSlots = Progression.ancestryPowerChoices(state, powerEntryIds).mapTo(mutableSetOf()) { it.slot }
        val rootOffers = state.rules.choices.filter { it.listing == SlotListing.DEFERRED }
        fun SlotCategory?.isEntry(category: EntryCategory) = this == SlotCategory.Entry(category)
        val featSlots = rootOffers.filter { it.category.isEntry(EntryCategory.FEAT) }.map { requireNotNull(it.acquisitionLevel) to it.slot }
        val roots = listOf(EntryCategory.CLASS, EntryCategory.ANCESTRY, EntryCategory.THEME).mapNotNull { category ->
            rootOffers.firstOrNull { it.category.isEntry(category) }?.slot
        }.filter { preloadedRows(document, 1, it) == null }
        // The rank breaks ties within a level; the declared order breaks ties within a rank.
        val candidates = offered.map { (level, choice) ->
            val rank = when {
                choice.slot in ancestryPowerSlots && choice.slot !in filled -> 0
                Progression.isPowerPool(state, choice) -> 2
                Progression.isClassFeatureChoice(state, choice) -> 1
                else -> 4
            }
            rank to WarmTarget(level, choice.slot, null)
        } + featSlots.flatMap { (level, slot) ->
            listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL).map { group -> 3 to WarmTarget(level, slot, group) }
        } + roots.map { 5 to WarmTarget(1, it, null) }
        val (unmade, made) = candidates.partition { (_, target) -> target.slot !in filled }
        val opened = synchronized(listings) { openedPickers.toList() }
        val (reopened, rest) = made.partition { (_, target) -> target.level to target.slot in opened }
        return unmade.sortedWith(compareBy({ it.second.level }, { it.first })).map { it.second } +
            reopened.sortedByDescending { (_, target) -> opened.indexOf(target.level to target.slot) }.map { it.second } +
            rest.sortedWith(compareBy({ if (it.first == 3) 1 else 0 }, { it.second.level }, { it.first }))
                .map { it.second.copy(idle = true) }
    }

    /** Test hook: returns once the warm-up started by the last commit or reset has finished or been cancelled. */
    suspend fun awaitWarmup() {
        warming?.join()
    }

    /** Test hook: eligibility batches background warming has checked so far. */
    val warmBatchCount: Int get() = warmBatches.get()

    /** Test hook: how many option listings are retained right now. */
    fun retainedCount(): Int = synchronized(listings) { listings.size }

    /** Forget every listing and the shared read session, keeping the snapshot. */
    private fun drop() {
        synchronized(listings) {
            listings.clear()
            browsingOperations = null
        }
    }

    /** Stop all background work for good. */
    fun close() {
        scope.cancel()
    }

    companion object {
        /** Options checked per batch while a picker fills; the lock is released and cancellation observed between batches. */
        const val OPTION_BATCH_SIZE = 32

        /** Options checked per batch by background warming; small, so a picker or edit never waits long behind it. */
        const val WARM_BATCH_SIZE = 8

        /** Retained listings kept at once. The least recently used go first, and speculative warming never evicts for a new one. */
        const val OPTION_LISTING_LIMIT = 32

        /** Opened pickers remembered for warming order. */
        private const val OPENED_PICKER_LIMIT = 8
    }
}
