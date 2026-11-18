package dev.modern4e.builder

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.Dispatchers
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
    var draft by mutableStateOf("")
    private var committed: CharacterDocument? = null
    private var operations: BuilderOperations? = null
    private var catalog: ContentCatalog? = null
    private val heavyWork = Mutex()
    private var optionDocument: CharacterDocument? = null
    private val optionListings = linkedMapOf<Pair<Int, ChoiceSlotId>, BuilderOptionListing>()
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

    suspend fun create() {
        val document = withContext(Dispatchers.IO) { sample() }.copy(
            id = UUID.randomUUID().toString(), savedAt = Instant.now().toString(),
            identity = CharacterIdentity("New character"))
        if (persist(document, null)) {
            open(document)
            refresh()
        }
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
            clearOptionListings()
            current = evaluated.copy(document = document)
            committed = document
            pending = null
            dialog = null
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

    /** Catalog options and draft calculations use the same shared coordinator as committed edits. */
    suspend fun progressionOptions(level: Int, slot: ChoiceSlotId): List<BuilderOption> =
        withContext(Dispatchers.IO) { heavyWork.withLock {
            if (level <= 2) {
                operations?.options(current!!.document, level, slot, true).orEmpty()
            } else {
                val category = if (slot.choiceId == "feat") EntryCategory.FEAT else EntryCategory.POWER
                catalog?.search(category = category).orEmpty().mapNotNull { metadata ->
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
            val metadata = originalCatalog?.search(category = if (slot.choiceId == "feat") EntryCategory.FEAT else EntryCategory.POWER)
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
        val listing = withContext(Dispatchers.IO) { heavyWork.withLock {
            synchronized(optionListings) {
                if (optionDocument != original) {
                    clearOptionListings()
                    optionDocument = original
                }
                val key = level to slot
                optionListings[key] ?: operations?.optionListing(original, level, slot)?.also {
                    optionListings[key] = it
                    if (optionListings.size > 2) {
                        optionListings.remove(optionListings.keys.first())
                    }
                }
            }
        } }
        if (listing == null) {
            onUpdate(emptyList())
            return
        }
        var rows = withContext(Dispatchers.IO) { heavyWork.withLock { listing.rows(featGroup) } }
        if (current?.document != original || catalog !== originalCatalog) {
            return
        }
        onUpdate(rows)
        for (batch in rows.filterNot { it.checked }.chunked(12)) {
            currentCoroutineContext().ensureActive()
            if (current?.document != original || catalog !== originalCatalog) {
                return
            }
            val checked = withContext(Dispatchers.IO) { heavyWork.withLock { listing.check(batch.map { it.metadata.metadata.id }) } }
            if (current?.document != original || catalog !== originalCatalog) {
                return
            }
            val failures = checked.flatMap { it.diagnostics }.filter { it.kind == DiagnosticKind.IO_FAILURE }
            if (failures.isNotEmpty()) {
                errors = failures.distinct()
                return
            }
            rows = withContext(Dispatchers.IO) { heavyWork.withLock { listing.rows(featGroup) } }
            onUpdate(rows)
        }
    }

    private fun clearOptionListings() {
        synchronized(optionListings) {
            optionDocument = null
            optionListings.clear()
        }
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
