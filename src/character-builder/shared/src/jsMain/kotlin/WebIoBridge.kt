@file:OptIn(ExperimentalJsExport::class)

import dev.modern4e.builder.*
import kotlinx.serialization.builtins.*
import kotlinx.serialization.serializer
import kotlinx.serialization.json.*
import kotlin.coroutines.*
import kotlin.js.Promise

/** JSON-only asynchronous IO boundary; browser adapters never implement import rules. */
private class WebStore(private val call: (String, String) -> Promise<String>) : CharacterStore {
    private suspend inline fun <reified T> request(operation: String, payload: JsonElement = JsonNull): ContractResult<T> =
        readResult(awaitText(call(operation, payload.toString())), "store.database")
    override suspend fun list() = request<List<CharacterSummary>>("list")
    override suspend fun load(id: String) = request<CharacterDocument>("load", JsonPrimitive(id))
    override suspend fun delete(id: String) = request<Boolean>("delete", JsonPrimitive(id))
    override suspend fun listRecovery(characterId: String) = request<List<RecoverySummary>>("listRecovery", JsonPrimitive(characterId))
    override suspend fun loadRecovery(recoveryId: String) = request<CharacterDocument>("loadRecovery", JsonPrimitive(recoveryId))
    override suspend fun save(document: CharacterDocument, mode: SaveMode, expected: CharacterDocument?) =
        request<SaveReceipt>("save", buildJsonObject {
            put("document", ContractCodec.json.encodeToJsonElement(document))
            put("mode", mode.name)
            put("expected", expected?.let { ContractCodec.json.encodeToJsonElement(it) } ?: JsonNull)
        })
}

/** Concrete serializers preserve generic value types across the JS boundary. */
private inline fun <reified T> readResult(text: String, code: String): ContractResult<T> = try {
    val objectValue = ContractCodec.json.parseToJsonElement(text).jsonObject
    val fields = JsonObject(objectValue.filterKeys { it != "type" })
    when (objectValue["type"]?.jsonPrimitive?.content) {
        "available" -> ContractCodec.json.decodeFromJsonElement(ContractResult.Available.serializer(serializer<T>()), fields)
        "unavailable" -> ContractCodec.json.decodeFromJsonElement(ContractResult.Unavailable.serializer(), fields)
        else -> error("Unknown adapter result type")
    }
} catch (error: Exception) {
    ContractResult.Unavailable(listOf(Diagnostic(code, DiagnosticKind.IO_FAILURE, error.message ?: "Invalid adapter data")))
}

private suspend fun awaitText(promise: Promise<String>): String = suspendCoroutine { continuation ->
    promise.then({ continuation.resume(it) }, { continuation.resumeWithException(it) })
}

/** Promise completion follows the shared suspend operation, including real IndexedDB commits. */
private fun asyncJson(block: suspend () -> String): Promise<String> = Promise { resolve, reject ->
    block.startCoroutine(object : Continuation<String> {
        override val context = EmptyCoroutineContext
        override fun resumeWith(result: Result<String>) { result.fold(resolve, reject) }
    })
}

private inline fun <reified T> resultJson(result: ContractResult<T>): String =
    when (result) {
        is ContractResult.Available -> buildJsonObject {
            put("type", "available")
            put("value", ContractCodec.json.encodeToJsonElement(result.value))
            put("diagnostics", ContractCodec.json.encodeToJsonElement(result.diagnostics))
        }.toString()
        is ContractResult.Unavailable -> ContractCodec.json.encodeToString(ContractResult.Unavailable.serializer(), result)
            .let { "{\"type\":\"unavailable\"," + it.drop(1) }
    }

/** Keep opaque preview ownership in Kotlin instead of trusting browser-supplied expected data. */
@JsExport
class WebCharacterImporter(call: (String, String) -> Promise<String>, newId: () -> String) {
    private val importer = CharacterImporter(WebStore(call), newId)
    private val previews = mutableMapOf<String, ImportPreview>()
    private var next = 0
    fun inspect(text: String): Promise<String> = asyncJson { preview(importer.inspect(text)) }
    fun inspectRecovery(id: String): Promise<String> = asyncJson { preview(importer.inspectRecovery(id)) }
    fun recoveries(id: String): Promise<String> = asyncJson { resultJson(importer.recoveries(id)) }
    fun commit(token: String, action: String): Promise<String> = asyncJson {
        val p = previews[token]
        val a = ImportAction.entries.find { it.name == action }
        if (p == null || a == null) {
            resultJson<JsonElement>(ContractResult.Unavailable(listOf(Diagnostic("import.action", DiagnosticKind.IO_FAILURE, "Unknown preview or action."))))
        } else {
            when (val result = importer.commit(p, a)) {
                is ContractResult.Unavailable -> resultJson<JsonElement>(result)
                is ContractResult.Available -> {
                    previews.remove(token)
                    resultJson(ContractResult.Available(buildJsonObject {
                        put("action", result.value.action.name)
                        put("receipt", result.value.receipt?.let { ContractCodec.json.encodeToJsonElement(it) } ?: JsonNull)
                    }, result.diagnostics))
                }
            }
        }
    }
    private fun preview(result: ContractResult<ImportPreview>): String = when (result) {
        is ContractResult.Unavailable -> resultJson<JsonElement>(result)
        is ContractResult.Available -> {
            val token = (++next).toString()
            previews[token] = result.value
            resultJson(ContractResult.Available(buildJsonObject {
                put("token", token)
                put("incomingDetails", ContractCodec.json.encodeToJsonElement(result.value.incomingDetails))
                put("existingDetails", result.value.existingDetails?.let { ContractCodec.json.encodeToJsonElement(it) } ?: JsonNull)
                put("actions", JsonArray(result.value.actions.map { JsonPrimitive(it.name) }))
            }, result.diagnostics))
        }
    }
}

/** Static asset IO is supplied by the browser; catalog search and resolution stay shared. */
private class WebContent(private val call: (String, String) -> Promise<String>) : ContentSource {
    private suspend inline fun <reified T> request(op: String, payload: JsonElement): ContractResult<T> =
        readResult(awaitText(call(op, payload.toString())), "content.load")
    override suspend fun listPackages() = request<List<PackageManifest>>("listPackages", JsonNull)
    override suspend fun loadIndex(packageId: String, indexId: String) = request<ContentIndex>("loadIndex", JsonArray(listOf(JsonPrimitive(packageId), JsonPrimitive(indexId))))
    override suspend fun loadChunk(packageId: String, chunkId: String) = request<EntryChunk>("loadChunk", JsonArray(listOf(JsonPrimitive(packageId), JsonPrimitive(chunkId))))
}

@JsExport
class WebContentCatalog(private val call: (String, String) -> Promise<String>) {
    private var catalog: ContentCatalog? = null
    fun open(standard: String, packagesJson: String): Promise<String> = asyncJson {
        catalog = null
        when (val result = ContentCatalog.open(WebContent(call), standard, ContractCodec.json.decodeFromString<List<PackageRevision>>(packagesJson))) {
            is ContractResult.Unavailable -> resultJson<JsonElement>(result)
            is ContractResult.Available -> {
                catalog = result.value
                resultJson(ContractResult.Available(result.value.packages, result.diagnostics))
            }
        }
    }
    fun search(query: String): String = resultJson(ContractResult.Available(JsonArray(requireNotNull(catalog).search(query).map {
        buildJsonObject {
            put("metadata", ContractCodec.json.encodeToJsonElement(it.metadata))
            put("supplier", ContractCodec.json.encodeToJsonElement(it.supplier))
        }
    })))
    fun lookup(id: String): Promise<String> = asyncJson {
        when (val result = requireNotNull(catalog).lookup(id)) {
            is ContractResult.Unavailable -> resultJson<JsonElement>(result)
            is ContractResult.Available -> resultJson(ContractResult.Available(result.value?.let {
                buildJsonObject {
                    put("entry", ContractCodec.json.encodeToJsonElement(it.entry))
                    put("supplier", ContractCodec.json.encodeToJsonElement(it.supplier))
                    put("fingerprint", it.fingerprint)
                }
            }, result.diagnostics))
        }
    }
}
