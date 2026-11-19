package dev.modern4e.builder

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

/** Checked rows carry the definitions needed to preview ancestry and advancement entries. */
data class BuilderOptionRow(
    val metadata: CatalogEntry,
    val option: BuilderOption? = null,
    val checked: Boolean = false,
    val diagnostics: List<Diagnostic> = emptyList(),
    val ancestryGrants: List<ContentEntry> = emptyList(),
    val advancementDefinitions: Map<String, ContentEntry> = emptyMap(),
)

/** Reads optional advancement feature references which are separate from automatic grants. */
fun ContentEntry.advancementModificationIds(): List<String> {
    val modifications = sharedData?.get("modifications") as? JsonArray ?: return emptyList()
    return modifications.mapNotNull { item ->
        (item as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotBlank() }?.content
    }.distinct()
}

/**
 * An explicit browsing snapshot for one character/slot and installed content. It retains checked rows
 * and prepared facts across tabs/reopens. Reuse only while the same candidates and rules inputs
 * apply to this slot. Callers serialize access and choose batch sizes so cancellation can stop work
 * between batches.
 */
class BuilderOptionListing internal constructor(
    private val choices: ChoiceEvaluation,
    private val document: CharacterDocument,
    private val level: Int,
    private val slot: ChoiceSlotId,
    private val catalog: ContentCatalog,
    private val newInstanceId: String?,
    private val featClasses: Set<String>?,
    private val featAncestries: Set<String>,
) {
    private val groups = mutableMapOf<FeatGroup?, List<CatalogEntry>>()
    private val checked = mutableMapOf<String, BuilderOptionRow>()
    private val known = mutableMapOf<String, CatalogEntry>()

    /** Index-only for current production metadata; older packages may need definition reads for grouping. */
    suspend fun rows(group: FeatGroup? = null): List<BuilderOptionRow> {
        val metadata = groups[group] ?: choices.metadata(document, level, slot, group).filter {
            it.metadata.matchesFeatAncestries(featAncestries) &&
                (group != FeatGroup.CLASS || featClasses == null || it.metadata.matchesFeatClasses(featClasses))
        }.also {
            groups[group] = it
            known.putAll(it.associateBy { entry -> entry.metadata.id })
        }
        return metadata.map { checked[it.metadata.id] ?: BuilderOptionRow(it) }
    }

    /** Check only requested, previously offered rows. Completed results are reused without further reads. */
    suspend fun check(ids: List<String>): List<BuilderOptionRow> {
        val result = mutableListOf<BuilderOptionRow>()
        for (id in ids.distinct()) {
            val metadata = known[id] ?: continue
            val row = checked[id] ?: run {
                val option = choices.option(document, level, slot, id, newInstanceId)
                val diagnostics = option?.diagnostics ?: when (val resolved = catalog.lookup(id)) {
                    is ContractResult.Unavailable -> resolved.diagnostics
                    is ContractResult.Available -> listOf(Diagnostic("builder.optionUnavailable", DiagnosticKind.UNRESOLVED_CONTENT,
                        "This entry is unavailable for the requested slot.", slot, id))
                }
                val entry = option?.entry?.entry
                val ancestryGrants = if (entry?.category == EntryCategory.ANCESTRY) {
                    entry.mechanics.grants.filterIsInstance<Grant.Entry>().mapNotNull { grant ->
                        (catalog.lookup(grant.entryId) as? ContractResult.Available)?.value?.entry
                    }
                } else {
                    emptyList()
                }
                val advancementDefinitions = when (entry?.category) {
                    EntryCategory.THEME, EntryCategory.PARAGON_PATH, EntryCategory.EPIC_DESTINY -> {
                        val references = entry.mechanics.grants.filterIsInstance<Grant.Entry>().map { it.entryId } +
                            entry.advancementModificationIds()
                        references.distinct().mapNotNull { reference ->
                            (catalog.lookup(reference) as? ContractResult.Available)?.value?.entry
                        }.associateBy { it.id }
                    }
                    else -> emptyMap()
                }
                BuilderOptionRow(metadata, option, true, diagnostics, ancestryGrants, advancementDefinitions)
                    .also { checked[id] = it }
            }
            result += row
        }
        return result
    }
}
