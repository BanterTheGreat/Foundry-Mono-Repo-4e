package dev.modern4e.builder

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.time.Instant
import java.util.UUID

/** Activity-retained workflow state. Rules and atomic persistence stay behind their shared boundaries. */
class BuilderSession(
    private val store: CharacterStore,
    private val source: ContentSource,
    private val sample: () -> CharacterDocument,
) : ViewModel() {
    var page by mutableStateOf("home")
    var current by mutableStateOf<BuilderState?>(null)
    var characters by mutableStateOf(emptyList<CharacterSummary>())
    var recoveries by mutableStateOf<List<RecoverySummary>?>(null)
    var preview by mutableStateOf<ImportPreview?>(null)
    var deleting by mutableStateOf<CharacterSummary?>(null)
    var errors by mutableStateOf(emptyList<Diagnostic>())
    var busy by mutableStateOf(false)
    var libraryNeedsRefresh by mutableStateOf(false)
        private set
    var pending by mutableStateOf<CharacterDocument?>(null)
    var description by mutableStateOf<ResolvedEntry?>(null)
    var dialog by mutableStateOf<String?>(null)
    /** Classes offered while the new-character menu is open; null when it is closed. */
    var classMenu by mutableStateOf<List<CatalogEntry>?>(null)
    @Volatile private var classMenuCatalog: ContentCatalog? = null
    var draft by mutableStateOf("")
    private var committed: CharacterDocument? = null
    private var operations: BuilderOperations? = null
    @Volatile private var catalog: ContentCatalog? = null
    private val heavyWork = Mutex()
    private val background = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var warming: Job? = null
    /** How long a committed edit waits for further edits before background warming starts. */
    internal var warmupSettleMillis = 300L
    private class RetainedListing(val listing: BuilderOptionListing, val document: CharacterDocument)
    private val optionListings = linkedMapOf<Pair<Int, ChoiceSlotId>, RetainedListing>()
    private val importer = CharacterImporter(store) { UUID.randomUUID().toString() }

    /** Call on Main; operations run on IO. Errors block further work until the session is reset. */
    suspend fun run(action: suspend BuilderSession.() -> Unit) {
        if (busy || errors.isNotEmpty()) {
            return
        }
        busy = true
        try {
            action()
        } catch (error: Exception) {
            if (error is kotlinx.coroutines.CancellationException) {
                throw error
            }
            errors = listOf(Diagnostic("android.workflow", DiagnosticKind.IO_FAILURE, error.message ?: "Operation failed"))
        } finally {
            busy = false
        }
    }

    suspend fun refresh() {
        when (val result = withContext(Dispatchers.IO) { store.list() }) {
            is ContractResult.Available -> {
                characters = result.value
                libraryNeedsRefresh = false
            }
            is ContractResult.Unavailable -> errors = result.diagnostics
        }
    }

    /** Drop all active workflow state; the next library visit reloads committed data. */
    fun returnHomeAfterError() {
        if (busy) {
            return
        }
        page = "home"
        current = null
        committed = null
        pending = null
        operations = null
        catalog = null
        clearOptionListings()
        dialog = null
        classMenu = null
        draft = ""
        deleting = null
        preview = null
        recoveries = null
        description = null
        characters = emptyList()
        libraryNeedsRefresh = true
        errors = emptyList()
    }

    suspend fun openLibrary() {
        if (libraryNeedsRefresh) {
            refresh()
        }
        if (errors.isEmpty()) {
            page = "library"
        }
    }

    /** Requesting or cancelling confirmation never mutates storage. */
    fun requestDeletion(character: CharacterSummary) {
        errors = emptyList()
        deleting = character
    }

    fun cancelDeletion() {
        deleting = null
        errors = emptyList()
    }

    /** Failed deletion leaves committed data intact and triggers the blocking error flow. */
    suspend fun confirmDeletion() {
        val character = deleting ?: return
        when (val result = withContext(Dispatchers.IO) { store.delete(character.id) }) {
            is ContractResult.Unavailable -> errors = result.diagnostics
            is ContractResult.Available -> {
                deleting = null
                characters = characters.filterNot { it.id == character.id }
                if (current?.document?.id == character.id) {
                    current = null
                    committed = null
                    pending = null
                    operations = null
                    catalog = null
                    clearOptionListings()
                    description = null
                    dialog = null
                }
                page = "library"
                refresh()
            }
        }
    }

    /** Open the new-character class menu. Nothing is created or stored until a class is confirmed. */
    suspend fun beginCreate() {
        val packages = withContext(Dispatchers.IO) { sample() }.packages
        when (val result = withContext(Dispatchers.IO) { ContentCatalog.open(source, "modern4e.classes", packages) }) {
            is ContractResult.Unavailable -> errors = result.diagnostics
            is ContractResult.Available -> {
                val classes = result.value.search(category = EntryCategory.CLASS)
                if (classes.isEmpty()) {
                    errors = listOf(Diagnostic("android.create", DiagnosticKind.UNRESOLVED_CONTENT, "No classes are available."))
                } else {
                    classMenuCatalog = result.value
                    classMenu = classes.sortedBy { it.metadata.title.lowercase() }
                }
            }
        }
    }

    /**
     * The description a class card shows when expanded, read on demand so opening the menu stays index-only.
     *
     * @param classId the catalog id of a class listed in [classMenu].
     * @return the class's HTML description, or null when it cannot be read.
     */
    suspend fun classDescription(classId: String): String? {
        val catalog = classMenuCatalog ?: return null
        val resolved = withContext(Dispatchers.IO) { catalog.lookup(classId) }
        return (resolved as? ContractResult.Available)?.value?.entry?.presentation?.description
    }

    fun cancelCreate() {
        classMenu = null
    }

    /**
     * Create and open a character. With a [classId] the character starts as that class, with its first
     * main ability at 4 and the class's secondary abilities favoured for the remaining points; without
     * one it starts as the bundled sample.
     */
    suspend fun create(classId: String? = null) {
        var base = withContext(Dispatchers.IO) { sample() }
        if (classId != null) {
            base = startingClass(base, classId) ?: return
        }
        val document = base.copy(
            id = UUID.randomUUID().toString(), savedAt = Instant.now().toString(),
            identity = CharacterIdentity("New character"))
        classMenu = null
        if (persist(document, null)) {
            open(document)
            refresh()
        }
    }

    /** Swap the sample's class for [classId]; a missing class is reported rather than silently replaced. */
    private suspend fun startingClass(base: CharacterDocument, classId: String): CharacterDocument? {
        val resolved = withContext(Dispatchers.IO) {
            (ContentCatalog.open(source, "modern4e.classes", base.packages) as? ContractResult.Available)
                ?.value?.lookup(classId) as? ContractResult.Available
        }?.value
        if (resolved == null || resolved.entry.category != EntryCategory.CLASS) {
            errors = listOf(Diagnostic("android.create", DiagnosticKind.UNRESOLVED_CONTENT, "Class $classId is unavailable."))
            return null
        }
        val profile = resolved.entry.mechanics.classProfile
        val main = profile?.mainAbilities?.first() ?: base.abilities.mainAbility
        val others = (profile?.secondaryAbilities.orEmpty() + Ability.entries).distinct().filter { it != main }
        val points = mapOf(main to 4) + others.zip(listOf(2, 2, 1, 0, 0)).toMap()
        val instanceId = classId.substringAfterLast('.')
        val slot = ChoiceSlotId("creation", "class", 0)
        val selection = SavedSelection(resolved.entry.id, resolved.entry.presentation.title,
            resolved.supplier.packageId, resolved.fingerprint)
        return base.copy(
            abilities = AbilityAllocation(ChoiceSlotId(instanceId, "main", 0), main, points),
            levels = base.levels.map { level ->
                level.copy(entries = level.entries.filterNot { it.slot == slot } + EntryChoice(instanceId, slot, selection))
            })
    }

    suspend fun load(id: String) {
        when (val result = withContext(Dispatchers.IO) { store.load(id) }) {
            is ContractResult.Available -> open(result.value)
            is ContractResult.Unavailable -> errors = result.diagnostics
        }
    }

    private suspend fun open(document: CharacterDocument) {
        clearOptionListings()
        val result = withContext(Dispatchers.IO) { ContentCatalog.open(source, "modern4e.classes", document.packages) }
        if (result is ContractResult.Unavailable && result.diagnostics.any { it.kind == DiagnosticKind.IO_FAILURE }) {
            errors = result.diagnostics
            return
        }
        // Missing definitions remain visible as validation data rather than fabricated totals.
        catalog = (result as? ContractResult.Available)?.value
        operations = catalog?.let { BuilderOperations(it) }
        current = evaluate(document, (result as? ContractResult.Unavailable)?.diagnostics.orEmpty())
        committed = document
        pending = null
        page = "character"
        dialog = null
        description = null
        current?.let { warmOptionLists(it, 0) }
    }

    private suspend fun evaluate(document: CharacterDocument, diagnostics: List<Diagnostic> = emptyList()): BuilderState =
        withContext(Dispatchers.IO) {
            operations?.evaluate(document) ?: BuilderState(document, RulesEngine.evaluate(document,
                RulesContent(emptyMap(), emptyMap(), diagnostics.ifEmpty {
                    listOf(Diagnostic("android.content", DiagnosticKind.UNRESOLVED_CONTENT, "Required content is unavailable"))
                })))
        }

    /** Commit is visible only after durable storage. A failed candidate cannot be published by the error flow. */
    suspend fun edit(edit: BuilderEdit) {
        val document = current!!.document
        val result = withContext(Dispatchers.IO) {
            heavyWork.withLock {
                operations?.apply(document, edit) ?: if (edit is BuilderEdit.Identity) {
                    BuilderResult(evaluate(document.copy(identity = edit.value)), true)
                } else {
                    BuilderResult(current!!, false, listOf(Diagnostic("android.content", DiagnosticKind.UNRESOLVED_CONTENT,
                        "This edit needs unavailable content.")))
                }
            }
        }
        if (!result.applied) {
            errors = result.diagnostics
            return
        }
        commitPending(result.state)
    }

    /** Persist the calculated state; savedAt is storage metadata and cannot change its rules. */
    private suspend fun commitPending(evaluated: BuilderState) {
        val document = evaluated.document.copy(savedAt = Instant.now().toString())
        pending = document
        if (persist(document, committed)) {
            warming?.cancel()
            warming = null
            current = evaluated.copy(document = document)
            committed = document
            pending = null
            dialog = null
            warmOptionLists(current!!, warmupSettleMillis)
            refresh()
        }
    }

    private suspend fun persist(document: CharacterDocument, expected: CharacterDocument?): Boolean {
        return when (val result = withContext(Dispatchers.IO) {
            store.save(document, if (expected == null) SaveMode.CREATE else SaveMode.REPLACE_WITH_RECOVERY, expected)
        }) {
            is ContractResult.Available -> true
            is ContractResult.Unavailable -> {
                errors = result.diagnostics
                false
            }
        }
    }

    suspend fun inspect(json: String) {
        when (val result = withContext(Dispatchers.IO) { importer.inspect(json) }) {
            is ContractResult.Available -> preview = result.value
            is ContractResult.Unavailable -> errors = result.diagnostics
        }
    }

    suspend fun import(action: ImportAction) {
        val candidate = preview ?: return
        when (val result = withContext(Dispatchers.IO) { importer.commit(candidate, action) }) {
            is ContractResult.Unavailable -> errors = result.diagnostics
            is ContractResult.Available -> {
                preview = null
                if (result.value.receipt != null) {
                    recoveries = null
                    page = "library"
                    refresh()
                }
            }
        }
    }

    suspend fun showRecoveries(id: String) {
        when (val result = withContext(Dispatchers.IO) { importer.recoveries(id) }) {
            is ContractResult.Available -> recoveries = result.value
            is ContractResult.Unavailable -> errors = result.diagnostics
        }
    }

    suspend fun recover(id: String) {
        when (val result = withContext(Dispatchers.IO) { importer.inspectRecovery(id) }) {
            is ContractResult.Available -> preview = result.value
            is ContractResult.Unavailable -> errors = result.diagnostics
        }
    }

    suspend fun details(selection: SavedSelection) {
        val result = withContext(Dispatchers.IO) { catalog?.resolve(selection) }
        if (result is ContractResult.Available) {
            description = result.value
        } else {
            errors = (result as? ContractResult.Unavailable)?.diagnostics.orEmpty()
        }
    }

    suspend fun reference(id: String) {
        val result = withContext(Dispatchers.IO) { catalog?.lookup(id) }
        if (result is ContractResult.Available && result.value != null) {
            description = result.value
        } else {
            errors = listOf(Diagnostic("android.reference", DiagnosticKind.UNRESOLVED_CONTENT, "Reference $id is unavailable"))
        }
    }

    /**
     * The entries an ancestry grants (its features and powers), in authored order, read on demand so
     * the picker stays index-only until a card is expanded.
     *
     * @param entry the ancestry whose granted entries are wanted.
     * @return the granted definitions that could be read; empty for entries that grant nothing.
     */
    suspend fun grantedEntries(entry: ContentEntry): List<ContentEntry> {
        val catalog = catalog ?: return emptyList()
        return withContext(Dispatchers.IO) {
            entry.mechanics.grants.filterIsInstance<Grant.Entry>().mapNotNull {
                (catalog.lookup(it.entryId) as? ContractResult.Available)?.value?.entry
            }
        }
    }

    /** Catalog options and draft calculations use the same shared coordinator as committed edits. */
    suspend fun progressionOptions(level: Int, slot: ChoiceSlotId): List<BuilderOption> =
        withContext(Dispatchers.IO) { heavyWork.withLock {
            if (level <= 2) {
                operations?.options(current!!.document, level, slot, true).orEmpty()
            } else {
                val category = if (slot.choiceId == "feat") EntryCategory.FEAT else EntryCategory.POWER
                catalog?.search(category = category, classIds = current?.document?.classEntryIds()).orEmpty().mapNotNull { metadata ->
                    val resolved = (catalog?.lookup(metadata.metadata.id) as? ContractResult.Available)?.value ?: return@mapNotNull null
                    BuilderOption(resolved, Eligibility.INCOMPLETE, listOf(Diagnostic("android.progression", DiagnosticKind.INCOMPLETE_AUTOMATION,
                        "Later-level eligibility is not evaluated by the proof engine.")))
                }
            }
        } }

    /**
     * Display metadata first, then check small batches on IO. The browsing snapshot survives sheet
     * cancellation/reopening, but never an edit, another character or a content-catalog reload.
     * Callbacks run on the caller's context; cancellation prevents a previous tab publishing late rows.
     */
    suspend fun progressionOptionRows(level: Int, slot: ChoiceSlotId, featGroup: FeatGroup? = null,
        onUpdate: suspend (List<BuilderOptionRow>) -> Unit) {
        val original = current?.document ?: return
        val originalCatalog = catalog
        if (level > 2) {
            // Higher-level editing retains its explicit incomplete-automation policy.
            val metadata = originalCatalog?.search(category = if (slot.choiceId == "feat") EntryCategory.FEAT else EntryCategory.POWER,
                classIds = original.classEntryIds())
                .orEmpty().filter { featGroup == null || it.metadata.featGroup == null || it.metadata.featGroup == featGroup }
            var rows = metadata.map { BuilderOptionRow(it) }
            onUpdate(rows)
            for (batch in metadata.chunked(12)) {
                currentCoroutineContext().ensureActive()
                if (current?.document != original || catalog !== originalCatalog) {
                    return
                }
                val checked = withContext(Dispatchers.IO) { heavyWork.withLock {
                    batch.associate { entry ->
                        val loaded = originalCatalog?.lookup(entry.metadata.id)
                        val resolved = (loaded as? ContractResult.Available)?.value
                        val diagnostics = (loaded as? ContractResult.Unavailable)?.diagnostics ?: listOf(Diagnostic(
                            "android.progression", DiagnosticKind.INCOMPLETE_AUTOMATION,
                            "Later-level eligibility is not evaluated by the proof engine."))
                        entry.metadata.id to BuilderOptionRow(entry, resolved?.let { BuilderOption(it, Eligibility.INCOMPLETE, diagnostics) }, true, diagnostics)
                    }
                } }
                if (current?.document != original || catalog !== originalCatalog) {
                    return
                }
                rows = rows.map { checked[it.metadata.metadata.id] ?: it }
                onUpdate(rows)
            }
            return
        }
        val failures = browseOptionRows(original, originalCatalog, level, slot, featGroup, onUpdate)
        if (failures.isNotEmpty()) {
            errors = failures
        }
    }

    /**
     * Fill the retained listing for a level 1-2 slot, publishing after each checked batch. The picker and
     * the background warm-up both run this, so a warmed list opens already checked. Returns content read
     * failures for the caller to handle; nothing here is published as a blocking error.
     */
    private suspend fun browseOptionRows(original: CharacterDocument, originalCatalog: ContentCatalog?, level: Int,
        slot: ChoiceSlotId, featGroup: FeatGroup?, onUpdate: suspend (List<BuilderOptionRow>) -> Unit): List<Diagnostic> {
        val listing = withContext(Dispatchers.IO) { heavyWork.withLock {
            synchronized(optionListings) {
                val key = level to slot
                val retained = optionListings[key]
                if (retained != null && stillValid(retained.document, original, level, slot)) {
                    retained.listing
                } else {
                    optionListings.remove(key)
                    operations?.optionListing(original, level, slot)?.also {
                        optionListings[key] = RetainedListing(it, original)
                        // Room for every level 1-2 list of a class at once; the checked rows are small beside the content itself.
                        if (optionListings.size > 32) {
                            optionListings.remove(optionListings.keys.first())
                        }
                    }
                }
            }
        } }
        if (listing == null) {
            onUpdate(emptyList())
            return emptyList()
        }
        var rows = withContext(Dispatchers.IO) { heavyWork.withLock { listing.rows(featGroup) } }
        if (current?.document != original || catalog !== originalCatalog) {
            return emptyList()
        }
        onUpdate(rows)
        // The lock is released between batches, so edits and previews queue ahead of the next batch.
        for (batch in rows.filterNot { it.checked }.chunked(12)) {
            currentCoroutineContext().ensureActive()
            if (current?.document != original || catalog !== originalCatalog) {
                return emptyList()
            }
            val checked = withContext(Dispatchers.IO) { heavyWork.withLock { listing.check(batch.map { it.metadata.metadata.id }) } }
            if (current?.document != original || catalog !== originalCatalog) {
                return emptyList()
            }
            val failures = checked.flatMap { it.diagnostics }.filter { it.kind == DiagnosticKind.IO_FAILURE }
            if (failures.isNotEmpty()) {
                return failures.distinct()
            }
            rows = withContext(Dispatchers.IO) { heavyWork.withLock { listing.rows(featGroup) } }
            onUpdate(rows)
        }
        return emptyList()
    }

    internal data class WarmTarget(val level: Int, val slot: ChoiceSlotId, val group: FeatGroup?)

    /** The Class and Ancestry pickers list the whole catalog and never depend on the rest of the character. */
    private fun isRootList(level: Int, slot: ChoiceSlotId) =
        level == 1 && slot.sourceInstanceId == "creation" && slot.choiceId in setOf("class", "ancestry")

    /**
     * Whether a list checked against [built] still answers for [current]. A level's choices depend only on
     * decisions at that level and earlier, so a later-level edit keeps earlier lists; edits that touch no
     * rules (name, notes, descriptive details) keep every list; the root pickers always stay.
     */
    private fun stillValid(built: CharacterDocument, current: CharacterDocument, level: Int, slot: ChoiceSlotId): Boolean =
        isRootList(level, slot) || firstChangedLevel(built, current) > level

    /** Lowest level whose rules inputs differ between two documents; 1 for non-level inputs, Int.MAX_VALUE if none. */
    private fun firstChangedLevel(old: CharacterDocument, new: CharacterDocument): Int {
        fun CharacterDocument.nonLevelInputs() = copy(savedAt = "", level = 1, levels = emptyList(),
            identity = CharacterIdentity("-", environment = identity.environment, upbringing = identity.upbringing))
        if (old.nonLevelInputs() != new.nonLevelInputs()) {
            return 1
        }
        val top = maxOf(old.level, new.level, old.levels.maxOfOrNull { it.level } ?: 0, new.levels.maxOfOrNull { it.level } ?: 0)
        for (level in 1..top) {
            if (old.levels.firstOrNull { it.level == level } != new.levels.firstOrNull { it.level == level }) {
                return level
            }
        }
        return if (old.level != new.level) minOf(old.level, new.level) + 1 else Int.MAX_VALUE
    }

    /**
     * Check every list the picker can open at levels 1-2, so each one opens already filled in. Order is the
     * likeliest next stop first: still-empty attack-power pools (each pick reshuffles the others through
     * distinct-choice rules), then the Class, Ancestry and General feat tabs, then filled pools and the
     * remaining class choices, then the Class, Ancestry and Theme pickers. Later levels keep their
     * incomplete-automation listing and are not warmed. A character with no class or ancestry simply has
     * rows without eligibility to show; a failed read leaves the rest to the picker.
     *
     * This runs after every committed edit, but lists that are still valid (see [stillValid]) are reused, so
     * only the lists the edit can actually have changed do any work. [settle] holds the first batch back until
     * edits stop arriving, so a burst of taps never queues behind background work.
     */
    private fun warmOptionLists(state: BuilderState, settle: Long) {
        if (operations == null) {
            return
        }
        val document = state.document
        val targets = warmTargets(state)
        val originalCatalog = catalog
        warming = background.launch {
            delay(settle)
            for (target in targets) {
                // A failed read is left for the picker to meet and report; its half-checked rows are discarded.
                if (browseOptionRows(document, originalCatalog, target.level, target.slot, target.group) { }.isNotEmpty()) {
                    dropOptionListings()
                    return@launch
                }
            }
        }
    }

    /**
     * Only lists this character can actually edit: choices come from the engine's active sources, so another
     * class's choices (an Avenger's Vindicator's Censure, say) are never offered to a Fighter and never warmed.
     */
    internal fun warmTargets(state: BuilderState): List<WarmTarget> {
        val document = state.document
        val filled = document.levels.flatMap { it.entries }.map { it.slot }.toSet()
        val offered = (1..minOf(document.level, 2)).flatMap { level ->
            Progression.levelChoices(state, level).filter { it.abilities.isEmpty() && it.entries.isNotEmpty() }.map { level to it }
        }
        val (attack, other) = offered.partition { (_, choice) -> Progression.isAttackPowerChoice(state, choice) }
        val (empty, taken) = attack.partition { (_, choice) -> choice.slot !in filled }
        val featSlots = listOf(1 to ChoiceSlotId("creation", "feat", 0)) +
            if (document.level >= 2) listOf(2 to ChoiceSlotId("advancement.2", "feat", 0)) else emptyList()
        val targets = empty.map { (level, choice) -> WarmTarget(level, choice.slot, null) } +
            listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL).flatMap { group ->
                featSlots.map { (level, slot) -> WarmTarget(level, slot, group) }
            } +
            (taken + other).map { (level, choice) -> WarmTarget(level, choice.slot, null) } +
            listOf("class", "ancestry", "theme").map { WarmTarget(1, ChoiceSlotId("creation", it, 0), null) }
        return targets
    }

    /** Test hook: returns once the warm-up started by the last committed edit has finished or been cancelled. */
    internal suspend fun awaitWarmup() {
        warming?.join()
    }

    /** Another character or the content catalog changed: stop warming and forget every list, root pickers included. */
    private fun clearOptionListings() {
        warming?.cancel()
        warming = null
        dropOptionListings()
    }

    private fun dropOptionListings() {
        synchronized(optionListings) {
            optionListings.clear()
        }
    }

    override fun onCleared() {
        background.cancel()
    }

    /**
     * Drafts are evaluated one at a time. Each evaluation resolves every candidate power, so overlapping ones
     * (a tap per option while the previous draft is still computing) exhaust the heap. A cancelled caller
     * leaves the queue without starting work.
     */
    suspend fun previewProgression(edit: BuilderEdit): BuilderState? = withContext(Dispatchers.IO) {
        heavyWork.withLock { operations?.apply(current!!.document, edit)?.takeIf { it.applied }?.state }
    }

    /** Store origin independently so changing it can leave its required skill genuinely empty. */
    fun backgroundEdit(kind: String, name: String): BuilderEdit {
        val document = current!!.document
        val old = document.levels.flatMap { it.proficiencies }.filter {
            it.slot.sourceInstanceId.startsWith("background.$kind.")
        }.map { it.slot }.toSet()
        val identity = if (kind == "environment") document.identity.copy(environment = name)
            else document.identity.copy(upbringing = name)
        return BuilderEdit.Batch(listOf(BuilderEdit.Identity(identity), BuilderEdit.RemoveProficiency(old)))
    }

    fun beginEdit(field: String) {
        dialog = field
        draft = when (field) {
            "Name" -> current!!.document.identity.name
            "Player" -> current!!.document.identity.player
            "Notes" -> current!!.document.identity.notes
            "Gender" -> current!!.document.identity.gender
            "Age" -> current!!.document.identity.age
            "Deity" -> current!!.document.identity.deity
            "Languages" -> current!!.document.identity.languages
            "Size" -> current!!.document.identity.size
            else -> ""
        }
    }

    /** Build the same identity edit for every native field without dropping other details. */
    suspend fun saveIdentityDraft() {
        val identity = current!!.document.identity
        val next = when (dialog) {
            "Name" -> identity.copy(name = draft.trim())
            "Player" -> identity.copy(player = draft)
            "Notes" -> identity.copy(notes = draft)
            "Gender" -> identity.copy(gender = draft)
            "Age" -> identity.copy(age = draft)
            "Deity" -> identity.copy(deity = draft)
            "Languages" -> identity.copy(languages = draft)
            "Size" -> identity.copy(size = draft)
            else -> return
        }
        edit(BuilderEdit.Identity(next))
    }

    fun cancelEdit() {
        dialog = null
        pending = null
        draft = ""
    }
}
