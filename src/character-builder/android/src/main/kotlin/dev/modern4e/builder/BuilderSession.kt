package dev.modern4e.builder

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.CancellationException
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
import java.io.File
import java.time.Instant
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
    /** Changes whenever a stored portrait is added, replaced or removed, so displays reload it. */
    var portraitRevision by mutableStateOf(0)
        private set
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
    private val background = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var warming: Job? = null
    /** How long a committed edit waits for further edits before background warming starts. */
    internal var warmupSettleMillis = 300L
    private class RetainedListing(val listing: BuilderOptionListing, val newInstanceId: String)
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
            if (error is CancellationException) {
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
        levelTarget = null
        classMenu = null
        draft = ""
        deleting = null
        notice = null
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
                withContext(Dispatchers.IO) { portraits?.delete(character.id) }
                portraitRevision++
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
                            val rows = readRootRows(base, prepared.catalog, "ancestry")
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
                    val entries = opened.value.search(category = EntryCategory.ITEM).mapNotNull { row ->
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
            val selected = state.document.equipment.firstOrNull { it.instanceId == slot.instanceId }
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
        val selected = equipmentSlots(equipment, definitions)[slot]
        val (eligible, ineligible) = prepared.entries
            .filter { it.entry.equipmentProfile?.equipmentString("kind") == slot.kind }
            .partition { it.entry.meetsEquipmentProficiencyRequirement(state.rules.equipmentProficiencies.keys) }
        return EquipmentOptions(selected, selected?.let { definitions[it.selection] }, eligible, ineligible, prepared.diagnostics)
    }

    /** Save or remove one position through the same durable commit path as other choices. */
    internal suspend fun selectEquipment(slot: EquipmentSlot, entry: ResolvedEntry?) {
        val state = current ?: return
        if (entry == null) {
            val selected = equipmentOptions(slot).selected ?: return
            if (current === state) {
                edit(BuilderEdit.RemoveEquipment(selected.instanceId))
            }
            return
        }
        val result: ContractResult<Pair<BuilderState, ContentCatalog?>> = withContext(Dispatchers.IO) {
            val prepared = when (val loaded = loadEquipmentCatalog(state.document, sample())) {
                is ContractResult.Unavailable -> return@withContext loaded
                is ContractResult.Available -> loaded.value
            }
            val options = equipmentOptions(state, slot, prepared)
            val eligible = options.eligible.firstOrNull {
                it.entry.id == entry.entry.id && it.supplier == entry.supplier && it.fingerprint == entry.fingerprint
            } ?: return@withContext ContractResult.Unavailable(listOf(
                Diagnostic("android.equipment.proficiency", DiagnosticKind.INVALID_SELECTION,
                    "This item is no longer available for this position or requires proficiency.")))
            val instanceId = if (state.document.levels.any { level -> level.entries.any { it.instanceId == slot.instanceId } }) {
                options.selected?.instanceId ?: UUID.randomUUID().toString()
            } else {
                slot.instanceId
            }
            // Remove the imported occurrence when assigning its position a stable Android identity.
            val edits = buildList {
                options.selected?.takeIf { it.instanceId != instanceId }?.let { add(BuilderEdit.RemoveEquipment(it.instanceId)) }
                val selection = SavedSelection(eligible.entry.id, eligible.entry.presentation.title, eligible.supplier.packageId,
                    eligible.fingerprint)
                add(BuilderEdit.Equipment(EquipmentSelection(instanceId, selection, equipped = true)))
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
                if (current !== state) {
                    return
                }
                commitPending(evaluated, updatedCatalog = updatedCatalog)
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
                    val classes = readRootRows(base, result.value, "class")
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

    private suspend fun readRootRows(base: CharacterDocument, catalog: ContentCatalog, choiceId: String): List<BuilderOptionRow> {
        val listing = BuilderOperations(catalog).optionListing(base, 1, ChoiceSlotId("creation", choiceId, 0))
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
            is ContractResult.Available -> open(result.value, initialPage = "character")
            is ContractResult.Unavailable -> errors = result.diagnostics
        }
    }

    /**
     * Load the character and select [initialPage] after the session has been initialized.
     */
    private suspend fun open(document: CharacterDocument, initialPage: String) {
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
        committed = document
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
    private suspend fun commitPending(evaluated: BuilderState, updatedCatalog: ContentCatalog? = null) {
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
            synchronized(optionListings) {
                val previous = current
                optionListings.entries.removeAll { (key, retained) ->
                    previous == null || !stillValid(previous, updated, key.first, key.second, retained.newInstanceId)
                }
                current = updated
            }
            committed = document
            pending = null
            dialog = null
            val summary = CharacterSummary(document.id, document.identity.name, document.savedAt, document.level)
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

    /** Resolve manually saved power selections against the character's installed content. */
    internal suspend fun resolveSavedPowerEntries(selections: Set<SavedSelection>): Map<SavedSelection, ContentEntry> {
        val installed = operations ?: return emptyMap()
        return withContext(Dispatchers.IO) {
            installed.resolveSelections(selections)
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
        val state = current ?: return
        val original = state.document
        val originalCatalog = catalog
        if (level > 2) {
            // Higher-level editing retains its explicit incomplete-automation policy.
            val metadata = originalCatalog?.search(category = if (slot.choiceId == "feat") EntryCategory.FEAT else EntryCategory.POWER,
                classIds = original.classEntryIds())
                .orEmpty().filter { featGroup == null || it.metadata.featGroup == null || it.metadata.featGroup == featGroup }
                .let { entries ->
                    val ancestries = state.featAncestries()
                    val matching = entries.filter { it.metadata.matchesFeatAncestries(ancestries) }
                    if (featGroup == FeatGroup.CLASS) {
                        val classes = state.featClasses()
                        matching.filter { it.metadata.matchesFeatClasses(classes) }
                    } else {
                        matching
                    }
                }
            var rows = metadata.map { BuilderOptionRow(it) }
            onUpdate(rows)
            for (batch in metadata.chunked(OPTION_BATCH_SIZE)) {
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

    /** New selections save the same occurrence ID the picker used to check its candidates. */
    internal fun progressionEntryInstance(level: Int, slot: ChoiceSlotId): String =
        synchronized(optionListings) { optionListings[level to slot]?.newInstanceId } ?: UUID.randomUUID().toString()

    /**
     * Fill the retained listing for a level 1-2 slot, publishing after each checked batch. The picker and
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
        val listing = withContext(Dispatchers.IO) { heavyWork.withLock {
            synchronized(optionListings) {
                val state = current
                if (state?.document != original || catalog !== originalCatalog) {
                    return@synchronized null
                }
                val key = level to slot
                optionListings[key]?.listing ?: run {
                    val newInstanceId = UUID.randomUUID().toString()
                    val featClasses = if (slot.choiceId == "feat") state.featClasses() else null
                    operations?.optionListing(original, level, slot, newInstanceId, featClasses, state.featAncestries())?.also {
                        optionListings[key] = RetainedListing(it, newInstanceId)
                        // The checked rows are small beside the content itself.
                        if (optionListings.size > 32) {
                            optionListings.remove(optionListings.keys.first())
                        }
                    }
                }
            }
        } }
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

    internal data class WarmTarget(val level: Int, val slot: ChoiceSlotId, val group: FeatGroup?)

    /** Indexed power IDs for classifying entry slots without loading their picker options. */
    internal fun powerEntryIds(): Set<String> =
        catalog?.search(category = EntryCategory.POWER).orEmpty().mapTo(mutableSetOf()) { it.metadata.id }

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
        level == 1 && slot.ordinal == 0 && slot.sourceInstanceId == "creation" && slot.choiceId in setOf("class", "ancestry")

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
        newInstanceId: String): Boolean {
        if (slot.choiceId == "feat" &&
            (before.featClasses() != after.featClasses() || before.featAncestries() != after.featAncestries())) {
            return false
        }
        if (isRootList(level, slot) || firstChangedLevel(before.document, after.document) > level) {
            return true
        }
        val previous = before.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
        val selected = after.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot } ?: return false
        if ((previous?.instanceId ?: newInstanceId) != selected.instanceId ||
            firstChangedLevel(before.document, after.document, level to slot) <= level) {
            return false
        }
        // Root Theme and Feat listings use the installed category, independent of the effective choice.
        val catalogRoot = (level == 1 && slot in listOf(ChoiceSlotId("creation", "theme", 0), ChoiceSlotId("creation", "feat", 0))) ||
            (level == 2 && slot == ChoiceSlotId("advancement.2", "feat", 0))
        if (catalogRoot) {
            return true
        }
        fun EngineChoice.membership() = Triple(optional, acquisitionLevel, entries.map { it.entryId })
        return before.rules.choices.singleOrNull { it.slot == slot }?.membership() ==
            after.rules.choices.singleOrNull { it.slot == slot }?.membership()
    }

    /** Lowest level whose rules inputs differ between two documents; 1 for non-level inputs, Int.MAX_VALUE if none. */
    private fun firstChangedLevel(old: CharacterDocument, new: CharacterDocument, ignored: Pair<Int, ChoiceSlotId>? = null): Int {
        fun CharacterDocument.nonLevelInputs() = copy(savedAt = "", level = 1, levels = emptyList(),
            identity = CharacterIdentity("-", environment = identity.environment, upbringing = identity.upbringing))
        if (old.nonLevelInputs() != new.nonLevelInputs()) {
            return 1
        }
        val top = maxOf(old.level, new.level, old.levels.maxOfOrNull { it.level } ?: 0, new.levels.maxOfOrNull { it.level } ?: 0)
        fun CharacterDocument.decisions(level: Int): LevelDecisions? {
            val decisions = levels.firstOrNull { it.level == level }
            return if (ignored?.first == level) {
                decisions?.copy(entries = decisions.entries.filterNot { it.slot == ignored.second })
            } else {
                decisions
            }
        }
        for (level in 1..top) {
            if (old.decisions(level) != new.decisions(level)) {
                return level
            }
        }
        return if (old.level != new.level) minOf(old.level, new.level) + 1 else Int.MAX_VALUE
    }

    /**
     * Check every list the picker can open at levels 1-2, so each one opens already filled in. Order is the
     * unfilled ancestry power choices, then Class Feature choices, other power pools, feat tabs, and the
     * remaining catalog pickers. The Class and Ancestry rows are normally ready from Home. Later levels keep
     * their incomplete-automation listing and are not warmed. A character with no class or ancestry simply has
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
        val ancestryPowerSlots = Progression.ancestryPowerChoices(state, powerEntryIds()).mapTo(mutableSetOf()) { it.slot }
        val (ancestryPowers, otherChoices) = offered.partition { (_, choice) ->
            choice.slot in ancestryPowerSlots && choice.slot !in filled
        }
        val (powers, other) = otherChoices.partition { (_, choice) -> Progression.isPowerPool(state, choice) }
        val (features, remaining) = other.partition { (_, choice) -> Progression.isClassFeatureChoice(state, choice) }
        val (empty, taken) = powers.partition { (_, choice) -> choice.slot !in filled }
        val featSlots = listOf(1 to ChoiceSlotId("creation", "feat", 0)) +
            if (document.level >= 2) listOf(2 to ChoiceSlotId("advancement.2", "feat", 0)) else emptyList()
        val roots = listOf("class", "ancestry", "theme").map { ChoiceSlotId("creation", it, 0) }
            .filter { preloadedRootRows(document, 1, it) == null }
        return (ancestryPowers + features + empty + taken).map { (level, choice) -> WarmTarget(level, choice.slot, null) } +
            listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL).flatMap { group ->
                featSlots.map { (level, slot) -> WarmTarget(level, slot, group) }
            } +
            remaining.map { (level, choice) -> WarmTarget(level, choice.slot, null) } +
            roots.map { WarmTarget(1, it, null) }
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
            "Size" -> identity.size
            else -> return
        }
        dialog = field
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

    /** Open the level dialog on the next level, or on the current level at the cap. */
    fun beginLevelChange() {
        val level = current?.document?.level ?: return
        levelTarget = minOf(level + 1, MAX_LEVEL)
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
    }
}
