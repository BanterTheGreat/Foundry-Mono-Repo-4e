package dev.modern4e.builder

import kotlinx.serialization.Serializable

/** A reviewed identity mapping, never a title match or a score conversion. */
@Serializable
data class ContentIdMapping(val sourceId: String, val targetId: String, val category: EntryCategory) {
    init {
        require(sourceId.isNotBlank() && targetId.isNotBlank() && sourceId != targetId)
    }
}

/** Versioned, explicit mappings can be reviewed separately from the migration engine. */
@Serializable
data class ContentMigrationPlan(val schemaVersion: Int, val id: String, val mappings: List<ContentIdMapping>) {
    init {
        require(schemaVersion == 1 && id.isNotBlank())
    }
}

/** Portable provenance survives adoption of the new definition and subsequent exports. */
@Serializable
data class ContentMigrationRecord(
    @OpaqueIdentifier val planId: String,
    @OpaqueIdentifier val instanceId: String,
    val original: SavedSelection,
    val adopted: SavedSelection,
)

data class ContentMigrationChange(
    val instanceId: String,
    val original: SavedSelection,
    val proposed: ContractResult<SavedSelection>,
)

/** A migration proposes decisions only. The caller owns explicit confirmation and persistence. */
class ContentMigrationPreview internal constructor(
    internal val original: CharacterDocument,
    val proposed: CharacterDocument,
    val changes: List<ContentMigrationChange>,
)

/** Explicit ID adoption using an already selected destination catalog; never invoked on load. */
class ContentMigration(private val catalog: ContentCatalog) {
    /** Uses only the identities explicitly listed in this reviewed plan. */
    suspend fun preview(document: CharacterDocument, plan: ContentMigrationPlan) =
        preview(document, plan.id, plan.mappings)

    /** Missing targets remain unchanged. Unmapped IDs and every source slot are preserved. */
    suspend fun preview(document: CharacterDocument, planId: String,
        mappings: List<ContentIdMapping>): ContractResult<ContentMigrationPreview> {
        if (planId.isBlank() || mappings.map { it.sourceId }.distinct().size != mappings.size ||
            mappings.any { mapping -> mappings.any { it.sourceId == mapping.targetId } }) {
            return failure("migration.invalidPlan", "A plan needs an ID and unambiguous, non-chained identity mappings.")
        }
        val byId = mappings.associateBy { it.sourceId }
        val changes = mutableListOf<ContentMigrationChange>()
        val records = mutableListOf<ContentMigrationRecord>()
        suspend fun adopt(instance: String, saved: SavedSelection, expectedCategory: EntryCategory? = null): SavedSelection {
            val mapping = byId[saved.entryId] ?: return saved
            val found = catalog.lookup(mapping.targetId)
            val proposed = when (found) {
                is ContractResult.Unavailable -> found
                is ContractResult.Available -> {
                    val resolved = found.value
                    if (resolved == null || resolved.entry.category != mapping.category ||
                        expectedCategory != null && resolved.entry.category != expectedCategory) {
                        failure("migration.targetUnavailable", "Migration target ${mapping.targetId} is missing or has the wrong category.")
                    } else {
                        ContractResult.Available(SavedSelection(resolved.entry.id, resolved.entry.presentation.title,
                            resolved.supplier.packageId, resolved.fingerprint))
                    }
                }
            }
            changes += ContentMigrationChange(instance, saved, proposed)
            val adopted = (proposed as? ContractResult.Available)?.value ?: return saved
            records += ContentMigrationRecord(planId, instance, saved, adopted)
            return adopted
        }
        fun rootCategory(slot: ChoiceSlotId): EntryCategory? = when {
            slot.sourceInstanceId == "creation" -> when (slot.choiceId) {
                "class" -> EntryCategory.CLASS
                "ancestry" -> EntryCategory.ANCESTRY
                "theme" -> EntryCategory.THEME
                "feat" -> EntryCategory.FEAT
                else -> null
            }
            slot.sourceInstanceId.startsWith("advancement.") && slot.choiceId == "feat" -> EntryCategory.FEAT
            else -> null
        }
        val levels = document.levels.map { level -> level.copy(
            entries = level.entries.map { it.copy(selection = adopt(it.instanceId, it.selection, rootCategory(it.slot))) },
            replacements = level.replacements.map { replacement -> replacement.copy(
                replacement = replacement.replacement.let { it.copy(selection = adopt(it.instanceId, it.selection,
                    rootCategory(replacement.replaces))) }) }) }
        val equipment = document.equipment.map { it.copy(selection = adopt(it.instanceId, it.selection, EntryCategory.ITEM)) }
        // Preserve destination precedence exactly; missing old suppliers retain unresolved decisions.
        val destinationIds = catalog.packages.map { it.id }.toSet()
        val packages = if (records.isEmpty()) document.packages else
            document.packages.filterNot { it.packageId in destinationIds } +
                catalog.packages.map { PackageRevision(it.id, it.revision) }
        val proposed = document.copy(levels = levels, equipment = equipment, packages = packages,
            contentMigrations = document.contentMigrations + records)
        return ContractResult.Available(ContentMigrationPreview(document, proposed, changes))
    }

    /** Rejects stale confirmation; no storage write or implicit ability conversion occurs. */
    fun commit(document: CharacterDocument, preview: ContentMigrationPreview): ContractResult<CharacterDocument> {
        if (document != preview.original) {
            return failure("migration.stalePreview", "The character changed; create a new migration preview.")
        }
        return ContractResult.Available(preview.proposed)
    }

    private fun failure(code: String, message: String) = ContractResult.Unavailable(
        listOf(Diagnostic(code, DiagnosticKind.INVALID_SELECTION, message)))
}
