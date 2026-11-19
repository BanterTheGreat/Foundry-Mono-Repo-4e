package dev.modern4e.builder

import android.content.Context
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import kotlinx.serialization.json.*

/** Private JSON journal. Interrupted staging files never replace committed JSON.
 * A single journal commits live saves and recovery copies together, under a process/file lock.
 * Call suspend operations from an IO dispatcher; no UI or rules live in this adapter.
 */
class AndroidCharacterStore(context: Context, private val beforeCommit: () -> Unit = {}) : CharacterStore {
    private val directory = File(context.filesDir, "characters")
    private val journal get() = File(directory, "store.json")
    private data class State(val live: MutableMap<String, String>, val recovery: MutableMap<String, String>)

    private fun read(): State {
        if (!journal.exists()) {
            return State(mutableMapOf(), mutableMapOf())
        }
        val root = ContractCodec.json.parseToJsonElement(journal.inputStream().bufferedReader(Charsets.UTF_8).use { it.readText() }).jsonObject
        fun section(name: String) = root.getValue(name).jsonObject.mapValues { it.value.jsonPrimitive.content }.toMutableMap()
        return State(section("live"), section("recovery"))
    }

    private fun write(state: State) {
        val text = buildJsonObject {
            put("live", JsonObject(state.live.mapValues { JsonPrimitive(it.value) }))
            put("recovery", JsonObject(state.recovery.mapValues { JsonPrimitive(it.value) }))
        }.toString()
        val staged = File(directory, "store.pending")
        try {
            FileOutputStream(staged).use { stream ->
                stream.write(text.toByteArray(Charsets.UTF_8))
                stream.flush()
                stream.fd.sync()
            }
            beforeCommit()
            // Same-filesystem atomic rename: unsupported/failed publication throws,
            // rather than AtomicFile.finishWrite logging an error and reporting success.
            Files.move(staged.toPath(), journal.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } finally {
            staged.delete()
        }
    }

    private fun <T> access(block: (State) -> ContractResult<T>): ContractResult<T> = synchronized(lock) {
        try {
            check(directory.isDirectory || directory.mkdirs()) { "Cannot create private store" }
            RandomAccessFile(File(directory, "store.lock"), "rw").use { file ->
                file.channel.lock().use { block(read()) }
            }
        } catch (error: Exception) {
            failure("io", error.message ?: "Private storage failed")
        }
    }

    private fun document(text: String): CharacterDocument = when (val decoded = ContractCodec.decode(text)) {
        is ContractResult.Available -> decoded.value
        is ContractResult.Unavailable -> throw IllegalArgumentException(decoded.diagnostics.joinToString { it.message })
    }
    private fun summary(text: String): CharacterSummary = document(text).summary()
    override suspend fun list() = access { state -> ContractResult.Available(state.live.values.map(::summary)) }
    override suspend fun load(id: String) = access { state ->
        state.live[id]?.let { ContractResult.Available(document(it)) } ?: failure("missing", "Character does not exist")
    }
    override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?): ContractResult<SaveReceipt> {
        val encoded = ContractCodec.encodeChecked(document)
        if (encoded is ContractResult.Unavailable) {
            return encoded
        }
        val text = (encoded as ContractResult.Available).value
        return access { state ->
            val old = state.live[document.id]
            if (mode == SaveMode.CREATE && old != null) {
                return@access failure("exists", "Character already exists")
            }
            if (mode == SaveMode.REPLACE_WITH_RECOVERY && (old == null || expected == null || document(old) != expected)) {
                return@access failure("conflict", "Character changed; inspect again before replacing")
            }
            val recovery = if (mode == SaveMode.REPLACE_WITH_RECOVERY) UUID.randomUUID().toString() else null
            if (recovery != null) {
                state.recovery[recovery] = old!!
            }
            state.live[document.id] = text
            write(state)
            ContractResult.Available(SaveReceipt(document.id, recovery))
        }
    }
    override suspend fun delete(id: String) = access { state ->
        val removed = state.live.remove(id) != null
        if (removed) {
            write(state)
        }
        ContractResult.Available(removed)
    }
    override suspend fun listRecovery(characterId: String) = access { state ->
        ContractResult.Available(state.recovery.map { RecoverySummary(it.key, summary(it.value)) }.filter { it.character.id == characterId })
    }
    override suspend fun loadRecovery(recoveryId: String) = access { state ->
        state.recovery[recoveryId]?.let { ContractResult.Available(document(it)) } ?: failure("missing", "Recovery does not exist")
    }
    companion object {
        private val lock = Any()
        private fun failure(code: String, message: String) = ContractResult.Unavailable(listOf(Diagnostic("android.store.$code", DiagnosticKind.IO_FAILURE, message)))
    }
}
