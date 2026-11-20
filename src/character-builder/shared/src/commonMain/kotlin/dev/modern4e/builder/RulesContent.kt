package dev.modern4e.builder

/** Snapshot prepared outside the pure engine. Saved references never fall back to an ordinary lookup. */
data class RulesContent(
    val entries: Map<String, ContractResult<ResolvedEntry>>,
    val selections: Map<SavedSelection, ContractResult<ResolvedEntry>>,
    val diagnostics: List<Diagnostic> = emptyList(),
) {
    companion object {
        /** A standalone evaluation observes fresh source bytes; a caller may explicitly share a read session. */
        suspend fun load(document: CharacterDocument, catalog: ContentCatalog): RulesContent =
            RulesContentPreparation(catalog).load(document)
    }
}

/**
 * Operation-local content preparation. Reuse while inspecting candidate characters, then discard.
 * Definitions and dependency expansion are shared, but each returned snapshot contains exactly its dependencies.
 * Metadata lacks power facts, so active power queries retain every power the character's classes can select;
 * powers whose index row names another class are never loaded.
 */
internal class RulesContentPreparation(catalog: ContentCatalog) {
    private val reading = catalog.readSession()
    private val dependencies = mutableMapOf<Triple<String, Int, Set<String>>, List<String>>()
    private var powers: List<CatalogEntry>? = null

    suspend fun load(document: CharacterDocument): RulesContent {
        val saved = document.activeLevels.flatMap { level ->
            level.entries.map { it.selection } + level.replacements.map { it.replacement.selection }
        } + document.equipment.filter { it.equipped }.map { it.selection }
        val selections = linkedMapOf<SavedSelection, ContractResult<ResolvedEntry>>()
        val entries = expand(document, saved.distinct(), emptyMap(), selections)
        return RulesContent(entries, selections, reading.diagnostics)
    }

    /** The baseline whose merged entry maps [extensions] holds; another baseline starts it afresh. */
    private var extendedBase: Map<String, ContractResult<ResolvedEntry>>? = null
    private val extensions = mutableMapOf<Set<String>, Map<String, ContractResult<ResolvedEntry>>>()

    /**
     * Content for a document that is [baseline]'s document plus [selection] in one more place: the baseline is
     * reused and only the new selection and the definitions it alone reaches are read. The result equals
     * `load(document)`. Dependencies are a function of each entry, the document's level and its class set, and the
     * saved selections only add, so the caller must pass a [baseline] loaded for a document with the same level and
     * class entry IDs and every saved selection of [document] other than [selection].
     */
    suspend fun extend(baseline: RulesContent, document: CharacterDocument, selection: SavedSelection): RulesContent {
        if (extendedBase !== baseline.entries) {
            extendedBase = baseline.entries
            extensions.clear()
        }
        val selections = LinkedHashMap(baseline.selections)
        val added = expand(document, listOf(selection), baseline.entries, selections)
        if (added.isEmpty()) {
            return RulesContent(baseline.entries, selections, reading.diagnostics)
        }
        // Candidates that reach the same new definitions share one merged map, which also makes comparing them cheap.
        val key = added.keys.toSet()
        val entries = extensions[key] ?: (baseline.entries + added).also {
            if (extensions.size >= MAX_EXTENSIONS) {
                extensions.clear()
            }
            extensions[key] = it
        }
        return RulesContent(entries, selections, reading.diagnostics)
    }

    /**
     * Resolve [saved] into [selections], then follow dependencies, reading only definitions [base] does not already
     * hold. Returns the definitions read, which [base] does not contain.
     */
    private suspend fun expand(document: CharacterDocument, saved: List<SavedSelection>,
        base: Map<String, ContractResult<ResolvedEntry>>,
        selections: MutableMap<SavedSelection, ContractResult<ResolvedEntry>>): Map<String, ContractResult<ResolvedEntry>> {
        val classes = document.classEntryIds()
        val entries = linkedMapOf<String, ContractResult<ResolvedEntry>>()
        val pending = mutableListOf<String>()
        val scheduled = mutableSetOf<String>()
        fun enqueue(ids: List<String>) {
            for (id in ids) {
                if (id !in base && scheduled.add(id)) {
                    pending += id
                }
            }
        }
        for (selection in saved) {
            val resolved = reading.resolve(selection)
            selections[selection] = resolved
            if (resolved is ContractResult.Available) {
                enqueue(dependencies(resolved.value.entry, document.level, classes))
            }
        }
        var index = 0
        while (index < pending.size) {
            val id = pending[index++]
            val found = reading.lookup(id)
            val resolved = when (found) {
                is ContractResult.Unavailable -> found
                is ContractResult.Available -> found.value?.let { ContractResult.Available(it, found.diagnostics) }
                    ?: ContractResult.Unavailable(listOf(Diagnostic("engine.missingDefinition",
                        DiagnosticKind.UNRESOLVED_CONTENT, "Definition $id is unavailable", entryId = id)))
            }
            entries[id] = resolved
            if (resolved is ContractResult.Available) {
                enqueue(dependencies(resolved.value.entry, document.level, classes))
            }
        }
        return entries
    }

    private companion object {
        /** Merged entry maps kept per baseline; a feat list reaches about 30 distinct sets of new definitions. */
        const val MAX_EXTENSIONS = 64
    }

    /** What [entry] activates by [level] (the occurrence timeline's per-entry rule), plus what its conditions name. */
    private fun dependencies(entry: ContentEntry, level: Int, classes: Set<String>): List<String> =
        dependencies.getOrPut(Triple(entry.id, level, classes)) {
            val mechanics = entry.mechanics
            val activation = entry.activation(level)
            val choices = activation.choices.map { it.choice }.filterIsInstance<ChoiceDefinition.Entries>()
            val grants = activation.grants.map { it.grant }.filterIsInstance<Grant.Entry>()
            val queried = if (choices.any { it.query?.category == EntryCategory.POWER }) {
                // A class's own pools always include it, even while a candidate class is being previewed.
                val scope = if (entry.category == EntryCategory.CLASS) classes + entry.id else classes
                (powers ?: reading.search(category = EntryCategory.POWER).also { powers = it })
                    .filter { it.metadata.classId == null || it.metadata.classId in scope }.map { it.metadata.id }
            } else emptyList()
            listOfNotNull(mechanics.multiclassFor) + queried +
                grants.flatMap { listOf(it.entryId) + it.replacementEntryIds } + choices.flatMap { it.entryIds } +
                (mechanics.prerequisites + listOfNotNull(mechanics.access)).flatMap { it.leaves() }
                    .filterIsInstance<Prerequisite.Entry>().map { it.entryId }
        }
}
