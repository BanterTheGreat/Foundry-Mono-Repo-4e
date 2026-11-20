package dev.modern4e.builder

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Activity-retained workflow state. Rules and atomic persistence stay behind their shared boundaries. */
class BuilderSession(
    private val store: CharacterStore,
    private val source: ContentSource,
    private val portraits: PortraitStore?,
    private val sample: () -> CharacterDocument,
) : ViewModel() {
    constructor(store: CharacterStore, source: ContentSource, sample: () -> CharacterDocument) : this(store, source, null, sample)

    var page by mutableStateOf("home")
    /** A non-blocking message about something that did not happen, such as an unusable portrait image. */
    var notice by mutableStateOf<String?>(null)
    /** Whether the Save-or-Share choice for exporting the open character is showing. */
    var exportChoice by mutableStateOf(false)
    /** Name being chosen for a copy of the open character; null when the copy dialog is closed. */
    var copyName by mutableStateOf<String?>(null)
    /** Why the last export did not happen; shown in a dismissible dialog. */
    var exportFailure by mutableStateOf<String?>(null)
    /** Confirmation of a verified export, shown briefly and then cleared by the screen. */
    var exportedMessage by mutableStateOf<String?>(null)
    /** True while an export writes and checks its file. */
    var exporting by mutableStateOf(false)
        private set
    /** Changes whenever a stored portrait is added, replaced or removed, so displays reload it. */
    var portraitRevision by mutableStateOf(0)
        private set
    var current by mutableStateOf<BuilderState?>(null)
    var characters by mutableStateOf(emptyList<CharacterSummary>())
    var recoveries by mutableStateOf<List<RecoverySummary>?>(null)
    var preview by mutableStateOf<ImportPreview?>(null)
    var confirmReturnToLibrary by mutableStateOf(false)
        private set
    var deleting by mutableStateOf<CharacterSummary?>(null)
    var errors by mutableStateOf(emptyList<Diagnostic>())
    var busy by mutableStateOf(false)
    /** True while submitted edits are still being applied and stored. Editing stays available; leaving and exporting do not. */
    var saving by mutableStateOf(false)
        private set
    var libraryNeedsRefresh by mutableStateOf(false)
        private set
    var pending by mutableStateOf<CharacterDocument?>(null)
    var description by mutableStateOf<ResolvedEntry?>(null)
    var dialog by mutableStateOf<String?>(null)
    /** Level the open level dialog would raise the character to; null when it is closed. */
    var levelTarget by mutableStateOf<Int?>(null)
    /** Checked class rows offered while the new-character menu is open; null when it is closed. */
    var classMenu by mutableStateOf<List<BuilderOptionRow>?>(null)
    var draft by mutableStateOf("")
    private var committed: CharacterDocument? = null
    private var operations: BuilderOperations? = null
    @Volatile private var catalog: ContentCatalog? = null
    private data class HomePickers(
        val packages: List<PackageRevision>,
        val catalog: ContentCatalog,
        val classes: List<BuilderOptionRow>,
        val ancestries: List<BuilderOptionRow>? = null,
    )
    @Volatile private var homePickers: HomePickers? = null
    private val homePickerWork = Mutex()
    private data class EquipmentCatalog(
        val packages: List<PackageRevision>,
        val catalog: ContentCatalog,
        val entries: List<ResolvedEntry>,
        val diagnostics: List<Diagnostic>,
    )
    private val equipmentWork = Mutex()
    private var equipmentCatalog: EquipmentCatalog? = null
    private val heavyWork = Mutex()
    /** Serializes every edit from its calculation to its durable commit, whether queued or run directly. */
    private val editLock = Mutex()
    private val background = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var warming: Job? = null
    /** How long a committed edit waits for further edits before background warming starts. */
    internal var warmupSettleMillis = 300L
    private class RetainedListing(val listing: BuilderOptionListing, val newInstanceId: String)
    /** Access-ordered, so the listings dropped first when the working set is full are the least recently used. */
    private val optionListings = LinkedHashMap<Pair<Int, ChoiceSlotId>, RetainedListing>(16, 0.75f, true)
    /** Pickers the user opened lately, oldest first, so their rows are rechecked ahead of speculative warming. Guarded by [optionListings]. */
    private val openedPickers = linkedSetOf<Pair<Int, ChoiceSlotId>>()
    /** Pickers currently filling their rows; background warming waits for this to reach zero between batches. */
    private val pickerDemand = MutableStateFlow(0)
    /** Shared read session for new listings, so a warm-up decodes each chunk and evaluates the character once. Guarded by [optionListings]. */
    private var browsingOperations: BuilderOperations? = null
    private val importer = CharacterImporter(store) { UUID.randomUUID().toString() }

    /** Call on Main; operations run on IO. Errors block further work until the session is reset. */
    suspend fun run(action: suspend BuilderSession.() -> Unit) {
        if (busy || errors.isNotEmpty()) {
            return
        }
        busy = true
        try {
            // Exclusive actions (opening, deleting, importing) start from the committed result of every submitted edit.
            awaitSaved()
            if (errors.isNotEmpty()) {
                return
            }
            action()
        } catch (error: Exception) {
            if (error is CancellationException) {
                throw error
            }
            errors = listOf(Diagnostic("android.workflow", DiagnosticKind.IO_FAILURE, error.message ?: "Operation failed"))
        } finally {
            busy = false
        }
    }

    /** What a submitted edit shows in its slot until it commits; a null title is a cleared slot. */
    class PendingSelection(val title: String?)

    private class QueuedEdit(val edit: BuilderEdit, val epoch: Int, val selections: Map<ChoiceSlotId, PendingSelection>,
        val field: Any?)

    private val queuedEdits = Channel<QueuedEdit>(Channel.UNLIMITED)
    private val unsaved = MutableStateFlow(0)
    private val pendingSelections = mutableStateMapOf<ChoiceSlotId, PendingSelection>()
    /** Submitted but uncommitted edits per screen field, counted so quick repeats on one field stay marked until the last lands. */
    private val savingFields = mutableStateMapOf<Any, Int>()
    /** Bumped when an edit fails or the workflow resets, so edits submitted before then are dropped instead of applied. */
    @Volatile private var editEpoch = 0

    init {
        // The queue outlives any sheet or screen: closing a picker never cancels a save in flight.
        background.launch {
            for (queued in queuedEdits) {
                try {
                    applyQueued(queued)
                } finally {
                    finishQueued(queued)
                }
            }
        }
    }

    /** Whether the open character is fully stored and nothing is working on it, so a file leaves with every choice made. */
    val canExport: Boolean get() = current != null && !busy && !saving && errors.isEmpty()

    /** Whether the open character is fully stored, so a copy carries every choice made. */
    val canCopy: Boolean get() = canExport

    /** Open the copy dialog, offering "{name} (copy)" as the new character's name. */
    fun beginCopy() {
        val name = current?.document?.identity?.name ?: return
        copyName = "$name (copy)"
    }

    fun cancelCopy() {
        copyName = null
    }

    /**
     * Store the open character under a fresh ID and the chosen name, then open the copy on the current tab. The copy
     * starts with no portrait and no recovery history, as with an imported copy. A blank name changes nothing.
     */
    suspend fun confirmCopy() {
        val name = copyName?.trim()?.takeIf { it.isNotEmpty() } ?: return
        val source = committed ?: return
        val document = source.copy(
            id = UUID.randomUUID().toString(), savedAt = Instant.now().toString(),
            identity = source.identity.copy(name = name))
        copyName = null
        if (persist(document, null)) {
            open(document, initialPage = page)
            refresh()
        }
    }

    /** The choice a submitted but uncommitted edit will make in [slot], for display ahead of the commit. */
    fun pendingSelection(slot: ChoiceSlotId): PendingSelection? = pendingSelections[slot]

    /** Whether an edit submitted for [field] has not yet committed or been dropped. Observable from composition. */
    fun isSaving(field: Any): Boolean = savingFields.containsKey(field)

    /**
     * Queue an edit and return at once. Edits are applied one at a time, each to the result of the one before, through the
     * same validated, durable path as [edit]. A failed edit reports its error like any other and drops the edits queued
     * behind it, since they were made for a result that never existed. Call on Main.
     *
     * @param edit the command to apply.
     * @param title the chosen entry's title, shown in its slot until the commit lands; a removal shows the slot cleared.
     * @param field the screen field the edit is for, reported by [isSaving] until the commit lands.
     */
    fun submitEdit(edit: BuilderEdit, title: String? = null, field: Any? = null) {
        if (errors.isNotEmpty()) {
            return
        }
        val shown = when (edit) {
            is BuilderEdit.Entry -> title?.let { mapOf(edit.slot to PendingSelection(it)) }.orEmpty()
            is BuilderEdit.RemoveEntry -> mapOf(edit.slot to PendingSelection(null))
            else -> emptyMap()
        }
        pendingSelections.putAll(shown)
        field?.let { changeSavingField(it, 1) }
        changeUnsaved(1)
        queuedEdits.trySend(QueuedEdit(edit, editEpoch, shown, field))
    }

    private fun changeSavingField(field: Any, delta: Int) {
        synchronized(savingFields) {
            val count = (savingFields[field] ?: 0) + delta
            if (count > 0) {
                savingFields[field] = count
            } else {
                savingFields.remove(field)
            }
        }
    }

    /** Returns once every submitted edit has committed or been dropped. */
    suspend fun awaitSaved() {
        unsaved.first { it == 0 }
    }

    private fun changeUnsaved(delta: Int) {
        synchronized(unsaved) {
            unsaved.update { it + delta }
            saving = unsaved.value > 0
        }
    }

    private suspend fun applyQueued(queued: QueuedEdit) {
        if (queued.epoch != editEpoch || errors.isNotEmpty()) {
            return
        }
        try {
            applyEdit(queued.edit, closesDialog = false)
        } catch (error: Exception) {
            if (error is CancellationException) {
                throw error
            }
            errors = listOf(Diagnostic("android.workflow", DiagnosticKind.IO_FAILURE, error.message ?: "Operation failed"))
        }
        if (errors.isNotEmpty()) {
            editEpoch++
        }
    }

    private fun finishQueued(queued: QueuedEdit) {
        queued.selections.forEach { (slot, selection) ->
            if (pendingSelections[slot] === selection) {
                pendingSelections.remove(slot)
            }
        }
        queued.field?.let { changeSavingField(it, -1) }
        changeUnsaved(-1)
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
        editEpoch++
        current = null
        committed = null
        pending = null
        operations = null
        catalog = null
        futurePreview = null
        clearOptionListings()
        dialog = null
        levelTarget = null
        classMenu = null
        draft = ""
        deleting = null
        confirmReturnToLibrary = false
        notice = null
        exportChoice = false
        copyName = null
        exportFailure = null
        exportedMessage = null
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

    /** Requests back navigation, with confirmation before leaving an open character. */
    internal fun navigateBack() {
        if (busy) {
            return
        }
        when (page) {
            in CharacterTabs -> confirmReturnToLibrary = true
            "library" -> page = "home"
            "import" -> page = "library"
        }
    }

    /** Close the navigation confirmation, leaving the current tab on cancellation. */
    internal fun resolveBackConfirmation(leave: Boolean) {
        if (confirmReturnToLibrary) {
            confirmReturnToLibrary = false
            if (leave) {
                page = "library"
            }
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
                withContext(Dispatchers.IO) { portraits?.delete(character.id) }
                portraitRevision++
                characters = characters.filterNot { it.id == character.id }
                if (current?.document?.id == character.id) {
                    current = null
                    committed = null
                    pending = null
                    operations = null
                    catalog = null
                    futurePreview = null
                    clearOptionListings()
                    description = null
                    dialog = null
                }
                page = "library"
                refresh()
            }
        }
    }

    /** The stored portrait of a character on this device, or null. Blocking file access: call from IO. */
    fun portrait(characterId: String): File? = portraits?.current(characterId)

    /**
     * Let the user choose an image for the open character's portrait. Cancelling changes nothing; an
     * unusable image leaves the existing portrait in place and sets [notice]. The portrait is
     * device-local and never touches the character document, its saved JSON or its recovery copies.
     */
    suspend fun choosePortrait(chooser: PortraitChooser) {
        val store = portraits ?: return
        val id = current?.document?.id ?: return
        val stream = try {
            chooser.choose()
        } catch (error: Exception) {
            if (error is CancellationException) {
                throw error
            }
            notice = error.message ?: "That file could not be opened."
            return
        } ?: return
        when (val result = withContext(Dispatchers.IO) { store.save(id, stream) }) {
            is ContractResult.Available -> portraitRevision++
            is ContractResult.Unavailable -> notice = result.diagnostics.first().message
        }
    }

    /** Prepare the default root pickers independently of character selection. */
    internal suspend fun preloadHomePickers() {
        try {
            withContext(Dispatchers.IO) {
                val base = sample()
                if (loadHomeClasses(base) is ContractResult.Available) {
                    homePickerWork.withLock {
                        val prepared = homePickers?.takeIf { it.packages == base.packages } ?: return@withLock
                        if (prepared.ancestries == null) {
                            val rows = readRootRows(base, prepared.catalog, EntryCategory.ANCESTRY)
                            if (rootReadFailures(rows).isEmpty()) {
                                homePickers = prepared.copy(ancestries = rows)
                            }
                        }
                    }
                }
                loadEquipmentCatalog(base, base)
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            // Foreground pickers retry and surface load failures when requested.
        }
    }

    /** Prepare equipment definitions for the current package set, including the bundled package for older saves. */
    private suspend fun loadEquipmentCatalog(document: CharacterDocument, base: CharacterDocument): ContractResult<EquipmentCatalog> {
        val bundled = base.packages.firstOrNull { it.packageId == "modern4e.equipment" }
        val packages = if (bundled != null && document.packages.none { it.packageId == bundled.packageId }) {
            document.packages + bundled
        } else {
            document.packages
        }
        return equipmentWork.withLock {
            equipmentCatalog?.takeIf { it.packages == packages }?.let { return@withLock ContractResult.Available(it) }
            val active = catalog?.takeIf { current?.document?.packages == packages }
            val opened = active?.let { ContractResult.Available(it) } ?: ContentCatalog.open(source, "modern4e.classes", packages)
            when (opened) {
                is ContractResult.Unavailable -> opened
                is ContractResult.Available -> {
                    val diagnostics = mutableListOf<Diagnostic>()
                    val entries = opened.value.search(category = EntryCategory.ITEM).filterNot { row ->
                        CraftKnowledgeKind.entries.any { it.matches(row.metadata.id) }
                    }.mapNotNull { row ->
                        when (val loaded = opened.value.lookup(row.metadata.id)) {
                            is ContractResult.Unavailable -> {
                                diagnostics += loaded.diagnostics
                                null
                            }
                            is ContractResult.Available -> loaded.value?.takeIf { it.entry.equipmentProfile != null }
                        }
                    }
                    if (entries.isEmpty() && diagnostics.isEmpty()) {
                        diagnostics += Diagnostic("android.equipment.catalog", DiagnosticKind.UNRESOLVED_CONTENT,
                            "No equipment definitions are available.")
                    }
                    val prepared = EquipmentCatalog(packages, opened.value, entries, diagnostics)
                    if (diagnostics.isEmpty()) {
                        equipmentCatalog = prepared
                    }
                    ContractResult.Available(prepared)
                }
            }
        }
    }

    /** Read eligible equipment and the preserved selection for a single slot. */
    internal suspend fun equipmentOptions(slot: EquipmentSlot): EquipmentOptions {
        val state = current ?: return EquipmentOptions()
        return withContext(Dispatchers.IO) {
            val selected = state.document.equipment.savedEquipment(slot)
            try {
                when (val loaded = loadEquipmentCatalog(state.document, sample())) {
                    is ContractResult.Available -> equipmentOptions(state, slot, loaded.value)
                    is ContractResult.Unavailable -> EquipmentOptions(selected = selected, diagnostics = loaded.diagnostics)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                EquipmentOptions(selected = selected, diagnostics = listOf(Diagnostic("android.equipment.load",
                    DiagnosticKind.IO_FAILURE, error.message ?: "Cannot load equipment definitions.")))
            }
        }
    }

    private suspend fun equipmentOptions(state: BuilderState, slot: EquipmentSlot, prepared: EquipmentCatalog): EquipmentOptions {
        val equipment = state.document.equipment
        val definitions = equipment.map { it.selection }.distinct().mapNotNull { selection ->
            val resolved = prepared.catalog.resolve(selection) as? ContractResult.Available
            resolved?.value?.let { selection to it }
        }.toMap()
        val positions = equipmentSlots(equipment, definitions)
        val selected = positions[slot] ?: if (slot == EquipmentSlot.IMPLEMENT) equipment.savedEquipment(slot) else null
        val (eligible, ineligible) = prepared.entries
            .filter { it.entry.equipmentProfile?.equipmentString("kind") == slot.kind }
            .partition { it.entry.meetsEquipmentProficiencyRequirement(state.rules.equipmentProficiencies.keys) }
        val linkedWeapons = if (slot == EquipmentSlot.IMPLEMENT) {
            WeaponSlots.mapNotNull { weaponSlot ->
                val equipped = positions[weaponSlot]?.takeIf { it.equipped } ?: return@mapNotNull null
                val definition = definitions[equipped.selection] ?: return@mapNotNull null
                val eligibleWeapon = definition.entry.canUseWeaponAsImplement(state.rules)
                EquippedImplementWeapon(weaponSlot, equipped, definition, eligibleWeapon)
                    .takeIf { eligibleWeapon || equipped.isLinkedImplement }
            }
        } else {
            emptyList()
        }
        return EquipmentOptions(selected, selected?.let { definitions[it.selection] }, eligible, ineligible, prepared.diagnostics,
            linkedWeapons)
    }

    /** Save or remove one position through the same durable commit path as other choices. */
    internal suspend fun selectEquipment(slot: EquipmentSlot, entry: ResolvedEntry?, linkedWeaponId: String? = null) {
        val state = current ?: return
        if (entry == null) {
            val selected = equipmentOptions(slot).selected ?: return
            if (current === state) {
                val change = if (slot == EquipmentSlot.IMPLEMENT) {
                    BuilderEdit.Batch(buildList {
                        state.document.equipment.filter { it.isLinkedImplement }.forEach {
                            add(BuilderEdit.Equipment(it.withImplementLink(false)))
                        }
                        if (!selected.isLinkedImplement) {
                            add(BuilderEdit.RemoveEquipment(selected.instanceId))
                        }
                    })
                } else {
                    BuilderEdit.RemoveEquipment(selected.instanceId)
                }
                edit(change)
            }
            return
        }
        val result: ContractResult<Pair<BuilderState, ContentCatalog?>> = withContext(Dispatchers.IO) {
            val prepared = when (val loaded = loadEquipmentCatalog(state.document, sample())) {
                is ContractResult.Unavailable -> return@withContext loaded
                is ContractResult.Available -> loaded.value
            }
            val options = equipmentOptions(state, slot, prepared)
            val linked = options.linkedWeapons.firstOrNull { it.selection.instanceId == linkedWeaponId && it.eligible }
            val candidates = if (linkedWeaponId == null) options.eligible else listOfNotNull(linked?.definition)
            val eligible = candidates.firstOrNull {
                it.entry.id == entry.entry.id && it.supplier == entry.supplier && it.fingerprint == entry.fingerprint
            } ?: return@withContext ContractResult.Unavailable(listOf(
                Diagnostic("android.equipment.proficiency", DiagnosticKind.INVALID_SELECTION,
                    "This item is no longer available for this position or requires proficiency.")))
            val previous = options.selected?.takeUnless { slot == EquipmentSlot.IMPLEMENT && it.isLinkedImplement }
            val instanceId = if (state.document.levels.any { level -> level.entries.any { it.instanceId == slot.instanceId } }) {
                previous?.instanceId ?: UUID.randomUUID().toString()
            } else {
                slot.instanceId
            }
            // Remove the imported occurrence when assigning its position a stable Android identity.
            val edits = buildList {
                if (slot == EquipmentSlot.IMPLEMENT) {
                    state.document.equipment.filter { it.isLinkedImplement && it.instanceId != linkedWeaponId }.forEach {
                        add(BuilderEdit.Equipment(it.withImplementLink(false)))
                    }
                }
                if (previous != null && (linked != null || previous.instanceId != instanceId)) {
                    add(BuilderEdit.RemoveEquipment(previous.instanceId))
                }
                if (linked != null) {
                    add(BuilderEdit.Equipment(linked.selection.withImplementLink(true)))
                } else {
                    val selection = SavedSelection(eligible.entry.id, eligible.entry.presentation.title, eligible.supplier.packageId,
                        eligible.fingerprint)
                    add(BuilderEdit.Equipment(EquipmentSelection(instanceId, selection, equipped = true)))
                }
            }
            val document = state.document.copy(packages = prepared.packages)
            val updatedCatalog = prepared.catalog.takeIf { document.packages != state.document.packages }
            val applied = BuilderOperations(prepared.catalog).apply(document, BuilderEdit.Batch(edits))
            if (applied.applied) ContractResult.Available(applied.state to updatedCatalog)
            else ContractResult.Unavailable(applied.diagnostics)
        }
        when (result) {
            is ContractResult.Unavailable -> errors = result.diagnostics
            is ContractResult.Available -> {
                val (evaluated, updatedCatalog) = result.value
                editLock.withLock {
                    if (current === state) {
                        commitPending(evaluated, updatedCatalog = updatedCatalog)
                    }
                }
            }
        }
    }

    private suspend fun loadHomeClasses(base: CharacterDocument): ContractResult<HomePickers> {
        homePickers?.takeIf { it.packages == base.packages }?.let { return ContractResult.Available(it) }
        return homePickerWork.withLock {
            homePickers?.takeIf { it.packages == base.packages }?.let { return@withLock ContractResult.Available(it) }
            when (val result = ContentCatalog.open(source, "modern4e.classes", base.packages)) {
                is ContractResult.Unavailable -> result
                is ContractResult.Available -> {
                    val classes = readRootRows(base, result.value, EntryCategory.CLASS)
                    val failures = rootReadFailures(classes)
                    if (failures.isNotEmpty()) {
                        ContractResult.Unavailable(failures)
                    } else {
                        val prepared = HomePickers(base.packages, result.value, classes)
                        homePickers = prepared
                        ContractResult.Available(prepared)
                    }
                }
            }
        }
    }

    private suspend fun readRootRows(base: CharacterDocument, catalog: ContentCatalog, category: EntryCategory): List<BuilderOptionRow> {
        val listing = BuilderOperations(catalog).optionListing(base, 1, requireNotNull(AdvancementRules.rootSlot(1, category)))
        return listing.check(listing.rows().map { it.metadata.metadata.id })
    }

    private fun rootReadFailures(rows: List<BuilderOptionRow>): List<Diagnostic> =
        rows.flatMap { it.diagnostics }.filter { it.kind == DiagnosticKind.IO_FAILURE }.distinct()

    /** Open the new-character class menu. Nothing is created or stored until a class is confirmed. */
    suspend fun beginCreate() {
        when (val result = withContext(Dispatchers.IO) { loadHomeClasses(sample()) }) {
            is ContractResult.Unavailable -> errors = result.diagnostics
            is ContractResult.Available -> {
                val available = result.value.classes.filter { it.option?.eligibility == Eligibility.ELIGIBLE }
                if (available.isEmpty()) {
                    errors = listOf(Diagnostic("android.create", DiagnosticKind.UNRESOLVED_CONTENT, "No classes are available."))
                } else {
                    classMenu = available
                }
            }
        }
    }

    fun cancelCreate() {
        classMenu = null
    }

    /**
     * Create a character and open its Levels tab. With a [classId] the character starts as that
     * class, with its first main ability at 4 and the remaining scores at 0. Without a class ID,
     * use the bundled sample.
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
            open(document, initialPage = "progression")
            refresh()
        }
    }

    /** Swap the sample's class for [classId]; a missing class is reported rather than silently replaced. */
    private suspend fun startingClass(base: CharacterDocument, classId: String): CharacterDocument? {
        val prepared = classMenu?.firstOrNull { it.metadata.metadata.id == classId }?.option?.entry
        val resolved = prepared ?: withContext(Dispatchers.IO) {
            (ContentCatalog.open(source, "modern4e.classes", base.packages) as? ContractResult.Available)
                ?.value?.lookup(classId) as? ContractResult.Available
        }?.value
        if (resolved == null || resolved.entry.category != EntryCategory.CLASS) {
            errors = listOf(Diagnostic("android.create", DiagnosticKind.UNRESOLVED_CONTENT, "Class $classId is unavailable."))
            return null
        }
        val profile = resolved.entry.mechanics.classProfile
        val main = profile?.mainAbilities?.first() ?: base.abilities.mainAbility
        val points = Ability.entries.associateWith { ability -> if (ability == main) 4 else 0 }
        val instanceId = classId.substringAfterLast('.')
        val slot = AdvancementRules.classSlot
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
            is ContractResult.Available -> open(result.value, initialPage = "progression")
            is ContractResult.Unavailable -> errors = result.diagnostics
        }
    }

    /**
     * Load the character and select [initialPage] after the session has been initialized.
     */
    private suspend fun open(savedDocument: CharacterDocument, initialPage: String) {
        val document = withBundledCraftKnowledge(withBundledPaths(savedDocument))
        futurePreview = null
        clearOptionListings()
        val result = withContext(Dispatchers.IO) { ContentCatalog.open(source, "modern4e.classes", document.packages) }
        if (result is ContractResult.Unavailable && result.diagnostics.any { it.kind == DiagnosticKind.IO_FAILURE }) {
            errors = result.diagnostics
            return
        }
        // Missing definitions remain visible as validation data rather than fabricated totals.
        catalog = (result as? ContractResult.Available)?.value
        operations = catalog?.let { BuilderOperations(it) }
        current = evaluate(document, (result as? ContractResult.Unavailable)?.diagnostics.orEmpty()).withEquipmentValidation()
        committed = savedDocument
        pending = null
        page = initialPage
        levelTarget = null
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

    /** Add the bundled catalogs to older characters while preserving custom package precedence. */
    private suspend fun withBundledCraftKnowledge(document: CharacterDocument): CharacterDocument {
        val missing = CraftKnowledgeKind.entries.map { it.packageId }.toSet() - document.packages.map { it.packageId }.toSet()
        if (missing.isEmpty()) {
            return document
        }
        val listed = withContext(Dispatchers.IO) { source.listPackages() } as? ContractResult.Available ?: return document
        val additions = listed.value.filter { it.id in missing }.map { PackageRevision(it.id, it.revision) }
        val afterCore = document.packages.indexOfFirst { it.packageId == "modern4e.classes" } + 1
        val packages = document.packages.toMutableList().apply { addAll(afterCore, additions) }
        return document.copy(packages = packages)
    }

    /** Read a whole knowledge catalog using one decode session. */
    internal suspend fun craftKnowledgeEntries(): List<ContentEntry> = withContext(Dispatchers.IO) {
        catalog?.craftKnowledgeEntries().orEmpty()
    }

    /** Add the newly bundled path catalog before overrides, keeping every saved supplier and revision intact. */
    private suspend fun withBundledPaths(document: CharacterDocument, targetLevel: Int = document.level): CharacterDocument {
        if (targetLevel < 11 || document.packages.any { it.packageId == "modern4e.paths" }) {
            return document
        }
        val listed = withContext(Dispatchers.IO) { source.listPackages() } as? ContractResult.Available ?: return document
        val paths = listed.value.firstOrNull { it.id == "modern4e.paths" } ?: return document
        val packages = document.packages.toMutableList()
        val standard = packages.indexOfFirst { it.packageId == "modern4e.classes" }
        packages.add(if (standard < 0) 0 else standard + 1, PackageRevision(paths.id, paths.revision))
        return document.copy(packages = packages)
    }

    /** Commit is visible only after durable storage. A failed candidate cannot be published by the error flow. */
    suspend fun edit(edit: BuilderEdit) {
        applyEdit(edit, closesDialog = true)
    }

    /**
     * Apply one edit to the latest committed document. The lock holds from calculation to commit, so queued and direct
     * edits never interleave and each starts from the previous one's stored result.
     *
     * @param closesDialog whether a successful commit closes the open editing dialog; queued edits leave it alone.
     */
    private suspend fun applyEdit(edit: BuilderEdit, closesDialog: Boolean) {
        editLock.withLock { applyLockedEdit(edit, closesDialog) }
    }

    private suspend fun applyLockedEdit(edit: BuilderEdit, closesDialog: Boolean) {
        val document = withBundledPaths(current!!.document, (edit as? BuilderEdit.Level)?.value ?: current!!.document.level)
        val expandedCatalog = if (document.packages != current!!.document.packages) {
            (withContext(Dispatchers.IO) { ContentCatalog.open(source, "modern4e.classes", document.packages) }
                as? ContractResult.Available)?.value
        } else null
        val editingOperations = expandedCatalog?.let { BuilderOperations(it) } ?: operations
        val result = withContext(Dispatchers.IO) {
            heavyWork.withLock {
                editingOperations?.apply(document, edit) ?: if (edit is BuilderEdit.Identity) {
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
        commitPending(result.state, expandedCatalog, closesDialog)
    }

    /**
     * Persist the calculated state; savedAt is storage metadata and cannot change its rules. Once the write starts it
     * finishes together with the in-memory commit, so a cancelled caller cannot leave memory and storage disagreeing.
     */
    private suspend fun commitPending(evaluated: BuilderState, updatedCatalog: ContentCatalog? = null,
        closesDialog: Boolean = true) {
        withContext(NonCancellable) { storeAndPublish(evaluated, updatedCatalog, closesDialog) }
    }

    private suspend fun storeAndPublish(evaluated: BuilderState, updatedCatalog: ContentCatalog?, closesDialog: Boolean) {
        val document = evaluated.document.copy(savedAt = Instant.now().toString())
        pending = document
        if (persist(document, committed)) {
            if (updatedCatalog != null) {
                catalog = updatedCatalog
                operations = BuilderOperations(updatedCatalog)
                clearOptionListings()
            }
            warming?.cancel()
            warming = null
            val updated = evaluated.copy(document = document).withEquipmentValidation()
            refreshOptionListings(updated)
            committed = document
            pending = null
            if (closesDialog) {
                dialog = null
            }
            val summary = document.summary()
            characters = characters.toMutableList().apply {
                val index = indexOfFirst { it.id == document.id }
                if (index >= 0) {
                    this[index] = summary
                } else {
                    add(summary)
                }
            }
            warmOptionLists(current!!, warmupSettleMillis)
        }
    }

    /** Serialize listing rebases with checks so cancelled warming cannot mutate the inherited rows. */
    private suspend fun refreshOptionListings(updated: BuilderState) = heavyWork.withLock {
        synchronized(optionListings) {
            val previous = current
            // Keep catalog reads across edits, but prepare rules against the new document.
            browsingOperations = browsingOperations?.nextBrowsingSession()
            val categories = catalog?.search()?.associate { it.metadata.id to it.metadata.category }.orEmpty()
            for ((key, retained) in optionListings.toMap()) {
                if (previous == null) {
                    optionListings.remove(key)
                } else if (!stillValid(previous, updated, key.first, key.second, retained)) {
                    val browsing = browsingOperations ?: operations?.browsingSession()?.also { browsingOperations = it }
                    val listing = browsing?.optionListing(updated.document, key.first, key.second, retained.newInstanceId,
                        if (key.second.choiceId == "feat") updated.featClasses() else null, updated.featAncestries())
                    if (listing == null) {
                        optionListings.remove(key)
                    } else {
                        val changes = cacheSelectionChanges(previous, updated, key.first)
                        val samePool = sameChoicePool(previous, updated, key.second)
                        fun BuilderState.occurrence() = document.levels.flatMap { it.entries }
                            .firstOrNull { it.slot == key.second }?.instanceId ?: retained.newInstanceId
                        val sameOccurrence = previous.occurrence() == updated.occurrence()
                        listing.inheritFrom(retained.listing) { candidate ->
                            samePool && sameOccurrence && changes != null &&
                                ChoiceCacheDependencies.canRetain(candidate, changes, categories)
                        }
                        optionListings[key] = RetainedListing(listing, retained.newInstanceId)
                    }
                }
            }
            current = updated
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

    /**
     * Writes the open character as portable JSON to [target] and reports success only once the stored bytes were read
     * back and shown to import as the same character. A file that fails the check is removed, and a failure never
     * blocks the session the way a storage error does. Run through [run] so the screen is blocked meanwhile.
     *
     * @param target where the file goes, either a user-chosen location or the share sheet.
     * @param exportedOn the date shown in the file name.
     */
    suspend fun export(target: ExportTarget, exportedOn: LocalDate = LocalDate.now()) {
        val document = current?.document ?: return
        exporting = true
        try {
            exportFailure = exportChecked(document, target, exportedOn)
        } finally {
            exporting = false
        }
    }

    /** Returns the failure to show, or null when the export finished (or the user cancelled before anything was written). */
    private suspend fun exportChecked(document: CharacterDocument, target: ExportTarget, exportedOn: LocalDate): String? {
        val bytes = when (val encoded = ContractCodec.encodeChecked(document)) {
            is ContractResult.Unavailable -> return encoded.diagnostics.first().message
            is ContractResult.Available -> encoded.value.toByteArray(Charsets.UTF_8)
        }
        // Check the document itself first, so a failure never reaches the destination at all.
        (withContext(Dispatchers.IO) { ExportVerifier.verify(bytes, document) } as? ContractResult.Unavailable)?.let {
            return it.diagnostics.first().message
        }
        val name = ExportFileName.of(document.level, document.identity.name, exportedOn)
        var file: ExportedFile? = null
        try {
            val written = withContext(Dispatchers.IO) { target.write(name, bytes) } ?: return null
            file = written
            val stored = withContext(Dispatchers.IO) { written.read() }
            (withContext(Dispatchers.IO) { ExportVerifier.verify(stored, document) } as? ContractResult.Unavailable)?.let {
                discardQuietly(written)
                return it.diagnostics.first().message
            }
            if (target.confirmsWithMessage) {
                exportedMessage = "Exported ${written.displayName}"
            } else {
                written.present()
            }
            return null
        } catch (error: Exception) {
            file?.let { discardQuietly(it) }
            if (error is CancellationException) {
                throw error
            }
            return error.message ?: "The file could not be exported."
        }
    }

    private suspend fun discardQuietly(file: ExportedFile) {
        withContext(NonCancellable + Dispatchers.IO) {
            try {
                file.discard()
            } catch (_: Exception) {
                // The failure being reported is the useful one; a file that cannot be removed is already unusable.
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

    /** Resolve manually saved power selections against the character's installed content. */
    internal suspend fun resolveSavedPowerEntries(selections: Set<SavedSelection>): Map<SavedSelection, ContentEntry> {
        val installed = operations ?: return emptyMap()
        return withContext(Dispatchers.IO) {
            installed.resolveSelections(selections)
        }
    }

    /** The last full-length preview and the character it was for, so Levels can show upcoming grants the moment it reopens. */
    @Volatile private var futurePreview: Pair<String, BuilderState>? = null

    /**
     * Evaluate a Levels preview without publishing or persisting a different character level. A preview at the top level
     * is remembered for [cachedFuturePreview]; one that is cancelled before it finishes is not.
     */
    internal suspend fun progressionPreview(state: BuilderState, level: Int): BuilderState {
        val preview = withContext(Dispatchers.IO) { heavyWork.withLock {
            operations?.evaluate(state.document.copy(level = level)) ?: state
        } }
        if (level == MAX_LEVEL) {
            futurePreview = state.document.id to preview
        }
        return preview
    }

    /**
     * The most recent full-length preview of the character, possibly one edit behind. It is a starting point only: the screen
     * shows it until a fresh preview replaces it, so leaving and returning to Levels never blanks the upcoming levels.
     */
    internal fun cachedFuturePreview(documentId: String): BuilderState? =
        futurePreview?.takeIf { it.first == documentId }?.second

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
            operations?.options(current!!.document, level, slot, true).orEmpty()
        } }

    /**
     * Display metadata first, then check small batches on IO. The browsing snapshot survives sheet
     * cancellation/reopening, but never an edit, another character or a content-catalog reload.
     * Callbacks run on the caller's context; cancellation prevents a previous tab publishing late rows.
     */
    suspend fun progressionOptionRows(level: Int, slot: ChoiceSlotId, featGroup: FeatGroup? = null,
        onUpdate: suspend (List<BuilderOptionRow>) -> Unit) {
        val state = current ?: return
        val original = state.document
        val originalCatalog = catalog
        synchronized(optionListings) {
            openedPickers.remove(level to slot)
            openedPickers.add(level to slot)
            if (openedPickers.size > OPENED_PICKER_LIMIT) {
                openedPickers.remove(openedPickers.first())
            }
        }
        // An open picker outranks background warming, which resumes from the same listing once this returns.
        pickerDemand.update { it + 1 }
        val failures = try {
            browseOptionRows(original, originalCatalog, level, slot, featGroup, onUpdate)
        } finally {
            pickerDemand.update { it - 1 }
        }
        if (failures.isNotEmpty()) {
            errors = failures
        }
    }

    /** Replacement candidates are checked against the selected acquisition at the replacement level. */
    suspend fun progressionReplacementRows(level: Int, target: ChoiceSlotId): List<BuilderOptionRow> =
        withContext(Dispatchers.IO) { heavyWork.withLock {
            val document = current?.document ?: return@withLock emptyList()
            val metadata = catalog?.search(category = EntryCategory.POWER).orEmpty().associateBy { it.metadata.id }
            operations?.replacementOptions(document, level, target).orEmpty().mapNotNull { option ->
                metadata[option.entry.entry.id]?.let { BuilderOptionRow(it, option, true, option.diagnostics) }
            }
        } }

    /** New selections save the same occurrence ID the picker used to check its candidates. */
    internal fun progressionEntryInstance(level: Int, slot: ChoiceSlotId): String =
        synchronized(optionListings) { optionListings[level to slot]?.newInstanceId } ?: UUID.randomUUID().toString()

    /**
     * Fill the retained listing for an active slot, publishing after each checked batch. The picker and
     * the background warm-up both run this, so a warmed list opens already checked. Returns content read
     * failures for the caller to handle; nothing here is published as a blocking error.
     */
    private suspend fun browseOptionRows(original: CharacterDocument, originalCatalog: ContentCatalog?, level: Int,
        slot: ChoiceSlotId, featGroup: FeatGroup?, onUpdate: suspend (List<BuilderOptionRow>) -> Unit): List<Diagnostic> {
        if (originalCatalog != null && current?.document == original && catalog === originalCatalog) {
            preloadedRootRows(original, level, slot)?.let {
                onUpdate(it)
                return emptyList()
            }
        }
        val listing = retainedListing(original, originalCatalog, level, slot)
        if (listing == null) {
            if (current?.document == original && catalog === originalCatalog) {
                onUpdate(emptyList())
            }
            return emptyList()
        }
        var rows = withContext(Dispatchers.IO) { heavyWork.withLock { listing.rows(featGroup) } }
        if (current?.document != original || catalog !== originalCatalog) {
            return emptyList()
        }
        onUpdate(rows)
        // The lock is released between batches, so edits and previews queue ahead of the next batch.
        for (batch in rows.filterNot { it.checked }.chunked(OPTION_BATCH_SIZE)) {
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

    /**
     * The retained listing for a slot, created from the current character when absent. Null when the character or catalog
     * changed since [original], when the slot has nothing to list, or when [create] is false and none is retained.
     * Creating one past [OPTION_LISTING_LIMIT] drops the least recently used; the checked rows are small beside the content itself.
     */
    private suspend fun retainedListing(original: CharacterDocument, originalCatalog: ContentCatalog?, level: Int,
        slot: ChoiceSlotId, create: Boolean = true): BuilderOptionListing? = withContext(Dispatchers.IO) { heavyWork.withLock {
        val state = current
        if (state?.document != original || catalog !== originalCatalog) {
            return@withLock null
        }
        val retained = synchronized(optionListings) { optionListings[level to slot]?.listing }
        if (retained != null || !create) {
            return@withLock retained
        }
        val browsing = browsingOperations ?: operations?.browsingSession()?.also { browsingOperations = it }
        val featState = if (slot.choiceId == "feat" && level > original.level) {
            browsing?.evaluate(original.copy(level = level)) ?: state
        } else {
            state
        }
        synchronized(optionListings) {
            if (current?.document != original || catalog !== originalCatalog) {
                return@synchronized null
            }
            val key = level to slot
            optionListings[key]?.listing ?: run {
                val newInstanceId = original.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
                    ?.instanceId ?: UUID.randomUUID().toString()
                val featClasses = if (slot.choiceId == "feat") featState.featClasses() else null
                browsing?.optionListing(original, level, slot, newInstanceId, featClasses, featState.featAncestries())?.also {
                    optionListings[key] = RetainedListing(it, newInstanceId)
                    while (optionListings.size > OPTION_LISTING_LIMIT) {
                        optionListings.remove(optionListings.keys.first())
                    }
                }
            }
        }
    } }

    /** Suspends until no picker is filling and no submitted edit is waiting to commit, so background work never delays either. */
    private suspend fun awaitForeground() {
        if (pickerDemand.value == 0 && unsaved.value == 0) {
            return
        }
        combine(pickerDemand, unsaved) { picking, unsavedEdits -> picking == 0 && unsavedEdits == 0 }.first { it }
    }

    /**
     * Finish only what a warm target still lacks: list its rows if the listing is new or rebased, then check just the rows
     * without a result, a few at a time. A complete listing costs one short lock hold. Between batches it yields to an open
     * picker or a pending edit, whose work then resumes from the same listing. Speculative targets (see [WarmTarget.idle])
     * continue an existing listing but never create one once the working set is full. Returns content read failures.
     */
    private suspend fun warmTarget(original: CharacterDocument, originalCatalog: ContentCatalog?, target: WarmTarget): List<Diagnostic> {
        fun stale() = current?.document != original || catalog !== originalCatalog
        if (stale() || preloadedRootRows(original, target.level, target.slot) != null) {
            return emptyList()
        }
        awaitForeground()
        val room = synchronized(optionListings) { optionListings.size < OPTION_LISTING_LIMIT }
        val listing = retainedListing(original, originalCatalog, target.level, target.slot, create = !target.idle || room) ?: return emptyList()
        val missing = withContext(Dispatchers.IO) { heavyWork.withLock {
            if (listing.isComplete(target.group)) emptyList() else listing.rows(target.group).filterNot { it.checked }
        } }
        for (batch in missing.chunked(WARM_BATCH_SIZE)) {
            currentCoroutineContext().ensureActive()
            awaitForeground()
            if (stale()) {
                return emptyList()
            }
            val checked = withContext(Dispatchers.IO) { heavyWork.withLock { listing.check(batch.map { it.metadata.metadata.id }) } }
            warmBatches.incrementAndGet()
            val failures = checked.flatMap { it.diagnostics }.filter { it.kind == DiagnosticKind.IO_FAILURE }
            if (failures.isNotEmpty()) {
                return failures.distinct()
            }
        }
        return emptyList()
    }

    private val warmBatches = java.util.concurrent.atomic.AtomicInteger()

    /** Test hook: eligibility batches background warming has checked so far. */
    internal val warmBatchCount: Int get() = warmBatches.get()

    /**
     * A listing the background warm-up may fill. [idle] marks speculative work (a choice already made and not lately
     * opened) that only runs once everything the user is likely to open next is done.
     */
    internal data class WarmTarget(val level: Int, val slot: ChoiceSlotId, val group: FeatGroup?, val idle: Boolean = false)

    /** Indexed power IDs for classifying entry slots without loading their picker options. */
    internal fun powerEntryIds(): Set<String> =
        catalog?.search(category = EntryCategory.POWER).orEmpty().mapTo(mutableSetOf()) { it.metadata.id }

    /** Catalog titles for readable prerequisites without loading candidate definitions. */
    internal fun requirementTitles(): Map<String, String> =
        catalog?.search().orEmpty()
            .associate { it.metadata.id to it.metadata.title }

    /** Identify class access leaves without guessing from entry IDs or loading definitions. */
    internal fun requirementClassIds(): Set<String> =
        catalog?.search(category = EntryCategory.CLASS).orEmpty().mapTo(mutableSetOf()) { it.metadata.id }

    /** Feat access can come from a class entry or a multiclass feat. Include qualification facts conservatively. */
    private fun BuilderState.featClasses(): Set<String> = buildSet {
        addAll(document.classEntryIds())
        for (occurrence in rules.entries) {
            val entry = occurrence.definition.entry
            if (entry.category == EntryCategory.CLASS) {
                add(entry.id)
            }
            if (entry.category == EntryCategory.FEAT) {
                entry.mechanics.multiclassFor?.let { add(it) }
            }
        }
        rules.facts.filter { it.kind == FactKind.ANCESTRY_QUALIFICATION }.forEach { add(it.value) }
    }

    /** Past Life can qualify a character for another ancestry's feats. */
    private fun BuilderState.featAncestries(): Set<String> = buildSet {
        addAll(document.ancestryEntryIds())
        rules.facts.filter { it.kind == FactKind.ANCESTRY_QUALIFICATION }.forEach { add(it.value) }
    }

    /** The Class and Ancestry pickers list the whole catalog and never depend on the rest of the character. */
    private fun isRootList(level: Int, slot: ChoiceSlotId) =
        AdvancementRules.rootCategory(level, slot).let { it == EntryCategory.CLASS || it == EntryCategory.ANCESTRY }

    private fun preloadedRootRows(document: CharacterDocument, level: Int, slot: ChoiceSlotId): List<BuilderOptionRow>? {
        if (!isRootList(level, slot)) {
            return null
        }
        val prepared = homePickers?.takeIf { it.packages == document.packages } ?: return null
        return if (slot.choiceId == "class") prepared.classes else prepared.ancestries
    }

    /**
     * The candidate check replaces its own slot before evaluating rules. Saving a candidate there can
     * reuse the listing when the same occurrence and candidate pool are still in use and other inputs
     * at or below the slot level are unchanged.
     */
    private fun stillValid(before: BuilderState, after: BuilderState, level: Int, slot: ChoiceSlotId,
        retained: RetainedListing): Boolean {
        if (slot.choiceId == "feat" &&
            (before.featClasses() != after.featClasses() || before.featAncestries() != after.featAncestries())) {
            return false
        }
        if (isRootList(level, slot) || firstChangedLevel(before.document, after.document) > level) {
            return true
        }
        val ignores = independentSelections(before, after, slot, retained.listing)
        if (firstChangedLevel(before.document, after.document, ignoreEntry = ignores) > level) {
            return sameChoicePool(before, after, slot)
        }
        val previous = before.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
        val selected = after.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
        if ((previous?.instanceId ?: retained.newInstanceId) != (selected?.instanceId ?: retained.newInstanceId) ||
            firstChangedLevel(before.document, after.document, level to slot, ignores) <= level) {
            return false
        }
        // Root Theme and Feat listings use the installed category, independent of the effective choice.
        val rootCategory = AdvancementRules.rootCategory(level, slot)
        val catalogRoot = (level == 1 && (rootCategory == EntryCategory.THEME || rootCategory == EntryCategory.FEAT)) ||
            (level == 2 && rootCategory == EntryCategory.FEAT)
        if (catalogRoot) {
            return true
        }
        return sameChoicePool(before, after, slot)
    }

    /**
     * Pool changes always discard results, even when the triggering edit belongs to another family. Only inline offers
     * carry a pool; a root offer's deferred listing comes from its fixed catalog category.
     */
    private fun sameChoicePool(before: BuilderState, after: BuilderState, slot: ChoiceSlotId): Boolean {
        fun EngineChoice.membership() = Triple(optional, acquisitionLevel, entries.map { it.entryId })
        fun BuilderState.pool() = rules.choices.singleOrNull { it.slot == slot && it.listing == SlotListing.INLINE }
        return before.pool()?.membership() == after.pool()?.membership()
    }

    /** Utility is one family; attack powers are separate families for each usage. */
    private fun powerFamily(kind: String?, usage: String?): String? = when (kind) {
        "UTILITY" -> "UTILITY"
        "ATTACK" -> usage?.let { "ATTACK:$it" }
        else -> null
    }

    /** Unknown or non-selection input changes require fresh eligibility, while definitions remain reusable. */
    private fun cacheSelectionChanges(before: BuilderState, after: BuilderState, level: Int): List<ContentEntry>? {
        if (firstChangedLevel(before.document, after.document, ignoreEntry = { true }) <= level ||
            cachePoolRules(before) != cachePoolRules(after)) {
            return null
        }
        fun CharacterDocument.selections() = levels.filter { it.level <= level }.flatMap {
            it.entries + it.replacements.map { replacement -> replacement.replacement }
        }.toSet()
        val old = before.document.selections()
        val new = after.document.selections()
        val changed = ((old - new) + (new - old)).map { it.selection.entryId }.toMutableSet()
        val replacements = (before.document.levels + after.document.levels).filter { it.level <= level }
            .flatMap { it.replacements }.map { it.replaces }.toSet()
        changed += (old + new).filter { it.slot in replacements }.map { it.selection.entryId }
        val definitions = (before.rules.entries + after.rules.entries).associate { it.definition.entry.id to it.definition.entry }
        return changed.map { definitions[it] ?: return null }
    }

    /** Active pool overrides and granted powers can change eligibility without changing offered entry IDs. */
    private fun cachePoolRules(state: BuilderState) = state.rules.entries.filter {
        val mechanics = it.definition.entry.mechanics
        mechanics.selectionModifiers.isNotEmpty() || mechanics.collections.isNotEmpty() ||
            it.definition.entry.category == EntryCategory.CLASS ||
            it.granted && it.definition.entry.category == EntryCategory.POWER
    }.map { Triple(it.instanceId, it.slot, it.definition.entry) }

    /**
     * Ignore only selections proven independent of this completed listing. Unknown definitions and
     * mechanics that grant facts or change power pools retain the conservative level-based rule.
     */
    private fun independentSelections(before: BuilderState, after: BuilderState, slot: ChoiceSlotId,
        listing: BuilderOptionListing): (EntryChoice) -> Boolean {
        fun CharacterDocument.selections() = levels.flatMap { it.entries + it.replacements.map { change -> change.replacement } }.toSet()
        val old = before.document.selections()
        val new = after.document.selections()
        val changedIds = ((old - new) + (new - old)).mapTo(mutableSetOf()) { it.selection.entryId }
        val oldReplacements = before.document.levels.flatMap { it.replacements }.toSet()
        val newReplacements = after.document.levels.flatMap { it.replacements }.toSet()
        val replacedSlots = ((oldReplacements - newReplacements) + (newReplacements - oldReplacements)).map { it.replaces }.toSet()
        changedIds += (old + new).filter { it.slot in replacedSlots }.map { it.selection.entryId }
        if (changedIds.isEmpty()) {
            return { false }
        }
        val choice = before.rules.choices.singleOrNull { it.slot == slot }
        val query = choice?.let { Progression.powerQuery(before, it) }
        val family = query?.let { powerFamily(it.powerKind, it.usage) }
        val samePowerRules = family != null && cachePoolRules(before) == cachePoolRules(after)
        val definitions = (before.rules.entries + after.rules.entries).map { it.definition.entry }
            .filter { it.id in changedIds }.associateBy { it.id }
        val ignored = definitions.values.filter { entry ->
            val mechanics = entry.mechanics
            when (entry.category) {
                EntryCategory.POWER -> {
                    val profile = mechanics.powerProfile
                    val passive = mechanics.version == 2 && profile != null &&
                        mechanics.copy(prerequisites = emptyList(), access = null, maximumSelections = null,
                            unsupported = emptyList(), powerProfile = null) == Mechanics(version = 2)
                    passive && (family == null || family != powerFamily(profile?.powerKind, profile?.usage)) &&
                        listing.canIgnorePowerChange(entry)
                }
                EntryCategory.FEAT -> samePowerRules && mechanics.version == 2 &&
                    listing.canIgnoreFeatChange(entry)
                else -> false
            }
        }.mapTo(mutableSetOf()) { it.id }
        return { it.selection.entryId in ignored }
    }

    /** Lowest level whose rules inputs differ between two documents; 1 for non-level inputs, Int.MAX_VALUE if none. */
    private fun firstChangedLevel(old: CharacterDocument, new: CharacterDocument, ignored: Pair<Int, ChoiceSlotId>? = null,
        ignoreEntry: (EntryChoice) -> Boolean = { false }): Int {
        fun CharacterDocument.nonLevelInputs() = copy(savedAt = "", level = 1, levels = emptyList(),
            identity = CharacterIdentity("-", environment = identity.environment, upbringing = identity.upbringing))
        if (old.nonLevelInputs() != new.nonLevelInputs()) {
            return 1
        }
        val top = maxOf(old.level, new.level, old.levels.maxOfOrNull { it.level } ?: 0, new.levels.maxOfOrNull { it.level } ?: 0)
        val replacementInputs = (old.levels + new.levels).flatMap { decisions ->
            decisions.entries + decisions.replacements.map { it.replacement }
        }.groupBy { it.slot }
        fun CharacterDocument.decisions(level: Int): LevelDecisions? {
            val decisions = levels.firstOrNull { it.level == level }
            return decisions?.copy(entries = decisions.entries.filterNot {
                ignored?.first == level && it.slot == ignored.second || ignoreEntry(it)
            }, replacements = decisions.replacements.filterNot { replacement ->
                // A replacement also removes its predecessor; both sides must be independent.
                val displaced = replacementInputs[replacement.replaces].orEmpty()
                displaced.isNotEmpty() && displaced.all(ignoreEntry) && ignoreEntry(replacement.replacement)
            })
        }
        for (level in 1..top) {
            if (old.decisions(level) != new.decisions(level)) {
                return level
            }
        }
        return if (old.level != new.level) minOf(old.level, new.level) + 1 else Int.MAX_VALUE
    }

    /**
     * Finish the most useful missing work, so the lists the user is likely to open next open already filled in. The queue
     * is rebuilt from the character after every edit (see [warmTargets]), and each target only does what its retained
     * listing still lacks (see [warmTarget]), so completed lists are skipped, a rebased list rechecks only its affected
     * rows, and slots the character no longer offers are simply absent. The Class and Ancestry rows are normally ready
     * from Home. A character with no class or ancestry simply has rows without eligibility to show; a failed read leaves
     * the rest to the picker.
     *
     * Lists that are still valid (see [stillValid]) are reused across edits. [settle] holds the first batch back until
     * edits stop arriving, so a burst of taps never queues behind background work, and every later batch yields to an
     * open picker or a pending edit.
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
                if (warmTarget(document, originalCatalog, target).isNotEmpty()) {
                    dropOptionListings()
                    return@launch
                }
            }
        }
    }

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
    internal fun warmTargets(state: BuilderState): List<WarmTarget> {
        val document = state.document
        val filled = document.levels.filter { it.level <= document.level }.flatMap { it.entries }.map { it.slot }.toSet()
        val offered = (1..minOf(document.level, 19)).flatMap { level ->
            Progression.levelChoices(state, level).filter { it.abilities.isEmpty() && it.entries.isNotEmpty() }.map { level to it }
        }
        val ancestryPowerSlots = Progression.ancestryPowerChoices(state, powerEntryIds()).mapTo(mutableSetOf()) { it.slot }
        val rootOffers = state.rules.choices.filter { it.listing == SlotListing.DEFERRED }
        fun SlotCategory?.isEntry(category: EntryCategory) = this == SlotCategory.Entry(category)
        val featSlots = rootOffers.filter { it.category.isEntry(EntryCategory.FEAT) }.map { requireNotNull(it.acquisitionLevel) to it.slot }
        val roots = listOf(EntryCategory.CLASS, EntryCategory.ANCESTRY, EntryCategory.THEME).mapNotNull { category ->
            rootOffers.firstOrNull { it.category.isEntry(category) }?.slot
        }.filter { preloadedRootRows(document, 1, it) == null }
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
        val opened = synchronized(optionListings) { openedPickers.toList() }
        val (reopened, rest) = made.partition { (_, target) -> target.level to target.slot in opened }
        return unmade.sortedWith(compareBy({ it.second.level }, { it.first })).map { it.second } +
            reopened.sortedByDescending { (_, target) -> opened.indexOf(target.level to target.slot) }.map { it.second } +
            rest.sortedWith(compareBy({ if (it.first == 3) 1 else 0 }, { it.second.level }, { it.first }))
                .map { it.second.copy(idle = true) }
    }

    /** Test hook: returns once the warm-up started by the last committed edit has finished or been cancelled. */
    internal suspend fun awaitWarmup() {
        warming?.join()
    }

    /** Test hook: how many option listings are retained right now. */
    internal fun retainedListingCount(): Int = synchronized(optionListings) { optionListings.size }

    /** Another character or the content catalog changed: stop warming and forget every list, root pickers included. */
    private fun clearOptionListings() {
        warming?.cancel()
        warming = null
        dropOptionListings()
        synchronized(optionListings) { openedPickers.clear() }
    }

    private fun dropOptionListings() {
        synchronized(optionListings) {
            optionListings.clear()
            browsingOperations = null
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

    /** Opens an editor for an editable identity field. */
    fun beginEdit(field: String) {
        val identity = current?.document?.identity ?: return
        draft = when (field) {
            "Name" -> identity.name
            "Player" -> identity.player
            "Notes" -> identity.notes
            "Gender" -> identity.gender
            "Age" -> identity.age
            "Deity" -> identity.deity
            else -> return
        }
        dialog = field
    }

    /** Build the same identity edit for every native field without dropping other details. */
    suspend fun saveIdentityDraft() {
        val identity = current!!.document.identity
        val value = draft.trimEnd()
        val next = when (dialog) {
            "Name" -> identity.copy(name = value.trimStart())
            "Player" -> identity.copy(player = value)
            "Notes" -> identity.copy(notes = value)
            "Gender" -> identity.copy(gender = value)
            "Age" -> identity.copy(age = value)
            "Deity" -> identity.copy(deity = value)
            else -> return
        }
        edit(BuilderEdit.Identity(next))
    }

    fun cancelEdit() {
        dialog = null
        pending = null
        draft = ""
    }

    /**
     * Open the level dialog on [target], or on the next level (the current level at the cap) when none is given.
     *
     * @param target the level to offer, kept within the supported range.
     */
    fun beginLevelChange(target: Int? = null) {
        val level = current?.document?.level ?: return
        levelTarget = (target ?: (level + 1)).coerceIn(1, MAX_LEVEL)
    }

    /** Move the pending level within the supported range. */
    fun adjustLevelTarget(target: Int) {
        if (levelTarget != null) {
            levelTarget = target.coerceIn(1, MAX_LEVEL)
        }
    }

    fun cancelLevelChange() {
        levelTarget = null
    }

    /** Apply a confirmed level change through the normal edit and recovery pipeline. */
    suspend fun confirmLevelChange() {
        val target = levelTarget ?: return
        levelTarget = null
        val currentLevel = current?.document?.level ?: return
        if (target != currentLevel) {
            edit(BuilderEdit.Level(target))
        }
    }

    companion object {
        /** Highest supported character level. */
        const val MAX_LEVEL = 30

        /** Options checked per batch while a picker fills; the lock is released and cancellation observed between batches. */
        internal const val OPTION_BATCH_SIZE = 32

        /** Options checked per batch by background warming; small, so a picker or edit never waits long behind it. */
        internal const val WARM_BATCH_SIZE = 8

        /** Retained listings kept at once. The least recently used go first, and speculative warming never evicts for a new one. */
        internal const val OPTION_LISTING_LIMIT = 32

        /** Opened pickers remembered for warming order. */
        private const val OPENED_PICKER_LIMIT = 8
    }
}
