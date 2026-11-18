package dev.modern4e.builder

import android.content.res.AssetManager
import kotlinx.serialization.decodeFromString
import java.lang.ref.SoftReference
import java.util.concurrent.ConcurrentHashMap

/** Reads the exact generated packages bundled by Gradle; logical IDs cannot escape assets. */
class AndroidContentSource(private val assets: AssetManager) : ContentSource {
    /**
     * Bundled assets never change while the app runs, so decoded chunks are reused across evaluations.
     * Soft references let the runtime reclaim them under memory pressure instead of crashing.
     */
    private val chunks = ConcurrentHashMap<String, SoftReference<EntryChunk>>()
    private fun path(vararg ids: String): String {
        require(ids.all { it.matches(Regex("[A-Za-z0-9_.-]+")) && it != "." && it != ".." }) { "Invalid logical asset IDs: ${ids.toList()}" }
        return "content/" + ids.joinToString("/")
    }
    private fun text(path: String) = assets.open(path).bufferedReader(Charsets.UTF_8).use { it.readText() }
    private fun <T> read(block: () -> ContractResult<T>): ContractResult<T> = try {
        block()
    } catch (error: Exception) {
        ContractResult.Unavailable(listOf(Diagnostic("android.content.read", DiagnosticKind.IO_FAILURE, error.message ?: "Cannot read bundled content")))
    }
    override suspend fun listPackages(): ContractResult<List<PackageManifest>> = read {
        val manifests = mutableListOf<PackageManifest>()
        for (id in text("content-packages.txt").lineSequence().filter { it.isNotBlank() }.toList()) {
            when (val result = ContractCodec.decodeManifest(text(path(id, "manifest.json")))) {
                is ContractResult.Unavailable -> return@read result
                is ContractResult.Available -> {
                    require(result.value.id == id) { "Package directory and ID differ" }
                    manifests += result.value
                }
            }
        }
        ContractResult.Available(manifests)
    }
    override suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex> = read {
        ContractResult.Available(ContractCodec.json.decodeFromString<ContentIndex>(text(path(packageId, "$indexId.json"))))
    }
    override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> = read {
        val key = path(packageId, "$chunkId.json")
        val cached = chunks[key]?.get()
        if (cached != null) {
            return@read ContractResult.Available(cached)
        }
        val chunk = ContractCodec.json.decodeFromString<EntryChunk>(text(key))
        chunks[key] = SoftReference(chunk)
        ContractResult.Available(chunk)
    }
}
