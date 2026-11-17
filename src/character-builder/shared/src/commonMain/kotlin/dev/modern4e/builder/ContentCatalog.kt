package dev.modern4e.builder

/** Metadata has no description or fingerprint: those require loading the current definition. */
data class CatalogEntry(val metadata: EntryMetadata, val supplier: PackageRevision)
@kotlinx.serialization.Serializable
data class ResolvedEntry(val entry: ContentEntry, val supplier: PackageRevision, val fingerprint: String, val acknowledgmentRequired: Boolean = false)

/** A catalog is a snapshot of one character's package order. Create a new one after package updates. */
class ContentCatalog private constructor(
    private val source: ContentSource,
    val packages: List<PackageManifest>,
    private val entries: Map<String, CatalogEntry>,
    private val definitions: Map<String, Map<String, EntryMetadata>>,
    val diagnostics: List<Diagnostic>,
) {
    /** Search winning metadata only; never loads a chunk. Ordering is stable across platforms. */
    fun search(query: String = "", category: EntryCategory? = null): List<CatalogEntry> {
        val words = query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        return entries.values.filter { candidate ->
            (category == null || candidate.metadata.category == category) &&
                words.all { it in candidate.metadata.title.lowercase() || it in candidate.metadata.id.lowercase() }
        }.sortedWith(compareBy({ it.metadata.title.lowercase() }, { it.metadata.id }))
    }

    /** An ordinary miss is an available null, unlike a saved selection's missing supplier. */
    suspend fun lookup(entryId: String): ContractResult<ResolvedEntry?> {
        val candidate = entries[entryId] ?: return ContractResult.Available(null)
        return load(candidate)
    }

    /** Expected suppliers must still supply this ID before the current winning definition may be adopted. */
    suspend fun resolve(selection: SavedSelection, deliberatePackageSwitch: Boolean = false): ContractResult<ResolvedEntry> {
        if (!deliberatePackageSwitch) {
            val expected = definitions[selection.supplierPackageId]
                ?: return failure("catalog.expectedSupplier", "Expected package ${selection.supplierPackageId} is unavailable for ${selection.savedTitle}", selection.entryId)
            if (selection.entryId !in expected) {
                return failure("catalog.expectedEntry", "Expected package no longer supplies ${selection.savedTitle}", selection.entryId)
            }
        }
        val candidate = entries[selection.entryId]
            ?: return failure("catalog.expectedEntry", "Entry ${selection.savedTitle} is unavailable", selection.entryId)
        return when (val loaded = load(candidate)) {
            is ContractResult.Unavailable -> loaded
            is ContractResult.Available -> {
                val changed = loaded.value.fingerprint != selection.acknowledgedFingerprint ||
                    loaded.value.supplier.packageId != selection.supplierPackageId
                ContractResult.Available(loaded.value.copy(acknowledgmentRequired = changed), loaded.diagnostics)
            }
        }
    }

    /** Presentation reference IDs resolve through this same character's winning definitions. */
    suspend fun resolveReferences(entry: ResolvedEntry): Map<String, ContractResult<ResolvedEntry?>> {
        val result = linkedMapOf<String, ContractResult<ResolvedEntry?>>()
        for (id in entry.entry.presentation.references) {
            result[id] = lookup(id)
        }
        return result
    }

    private suspend fun load(candidate: CatalogEntry): ContractResult<ResolvedEntry> {
        val metadata = candidate.metadata
        return when (val result = source.loadChunk(candidate.supplier.packageId, metadata.chunkId)) {
            is ContractResult.Unavailable -> result
            is ContractResult.Available -> {
                val chunk = result.value
                val matches = chunk.entries.filter { it.id == metadata.id }
                if (chunk.id != metadata.chunkId || chunk.entries.map { it.id }.distinct().size != chunk.entries.size ||
                    matches.size != 1 || matches.single().category != metadata.category || matches.single().presentation.title != metadata.title) {
                    failure("catalog.chunk", "Chunk does not match indexed definition ${metadata.id}", metadata.id)
                } else {
                    val entry = matches.single()
                    val incomplete = entry.coverage.status != CoverageStatus.SUPPORTED || entry.mechanics.prerequisites.any { it is Prerequisite.Unadapted }
                    val notices = if (incomplete) listOf(Diagnostic("catalog.incomplete", DiagnosticKind.INCOMPLETE_AUTOMATION,
                        "Automation is incomplete: ${entry.coverage.limitations.joinToString()}", entryId = entry.id)) else emptyList()
                    ContractResult.Available(ResolvedEntry(entry, candidate.supplier, ContractCodec.fingerprint(entry)), result.diagnostics + notices)
                }
            }
        }
    }

    companion object {
        /**
         * Standard is always first. Saved revisions are history, not pins; dependencies require exact installed revisions.
         * Missing/unusable packages are diagnosed and excluded, leaving unrelated content accessible.
         * No dependencies are implicitly enabled, reordered, or fetched by the shared catalog.
         */
        suspend fun open(source: ContentSource, standardPackageId: String, enabled: List<PackageRevision>): ContractResult<ContentCatalog> {
            val listed = source.listPackages()
            if (listed is ContractResult.Unavailable) {
                return listed
            }
            listed as ContractResult.Available
            val manifests = listed.value
            val ids = enabled.map { it.packageId }
            if (ids.distinct().size != ids.size || manifests.map { it.id }.distinct().size != manifests.size) {
                return failure("catalog.duplicatePackage", "Package IDs must be unique")
            }
            val installed = manifests.associateBy { it.id }
            val order = listOf(standardPackageId) + ids.filter { it != standardPackageId }
            val requested = order.toSet()
            val notices = listed.diagnostics.toMutableList()
            val usable = mutableMapOf<String, Boolean>()
            fun check(id: String, visiting: Set<String> = emptySet()): Boolean {
                usable[id]?.let { return it }
                val manifest = installed[id]
                val valid = manifest != null && id in requested && id !in visiting && manifest.formatVersion in 1..2 &&
                    manifest.dependencies.all { dependency ->
                        installed[dependency.packageId]?.revision == dependency.revision && check(dependency.packageId, visiting + id)
                    }
                usable[id] = valid
                return valid
            }
            val selected = order.mapNotNull { id ->
                if (!check(id)) {
                    notices += Diagnostic("catalog.packageUnavailable", DiagnosticKind.UNRESOLVED_CONTENT,
                        "Package $id is missing, incompatible, or has unavailable/cyclic dependencies")
                    null
                } else {
                    installed.getValue(id)
                }
            }
            if (selected.none { it.id == standardPackageId }) {
                return failure("catalog.standardUnavailable", "Standard package $standardPackageId is unusable")
            }
            val winners = linkedMapOf<String, CatalogEntry>()
            val definitions = linkedMapOf<String, Map<String, EntryMetadata>>()
            for (manifest in selected) {
                if (manifest.indexes.distinct().size != manifest.indexes.size || manifest.chunks.distinct().size != manifest.chunks.size) {
                    return failure("catalog.manifest", "Duplicate asset IDs in ${manifest.id}")
                }
                val metadata = linkedMapOf<String, EntryMetadata>()
                for (indexId in manifest.indexes) {
                    when (val index = source.loadIndex(manifest.id, indexId)) {
                        is ContractResult.Unavailable -> return index
                        is ContractResult.Available -> {
                            notices += index.diagnostics
                            for (entry in index.value.entries) {
                                if (entry.id.isBlank() || entry.chunkId !in manifest.chunks || metadata.put(entry.id, entry) != null) {
                                    return failure("catalog.index", "Invalid or duplicate metadata in ${manifest.id}: ${entry.id}", entry.id)
                                }
                            }
                        }
                    }
                }
                definitions[manifest.id] = metadata.toMap()
                for ((id, entry) in metadata) {
                    winners[id] = CatalogEntry(entry, PackageRevision(manifest.id, manifest.revision))
                }
            }
            val catalog = ContentCatalog(source, selected.toList(), winners.toMap(), definitions.toMap(), notices.toList())
            return ContractResult.Available(catalog, catalog.diagnostics)
        }

        private fun failure(code: String, message: String, entryId: String? = null): ContractResult.Unavailable =
            ContractResult.Unavailable(listOf(Diagnostic(code, DiagnosticKind.UNRESOLVED_CONTENT, message, entryId = entryId)))
    }
}
