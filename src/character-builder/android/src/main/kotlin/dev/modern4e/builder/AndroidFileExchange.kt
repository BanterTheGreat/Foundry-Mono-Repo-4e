package dev.modern4e.builder

import android.content.ContentResolver
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/** Register during activity initialization, before STARTED. One picker operation at a time. */
class AndroidDocumentPicker(activity: ComponentActivity) {
    private var pending: Continuation<Uri?>? = null
    private val open = activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { finish(it) }
    private val create = activity.registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { finish(it) }
    private fun finish(uri: Uri?) {
        val continuation = pending
        pending = null
        continuation?.resume(uri)
    }
    private suspend fun pick(launch: () -> Unit): Uri? = suspendCoroutine { continuation ->
        check(pending == null) { "A document picker is already open" }
        pending = continuation
        try {
            launch()
        } catch (error: Exception) {
            pending = null
            throw error
        }
    }
    suspend fun open(): Uri? = pick { open.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }
    suspend fun create(name: String): Uri? = pick { create.launch(name) }
}

/** SAF owns external permissions; imports remain bytes until the shared importer inspects them.
 * Exports validate before opening a destination, and success requires a completed stream close.
 */
class AndroidFileExchange(
    private val resolver: ContentResolver,
    private val open: suspend () -> Uri?,
    private val create: suspend (String) -> Uri?,
) : FileExchange {
    constructor(resolver: ContentResolver, picker: AndroidDocumentPicker) : this(resolver, picker::open, picker::create)

    override suspend fun receive(): ContractResult<ExchangeFile?> = try {
        val uri = open()
        if (uri == null) {
            ContractResult.Available(null)
        } else {
            val stream = checkNotNull(resolver.openInputStream(uri)) { "Document provider returned no stream" }
            val text = stream.use { it.readBytes().decodeToString(throwOnInvalidSequence = true) }
            ContractResult.Available(ExchangeFile(uri.lastPathSegment ?: "character.json", text))
        }
    } catch (error: Exception) {
        failure("read", error.message ?: "Cannot open document")
    }

    override suspend fun deliver(file: ExchangeFile): ContractResult<Unit> {
        val checked = ContractCodec.decode(file.json)
        if (checked is ContractResult.Unavailable) {
            return checked
        }
        return try {
            val uri = create(file.name) ?: return failure("cancelled", "Export cancelled")
            val stream = checkNotNull(resolver.openOutputStream(uri, "wt")) { "Document provider returned no stream" }
            stream.use { it.write(file.json.toByteArray(Charsets.UTF_8)) }
            ContractResult.Available(Unit)
        } catch (error: Exception) {
            failure("write", error.message ?: "Cannot export document")
        }
    }
    private fun failure(code: String, message: String) = ContractResult.Unavailable(listOf(Diagnostic("android.exchange.$code", DiagnosticKind.IO_FAILURE, message)))
}
