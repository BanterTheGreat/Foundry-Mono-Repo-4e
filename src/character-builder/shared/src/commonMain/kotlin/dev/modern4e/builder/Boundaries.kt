package dev.modern4e.builder

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

@Serializable
enum class DiagnosticKind { UNRESOLVED_CONTENT, INCOMPLETE_AUTOMATION, INVALID_SELECTION, INCOMPATIBLE_FORMAT, IO_FAILURE }

@Serializable
data class Diagnostic(val code: String, val kind: DiagnosticKind, val message: String, val slot: ChoiceSlotId? = null, val entryId: String? = null)

/** Unavailable data never masquerades as zero or a successful write. */
@Serializable
sealed class ContractResult<out T> {
    @Serializable
    @SerialName("available")
    data class Available<T>(val value: T, val diagnostics: List<Diagnostic> = emptyList()) : ContractResult<T>()
    @Serializable
    @SerialName("unavailable")
    data class Unavailable(val diagnostics: List<Diagnostic>) : ContractResult<Nothing>() {
        init {
            require(diagnostics.isNotEmpty())
        }
    }
}

@Serializable
data class Contributor(val label: String, val value: Int, val source: ChoiceSlotId? = null)

@Serializable
data class CalculatedValue(val total: Int, val contributors: List<Contributor>)

@Serializable
data class CharacterSummary(
    val id: String,
    val name: String,
    val savedAt: String,
    val level: Int,
    val ancestry: String = "",
    val characterClass: String = "",
) {
    val levelDescription: String
        get() = listOf("Level $level", ancestry, characterClass).filter(String::isNotBlank).joinToString(" ")
}

/** Build a list summary from the saved choices without opening the character's content packages. */
fun CharacterDocument.summary(): CharacterSummary {
    val choices = levels.firstOrNull { it.level == 1 }?.entries.orEmpty()
    fun title(choice: String) = choices.firstOrNull { it.slot == ChoiceSlotId("creation", choice, 0) }
        ?.selection?.savedTitle.orEmpty()
    return CharacterSummary(id, identity.name, savedAt, level, title("ancestry"), title("class"))
}

/** References are logical bundled asset IDs, never interpreted as executable code. */
interface ContentSource {
    suspend fun listPackages(): ContractResult<List<PackageManifest>>
    suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex>
    suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk>
}

/**
 * CREATE fails if the ID exists. Replacement compares the complete expected document,
 * durably retains its recovery copy, then atomically publishes the incoming document.
 * Any failure leaves the prior live document unchanged. Recovery copies are separate
 * from ordinary characters; IDs returned in receipts are used with loadRecovery.
 * Reads return detached snapshots with immutable collections. Methods return errors
 * through ContractResult rather than throwing. REPLACE_WITH_RECOVERY requires a
 * non-null expected document; compare and publication form one atomic operation.
 */
interface CharacterStore {
    suspend fun list(): ContractResult<List<CharacterSummary>>
    suspend fun load(id: String): ContractResult<CharacterDocument>
    suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument? = null): ContractResult<SaveReceipt>
    suspend fun delete(id: String): ContractResult<Boolean>
    suspend fun listRecovery(characterId: String): ContractResult<List<RecoverySummary>>
    suspend fun loadRecovery(recoveryId: String): ContractResult<CharacterDocument>
}

@Serializable
enum class SaveMode { CREATE, REPLACE_WITH_RECOVERY }
@Serializable
data class SaveReceipt(val characterId: String, val recoveryId: String? = null)
/** savedAt describes the recovered document, not a fabricated backup timestamp. */
@Serializable
data class RecoverySummary(val recoveryId: String, val character: CharacterSummary)
@Serializable
data class ExchangeFile(val name: String, val json: String)

/** User cancellation is an available null; platform failures are unavailable. */
interface FileExchange {
    suspend fun receive(): ContractResult<ExchangeFile?>
    suspend fun deliver(file: ExchangeFile): ContractResult<Unit>
}
