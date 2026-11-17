package dev.modern4e.builder

/** One saved occurrence, including inventory and historical replacement choices. */
data class SelectionResolution(
    val instanceId: String,
    val saved: SavedSelection,
    val definition: ContractResult<ResolvedEntry>,
) {
    val detailsAvailable: Boolean get() = definition is ContractResult.Available
    val acknowledgmentRequired: Boolean get() = (definition as? ContractResult.Available)?.value?.acknowledgmentRequired == true
}

data class ReconciliationState(
    val state: BuilderState,
    val selections: List<SelectionResolution>,
    val changedPackages: List<PackageRevision>,
)

/** A preview is a proposed document, never a write. Discard it to cancel. */
class PackageSwitchPreview internal constructor(
    internal val original: CharacterDocument,
    val proposed: ReconciliationState,
    val affectedSelections: List<SelectionResolution>,
)

/** Coordinates current-content reconciliation without storage, UI, historical pins or implicit fallback. */
class ContentReconciliation(private val source: ContentSource, private val standardPackageId: String) {
    /** Uses installed definitions while preserving every saved comparison baseline and decision. */
    suspend fun reconcile(document: CharacterDocument): ContractResult<ReconciliationState> {
        return withCatalog(document.packages) { catalog -> inspect(document, catalog) }
    }

    /** Explicitly acknowledges available definitions only; unresolved provenance survives unchanged. */
    suspend fun acknowledge(document: CharacterDocument): ContractResult<ReconciliationState> {
        return withCatalog(document.packages) { catalog ->
            val resolutions = resolve(document, catalog)
            val updated = transform(document, resolutions).copy(packages = revisions(document.packages, catalog))
            inspect(updated, catalog)
        }
    }

    /** Resolves by ID against a deliberate new order. The caller must explicitly commit the result. */
    suspend fun preview(document: CharacterDocument, packages: List<PackageRevision>): ContractResult<PackageSwitchPreview> {
        return withCatalog(packages) { catalog ->
            val resolutions = resolve(document, catalog, deliberate = true)
            val candidate = transform(document, resolutions).copy(packages = revisions(packages, catalog))
            val proposed = inspect(candidate, catalog)
            PackageSwitchPreview(document, proposed, resolutions.filter {
                it.definition is ContractResult.Unavailable || it.acknowledgmentRequired
            })
        }
    }

    /** Refuses stale previews so edits made during confirmation cannot be overwritten. No persistence occurs. */
    fun commit(document: CharacterDocument, preview: PackageSwitchPreview): ContractResult<ReconciliationState> {
        if (document != preview.original) {
            return ContractResult.Unavailable(listOf(Diagnostic("reconciliation.stalePreview", DiagnosticKind.INVALID_SELECTION,
                "The character changed after this preview; create a new preview before confirming.")))
        }
        return ContractResult.Available(preview.proposed)
    }

    private suspend fun inspect(document: CharacterDocument, catalog: ContentCatalog): ReconciliationState {
        val selections = resolve(document, catalog)
        val state = BuilderOperations(catalog).evaluate(document)
        return ReconciliationState(state,
            selections, catalog.packages.filter { installed ->
                document.packages.any { it.packageId == installed.id && it.revision != installed.revision }
            }.map { PackageRevision(it.id, it.revision) })
    }

    private suspend fun resolve(document: CharacterDocument, catalog: ContentCatalog, deliberate: Boolean = false): List<SelectionResolution> {
        val occurrences = document.levels.flatMap { level ->
            level.entries.map { it.instanceId to it.selection } +
                level.replacements.map { it.replacement.instanceId to it.replacement.selection }
        } + document.equipment.map { it.instanceId to it.selection }
        return occurrences.map { (id, saved) -> SelectionResolution(id, saved, catalog.resolve(saved, deliberate)) }
    }

    private fun transform(document: CharacterDocument, resolutions: List<SelectionResolution>): CharacterDocument {
        val definitions = resolutions.associate { it.saved to it.definition }
        fun update(saved: SavedSelection): SavedSelection {
            val resolved = (definitions[saved] as? ContractResult.Available)?.value ?: return saved
            return SavedSelection(saved.entryId, resolved.entry.presentation.title, resolved.supplier.packageId, resolved.fingerprint)
        }
        return document.copy(levels = document.levels.map { level -> level.copy(
            entries = level.entries.map { it.copy(selection = update(it.selection)) },
            replacements = level.replacements.map { it.copy(replacement = it.replacement.copy(selection = update(it.replacement.selection))) }) },
            equipment = document.equipment.map { it.copy(selection = update(it.selection)) })
    }

    private fun revisions(requested: List<PackageRevision>, catalog: ContentCatalog): List<PackageRevision> = requested.map { saved ->
        catalog.packages.firstOrNull { it.id == saved.packageId }?.let { PackageRevision(it.id, it.revision) } ?: saved
    }

    private suspend fun <T> withCatalog(packages: List<PackageRevision>, block: suspend (ContentCatalog) -> T): ContractResult<T> {
        return when (val opened = ContentCatalog.open(source, standardPackageId, packages)) {
            is ContractResult.Unavailable -> opened
            is ContractResult.Available -> ContractResult.Available(block(opened.value), opened.diagnostics)
        }
    }
}
