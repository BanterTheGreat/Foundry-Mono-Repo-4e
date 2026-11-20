package dev.modern4e.builder

import java.nio.charset.CharacterCodingException
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** A place an exported character file can go; the platform decides how bytes reach it. */
interface ExportTarget {
    /** True when a finished export is announced with a message; false when the system takes the file over, as a share sheet does. */
    val confirmsWithMessage: Boolean

    /**
     * Writes [bytes] under [fileName], or under the name the user picked when the target asks.
     *
     * @return the written file, or null when the user cancelled before anything was written.
     */
    suspend fun write(fileName: String, bytes: ByteArray): ExportedFile?
}

/** A file an [ExportTarget] has written, readable again so the export can be checked before it is reported. */
interface ExportedFile {
    /** The name the file really has, which may differ from the suggestion when the destination renamed it. */
    val displayName: String

    /** Reads back the exact bytes now stored at the destination. */
    suspend fun read(): ByteArray

    /** Removes the file after a failed check, so no unusable character is left behind. */
    suspend fun discard()

    /** Hands a checked file to the user, for example by opening the share sheet. A saved file needs nothing more. */
    suspend fun present()
}

/** The two export choices the character menu offers. */
class ExportTargets(val save: ExportTarget, val share: ExportTarget)

/** Names exported character files so friends can tell characters, levels and exports apart. */
object ExportFileName {
    private const val MAX_NAME_LENGTH = 80
    private val date = DateTimeFormatter.ofPattern("dd-MM-yyyy")
    private val illegal = Regex("""[\\/:*?"<>|\u0000-\u001F]""")

    /** For example `Level 5 Thorin Oakenshield 19-11-2026.json`; the character's own name inside the file is untouched. */
    fun of(level: Int, characterName: String, exportedOn: LocalDate): String {
        val cleaned = characterName.replace(illegal, "").replace(Regex("\\s+"), " ").trim()
        // Cut on a code point boundary so an emoji is never split into a lone surrogate.
        val capped = cleaned.substring(0, cleaned.offsetByCodePoints(0, minOf(MAX_NAME_LENGTH, cleaned.codePointCount(0, cleaned.length))))
        val name = capped.trimEnd { it == '.' || it.isWhitespace() }.ifEmpty { "Character" }
        return "Level $level $name ${date.format(exportedOn)}.json"
    }
}

/** Proves an exported file will import: the bytes must decode, preview as an import and equal what was exported. */
object ExportVerifier {
    /**
     * Runs [bytes] through the real decoder and importer against an empty store, so nothing real is read or written.
     *
     * @param bytes the stored file content.
     * @param expected the character the file was made from.
     */
    suspend fun verify(bytes: ByteArray, expected: CharacterDocument): ContractResult<Unit> {
        val text = try {
            bytes.decodeToString(throwOnInvalidSequence = true)
        } catch (error: CharacterCodingException) {
            return failure("The file is not valid UTF-8 text.")
        }
        val decoded = when (val result = ContractCodec.decode(text)) {
            is ContractResult.Unavailable -> return failure("The file would not import: ${result.diagnostics.first().message}")
            is ContractResult.Available -> result.value
        }
        if (decoded != expected) {
            return failure("The file does not match the character it was made from.")
        }
        val preview = when (val result = CharacterImporter(EmptyStore) { "verification" }.inspect(text)) {
            is ContractResult.Unavailable -> return failure("The file would not import: ${result.diagnostics.first().message}")
            is ContractResult.Available -> result.value
        }
        if (preview.existing != null || preview.incoming != expected || ImportAction.IMPORT !in preview.actions) {
            return failure("The file does not import as the same character.")
        }
        return ContractResult.Available(Unit)
    }

    private fun failure(message: String) =
        ContractResult.Unavailable(listOf(Diagnostic("android.export.verify", DiagnosticKind.IO_FAILURE, message)))

    /** Holds no characters and refuses every write, so a check can never touch real data. */
    private object EmptyStore : CharacterStore {
        private fun <T> refused(): ContractResult<T> =
            ContractResult.Unavailable(listOf(Diagnostic("android.export.verify", DiagnosticKind.IO_FAILURE, "Verification store is read-only")))
        override suspend fun list() = ContractResult.Available(emptyList<CharacterSummary>())
        override suspend fun load(id: String): ContractResult<CharacterDocument> = refused()
        override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?): ContractResult<SaveReceipt> = refused()
        override suspend fun delete(id: String): ContractResult<Boolean> = refused()
        override suspend fun listRecovery(characterId: String) = ContractResult.Available(emptyList<RecoverySummary>())
        override suspend fun loadRecovery(recoveryId: String): ContractResult<CharacterDocument> = refused()
    }
}
