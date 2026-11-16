package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class CharacterImportTest {
    private val original = ContractCodec.json.decodeFromString<CharacterDocument>(contractFixtures.getValue("character.json"))
    private val incoming = original.copy(identity = original.identity.copy(name = "Imported hero"), savedAt = "2026-11-16T12:30:00Z")

    /** Reference adapter exercises atomic compare, durable backup and failed publication. */
    private inner class Store : CharacterStore {
        val characters = mutableMapOf<String, CharacterDocument>()
        val backups = mutableMapOf<String, CharacterDocument>()
        var fail: String? = null
        var reads = 0
        var writes = 0
        val events = mutableListOf<String>()

        override suspend fun list(): ContractResult<List<CharacterSummary>> {
            reads++
            return if (fail == "list") error("list") else ContractResult.Available(characters.values.map { summary(it) })
        }
        override suspend fun load(id: String): ContractResult<CharacterDocument> {
            reads++
            return if (fail == "load") error("load") else characters[id]?.let { ContractResult.Available(it) } ?: error("missing")
        }
        override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?): ContractResult<SaveReceipt> {
            writes++
            val prior = characters[document.id]
            if (mode == SaveMode.CREATE && prior != null) {
                return error("exists")
            }
            if (mode == SaveMode.REPLACE_WITH_RECOVERY && (prior == null || expected == null || prior != expected)) {
                return error("conflict")
            }
            var recoveryId: String? = null
            if (mode == SaveMode.REPLACE_WITH_RECOVERY) {
                if (fail == "recovery") {
                    return error("recovery")
                }
                recoveryId = "recovery-${backups.size}"
                backups[recoveryId] = prior!!
                events += "recovery"
            }
            if (fail == "save") {
                return error("save")
            }
            characters[document.id] = document
            events += "commit"
            return ContractResult.Available(SaveReceipt(document.id, recoveryId))
        }
        override suspend fun delete(id: String) = ContractResult.Available(characters.remove(id) != null)
        override suspend fun listRecovery(characterId: String): ContractResult<List<RecoverySummary>> =
            if (fail == "discover") error("discover") else ContractResult.Available(backups.filterValues { it.id == characterId }.map { RecoverySummary(it.key, summary(it.value)) })
        override suspend fun loadRecovery(recoveryId: String): ContractResult<CharacterDocument> =
            if (fail == "recoverLoad") error("recoverLoad") else backups[recoveryId]?.let { ContractResult.Available(it) } ?: error("recoveryMissing")
    }

    private fun summary(document: CharacterDocument) = CharacterSummary(document.id, document.identity.name, document.savedAt, document.level)
    private fun error(code: String) = ContractResult.Unavailable(listOf(Diagnostic("store.$code", DiagnosticKind.IO_FAILURE, "Failed $code")))
    private fun <T> value(result: ContractResult<T>) = assertIs<ContractResult.Available<T>>(result).value
    private fun code(result: ContractResult<*>) = assertIs<ContractResult.Unavailable>(result).diagnostics.first().code
    private suspend fun preview(importer: CharacterImporter) = value(importer.inspect(ContractCodec.encode(incoming)))
    private fun run(block: suspend () -> Unit) {
        var completed = false
        var failure: Throwable? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                completed = true
                failure = result.exceptionOrNull()
            }
        })
        assertTrue(completed, "In-memory adapter completes immediately")
        failure?.let { throw it }
    }

    @Test fun malformedAndUnsupportedFormatsNeverReadOrWriteStore() = run {
        val store = Store()
        val importer = CharacterImporter(store) { "copy" }
        for (text in listOf("{", ContractCodec.encode(incoming).replace("\"formatVersion\":1", "\"formatVersion\":2"), ContractCodec.encode(incoming).replace("\"level\":${incoming.level}", "\"level\":0"))) {
            assertIs<ContractResult.Unavailable>(importer.inspect(text))
        }
        assertEquals(0, store.reads)
        assertEquals(0, store.writes)
    }

    @Test fun collisionReturnsDetailsTimestampsAndExplicitActionsWithoutWrites() = run {
        val store = Store().apply { characters[original.id] = original }
        val p = preview(CharacterImporter(store) { "copy" })
        assertEquals(summary(original), p.existingDetails)
        assertEquals(summary(incoming), p.incomingDetails)
        assertEquals(listOf(ImportAction.REPLACE, ImportAction.COPY, ImportAction.CANCEL), p.actions)
        assertEquals(0, store.writes)
    }

    @Test fun newImportUsesCreateAndPreservesAllDecisions() = run {
        val store = Store()
        val importer = CharacterImporter(store) { "copy" }
        val p = preview(importer)
        assertNull(p.existingDetails)
        assertEquals(ImportAction.IMPORT, value(importer.commit(p, ImportAction.IMPORT)).action)
        assertEquals(incoming, store.characters[incoming.id])
        assertTrue(store.backups.isEmpty())
    }

    @Test fun copyChangesOnlyCharacterIdAndCancelPerformsNoWrite() = run {
        val store = Store().apply { characters[original.id] = original }
        val importer = CharacterImporter(store) { "fresh-id" }
        val p = preview(importer)
        assertNull(value(importer.commit(p, ImportAction.CANCEL)).receipt)
        assertEquals(0, store.writes)
        assertEquals("fresh-id", value(importer.commit(p, ImportAction.COPY)).receipt!!.characterId)
        assertEquals(incoming.copy(id = "fresh-id"), store.characters["fresh-id"])
        assertEquals(original, store.characters[original.id])
        assertEquals(incoming, p.incoming)
    }

    @Test fun replacementCreatesDiscoverableBackupBeforeCommitAndRestoresSafely() = run {
        val store = Store().apply { characters[original.id] = original }
        val importer = CharacterImporter(store) { "copy" }
        val receipt = value(importer.commit(preview(importer), ImportAction.REPLACE)).receipt!!
        assertEquals(listOf("recovery", "commit"), store.events)
        assertEquals(incoming, store.characters[original.id])
        val copies = value(importer.recoveries(original.id))
        assertEquals(listOf(RecoverySummary(receipt.recoveryId!!, summary(original))), copies)
        val restore = value(importer.inspectRecovery(receipt.recoveryId!!))
        assertEquals(incoming, restore.existing)
        assertEquals(original, restore.incoming)
        val restored = value(importer.commit(restore, ImportAction.REPLACE)).receipt!!
        assertEquals(original, store.characters[original.id])
        assertEquals(incoming, store.backups[restored.recoveryId])
        assertEquals(original, store.backups[receipt.recoveryId])
    }

    @Test fun recoveryFailurePreventsReplacementAndSaveFailureLeavesOriginalAvailable() = run {
        for (failure in listOf("recovery", "save")) {
            val store = Store().apply { characters[original.id] = original; fail = failure }
            val importer = CharacterImporter(store) { "copy" }
            assertEquals("store.$failure", code(importer.commit(preview(importer), ImportAction.REPLACE)))
            assertEquals(original, value(store.load(original.id)))
            if (failure == "recovery") {
                assertTrue(store.backups.isEmpty())
                assertTrue(store.events.isEmpty())
            } else {
                assertEquals(original, store.backups.values.single())
                assertEquals(listOf("recovery"), store.events)
            }
        }
    }

    @Test fun failedCreatesAndCopyCollisionsNeverOverwriteExistingCharacters() = run {
        val store = Store().apply { fail = "save" }
        val importer = CharacterImporter(store) { "occupied" }
        assertEquals("store.save", code(importer.commit(preview(importer), ImportAction.IMPORT)))
        assertTrue(store.characters.isEmpty())
        store.fail = null
        store.characters["occupied"] = original.copy(id = "occupied")
        assertEquals("store.exists", code(importer.commit(preview(importer), ImportAction.COPY)))
        assertEquals(original.copy(id = "occupied"), store.characters["occupied"])
    }

    @Test fun outdatedPreviewCannotOverwriteNewLocalEditsOrConcurrentCreation() = run {
        val store = Store().apply { characters[original.id] = original }
        val importer = CharacterImporter(store) { "copy" }
        val p = preview(importer)
        val edited = original.copy(identity = original.identity.copy(notes = "local edit"))
        store.characters[original.id] = edited
        assertEquals("store.conflict", code(importer.commit(p, ImportAction.REPLACE)))
        assertEquals(edited, store.characters[original.id])
        assertTrue(store.backups.isEmpty())
        store.characters.clear()
        val fresh = preview(importer)
        store.characters[original.id] = edited
        assertEquals("store.exists", code(importer.commit(fresh, ImportAction.IMPORT)))
        assertEquals(edited, store.characters[original.id])
    }

    @Test fun invalidActionsOwnersAndIdsDoNotWrite() = run {
        val store = Store().apply { characters[original.id] = original }
        val importer = CharacterImporter(store) { original.id }
        val p = preview(importer)
        assertEquals("import.action", code(importer.commit(p, ImportAction.IMPORT)))
        assertEquals("import.action", code(CharacterImporter(store) { "copy" }.commit(p, ImportAction.REPLACE)))
        assertEquals("import.copyId", code(importer.commit(p, ImportAction.COPY)))
        val blank = CharacterImporter(store) { " " }
        assertEquals("import.copyId", code(blank.commit(preview(blank), ImportAction.COPY)))
        assertEquals(0, store.writes)
    }

    @Test fun storageReadAndRecoveryErrorsAreExplicit() = run {
        val store = Store().apply { characters[original.id] = original }
        val importer = CharacterImporter(store) { "copy" }
        for (failure in listOf("list", "load")) {
            store.fail = failure
            assertEquals("store.$failure", code(importer.inspect(ContractCodec.encode(incoming))))
        }
        store.fail = "discover"
        assertEquals("store.discover", code(importer.recoveries(original.id)))
        store.fail = "recoverLoad"
        assertEquals("store.recoverLoad", code(importer.inspectRecovery("backup")))
        store.fail = null
        assertEquals("store.recoveryMissing", code(importer.inspectRecovery("backup")))
        assertEquals(0, store.writes)
    }

    @Test fun failedRestoreLeavesCurrentCharacterAndBackupAvailable() = run {
        val store = Store().apply { characters[original.id] = incoming; backups["backup"] = original }
        val importer = CharacterImporter(store) { "copy" }
        val restore = value(importer.inspectRecovery("backup"))
        store.fail = "save"
        assertEquals("store.save", code(importer.commit(restore, ImportAction.REPLACE)))
        assertEquals(incoming, store.characters[original.id])
        assertEquals(original, store.backups["backup"])
    }
}
