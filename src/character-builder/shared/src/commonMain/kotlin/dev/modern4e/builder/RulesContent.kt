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
 * Metadata lacks power facts, so active power queries retain the complete power catalog.
 */
internal class RulesContentPreparation(catalog: ContentCatalog) {
    private val reading = catalog.readSession()
    private val dependencies = mutableMapOf<Pair<String, Int>, List<String>>()
    private var powerIds: List<String>? = null

    suspend fun load(document: CharacterDocument): RulesContent {
        val entries = linkedMapOf<String, ContractResult<ResolvedEntry>>()
        val selections = linkedMapOf<SavedSelection, ContractResult<ResolvedEntry>>()
        val pending = mutableListOf<String>()
        val scheduled = mutableSetOf<String>()
        fun enqueue(ids: List<String>) {
            for (id in ids) {
                if (scheduled.add(id)) {
                    pending += id
                }
            }
        }
        val saved = document.levels.flatMap { level ->
            level.entries.map { it.selection } + level.replacements.map { it.replacement.selection }
        } + document.equipment.filter { it.equipped }.map { it.selection }
        for (selection in saved.distinct()) {
            val resolved = reading.resolve(selection)
            selections[selection] = resolved
            if (resolved is ContractResult.Available) {
                enqueue(dependencies(resolved.value.entry, document.level))
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
                enqueue(dependencies(resolved.value.entry, document.level))
            }
        }
        return RulesContent(entries.toMap(), selections.toMap(), reading.diagnostics)
    }

    private fun dependencies(entry: ContentEntry, level: Int): List<String> =
        dependencies.getOrPut(entry.id to level) {
            val mechanics = entry.mechanics
            val progression = mechanics.progression.filter { it.level <= level }
            val choices = (mechanics.choices + progression.flatMap { it.choices })
                .filterIsInstance<ChoiceDefinition.Entries>().filter { it.atLevel <= level }
            val grants = (mechanics.grants + progression.flatMap { it.grants })
                .filterIsInstance<Grant.Entry>().filter { it.atLevel <= level }
            val queried = if (choices.any { it.query?.category == EntryCategory.POWER }) {
                powerIds ?: reading.search(category = EntryCategory.POWER).map { it.metadata.id }.also { powerIds = it }
            } else emptyList()
            listOfNotNull(mechanics.multiclassFor) + queried +
                grants.flatMap { listOf(it.entryId) + it.replacementEntryIds } + choices.flatMap { it.entryIds } +
                (mechanics.prerequisites + listOfNotNull(mechanics.access)).flatMap { it.leaves() }
                    .filterIsInstance<Prerequisite.Entry>().map { it.entryId }
        }
}
