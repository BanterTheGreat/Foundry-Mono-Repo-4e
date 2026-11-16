package dev.modern4e.builder

/** UI decisions are explicit; nothing is merged or replaced during inspection. */
enum class ImportAction { IMPORT, REPLACE, COPY, CANCEL }

/** Validated preview owned by the coordinator that inspected it. */
class ImportPreview internal constructor(
    internal val owner: CharacterImporter,
    val incoming: CharacterDocument,
    val existing: CharacterDocument?,
) {
    val incomingDetails: CharacterSummary get() = incoming.summary()
    val existingDetails: CharacterSummary? get() = existing?.summary()
    val actions: List<ImportAction> get() = if (existing == null) {
        listOf(ImportAction.IMPORT, ImportAction.COPY, ImportAction.CANCEL)
    } else {
        listOf(ImportAction.REPLACE, ImportAction.COPY, ImportAction.CANCEL)
    }
}

/** A cancelled import carries no receipt and has performed no writes. */
data class ImportOutcome(val action: ImportAction, val receipt: SaveReceipt? = null)

/**
 * Shared import/recovery coordination. Platforms supply storage and fresh opaque IDs;
 * timestamps and all choices are preserved. Store saves must implement the atomic
 * compare-and-recovery contract, including rejecting an outdated replacement preview.
 */
class CharacterImporter(private val store: CharacterStore, private val newCharacterId: () -> String) {
    /** Validate the entire format before reading the local store, let alone writing it. */
    suspend fun inspect(json: String): ContractResult<ImportPreview> {
        return when (val decoded = ContractCodec.decode(json)) {
            is ContractResult.Unavailable -> decoded
            is ContractResult.Available -> inspectDocument(decoded.value)
        }
    }

    /** Discovery keeps recovery copies out of the ordinary character list. */
    suspend fun recoveries(characterId: String): ContractResult<List<RecoverySummary>> = store.listRecovery(characterId)

    /** Restoration uses the same explicit preview/decision workflow as file import. */
    suspend fun inspectRecovery(recoveryId: String): ContractResult<ImportPreview> {
        return when (val recovered = store.loadRecovery(recoveryId)) {
            is ContractResult.Unavailable -> recovered
            is ContractResult.Available -> when (val encoded = ContractCodec.encodeChecked(recovered.value)) {
                is ContractResult.Unavailable -> encoded
                is ContractResult.Available -> inspect(encoded.value)
            }
        }
    }

    /** Cancel never touches storage; replacement/copy do not mutate either preview document. */
    suspend fun commit(preview: ImportPreview, action: ImportAction): ContractResult<ImportOutcome> {
        if (preview.owner !== this || action !in preview.actions) {
            return failure("import.action", "This action does not belong to this import preview.")
        }
        if (action == ImportAction.CANCEL) {
            return ContractResult.Available(ImportOutcome(action))
        }
        // Guard against invalid mutable collection contents supplied by a platform caller.
        when (val checked = ContractCodec.encodeChecked(preview.incoming)) {
            is ContractResult.Unavailable -> return checked
            is ContractResult.Available -> Unit
        }
        val document = if (action == ImportAction.COPY) {
            val id = newCharacterId()
            if (id.isBlank() || id == preview.incoming.id) {
                return failure("import.copyId", "Import as copy requires a fresh nonblank character ID.")
            }
            preview.incoming.copy(id = id)
        } else {
            preview.incoming
        }
        when (val checked = ContractCodec.encodeChecked(document)) {
            is ContractResult.Unavailable -> return checked
            is ContractResult.Available -> Unit
        }
        val mode = if (action == ImportAction.REPLACE) SaveMode.REPLACE_WITH_RECOVERY else SaveMode.CREATE
        return when (val saved = store.save(document, mode, if (action == ImportAction.REPLACE) preview.existing else null)) {
            is ContractResult.Unavailable -> saved
            is ContractResult.Available -> {
                // A faulty adapter must not make a replacement appear successful without recovery.
                if (saved.value.characterId != document.id ||
                    (mode == SaveMode.REPLACE_WITH_RECOVERY && saved.value.recoveryId.isNullOrBlank())) {
                    failure("import.receipt", "The store returned an invalid save/recovery receipt; verify local storage before continuing.")
                } else {
                    ContractResult.Available(ImportOutcome(action, saved.value), saved.diagnostics)
                }
            }
        }
    }

    private suspend fun inspectDocument(document: CharacterDocument): ContractResult<ImportPreview> {
        return when (val listed = store.list()) {
            is ContractResult.Unavailable -> listed
            is ContractResult.Available -> {
                if (listed.value.none { it.id == document.id }) {
                    ContractResult.Available(ImportPreview(this, document, null), listed.diagnostics)
                } else {
                    when (val loaded = store.load(document.id)) {
                        is ContractResult.Unavailable -> loaded
                        is ContractResult.Available -> {
                            if (loaded.value.id != document.id) {
                                failure("import.identity", "The store loaded a different character than requested.")
                            } else {
                                ContractResult.Available(ImportPreview(this, document, loaded.value), listed.diagnostics + loaded.diagnostics)
                            }
                        }
                    }
                }
            }
        }
    }

    private fun failure(code: String, message: String) =
        ContractResult.Unavailable(listOf(Diagnostic(code, DiagnosticKind.IO_FAILURE, message)))
}

private fun CharacterDocument.summary() = CharacterSummary(id, identity.name, savedAt, level)
