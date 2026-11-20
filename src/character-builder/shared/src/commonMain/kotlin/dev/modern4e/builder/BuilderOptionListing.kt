package dev.modern4e.builder

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

/** Checked rows carry the definitions needed for split-reader previews. */
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
    private val retained = mutableMapOf<String, BuilderOptionRow>()

    /**
     * Carry catalog content into a new character snapshot. Eligibility is copied only when the caller
     * can prove independence; otherwise the definition stays readable but the row must be checked again.
     * Metadata and membership are always obtained from the new snapshot before a retained row is exposed.
     */
    fun inheritFrom(previous: BuilderOptionListing, retainEligibility: (ContentEntry) -> Boolean) {
        for ((id, row) in previous.retained + previous.checked) {
            val entry = row.option?.entry?.entry ?: continue
            retained[id] = if (row.checked && retainEligibility(entry)) row else row.copy(
                checked = false,
                option = row.option.copy(eligibility = Eligibility.UNRESOLVED, diagnostics = emptyList(), unmet = emptyList()),
                diagnostics = emptyList(),
            )
        }
    }

    /** Index-only for current production metadata; older packages may need definition reads for grouping. */
    suspend fun rows(group: FeatGroup? = null): List<BuilderOptionRow> {
        val metadata = groups[group] ?: choices.metadata(document, level, slot, group).filter {
            it.metadata.matchesFeatAncestries(featAncestries) &&
                (group != FeatGroup.CLASS || featClasses == null || it.metadata.matchesFeatClasses(featClasses))
        }.also {
            groups[group] = it
            known.putAll(it.associateBy { entry -> entry.metadata.id })
        }
        return metadata.map { entry ->
            val id = entry.metadata.id
            checked[id] ?: retained[id]?.takeIf { it.metadata == entry }?.also {
                if (it.checked) {
                    checked[id] = it
                }
            } ?: BuilderOptionRow(entry)
        }
    }

    /**
     * Whether [group] has been listed and every one of its rows is checked, so background work has nothing left to do
     * for it. A listing rebased onto a newer character reports false until its rows are listed again, even if every
     * retained result carries over. Callers serialize access like every other call.
     */
    fun isComplete(group: FeatGroup? = null): Boolean =
        groups[group]?.all { checked.containsKey(it.metadata.id) } == true

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
                val previous = retained[id]?.takeIf { it.option?.entry?.entry == entry }
                val advancementDefinitions = previous?.advancementDefinitions ?: when (entry?.category) {
                    EntryCategory.ANCESTRY, EntryCategory.FEATURE -> previewDefinitions(entry)
                    EntryCategory.THEME, EntryCategory.PARAGON_PATH, EntryCategory.EPIC_DESTINY -> {
                        val references = entry.mechanics.grants.filterIsInstance<Grant.Entry>().map { it.entryId } +
                            entry.advancementModificationIds()
                        references.distinct().mapNotNull { reference ->
                            (catalog.lookup(reference) as? ContractResult.Available)?.value?.entry
                        }.associateBy { it.id }
                    }
                    else -> emptyMap()
                }
                val ancestryGrants = if (entry?.category == EntryCategory.ANCESTRY) {
                    entry.mechanics.grants.filterIsInstance<Grant.Entry>().mapNotNull { advancementDefinitions[it.entryId] }
                } else {
                    emptyList()
                }
                BuilderOptionRow(metadata, option, true, diagnostics, ancestryGrants, advancementDefinitions)
                    .also { checked[id] = it }
            }
            result += row
        }
        if (fullyChecked()) {
            // Every offered row is checked; keep the rows, not the characters evaluated to produce them.
            choices.release()
        }
        return result
    }

    /**
     * Whether nothing is left to check. A feat listing also waits until every tab has been listed, because
     * its tabs are normally checked back to back and share the same prepared facts.
     */
    private fun fullyChecked(): Boolean =
        checked.size == known.size && (slot.choiceId != "feat" || FeatGroup.entries.all { it in groups })

    /** Only complete, resolved snapshots can prove independence from another selection. */
    private fun checkedEntries(): List<ContentEntry>? {
        if (known.isEmpty() || !fullyChecked()) {
            return null
        }
        return checked.values.map { it.option?.entry?.entry ?: return null }
    }

    /** Check the authored dependencies of powers with extra requirements, such as skill utilities. */
    fun canIgnoreFeatChange(feat: ContentEntry): Boolean {
        val entries = checkedEntries() ?: return false
        val mechanics = feat.mechanics
        val indirect = mechanics.grants.any { it is Grant.Entry } || mechanics.progression.isNotEmpty() ||
            mechanics.choices.isNotEmpty() || mechanics.facts.isNotEmpty() || mechanics.factLinks.isNotEmpty() ||
            mechanics.classProfile != null
        val classes = catalog.search(category = EntryCategory.CLASS).map { it.metadata.id }.toSet()
        return entries.all { entry ->
            val power = entry.mechanics
            entry.category == EntryCategory.POWER && power.version == 2 && power.powerProfile != null &&
                power.copy(prerequisites = emptyList(), access = null, maximumSelections = null,
                    unsupported = emptyList(), powerProfile = null) == Mechanics(version = 2) &&
                (power.prerequisites + listOfNotNull(power.access)).flatMap { it.leaves() }.all { condition ->
                    when (condition) {
                        is Prerequisite.Always, is Prerequisite.Level, is Prerequisite.Unavailable,
                        is Prerequisite.Unresolved, is Prerequisite.Unadapted -> true
                        is Prerequisite.Entry -> condition.entryId in classes ||
                            condition.entryId != feat.id && !indirect
                        is Prerequisite.Proficiency -> !indirect && mechanics.grants.none {
                            it is Grant.Proficiency && it.skill == condition.skill
                        }
                        is Prerequisite.AbilityPoints -> !indirect && mechanics.conditionalModifiers.isEmpty() &&
                            mechanics.modifiers.none { it.target.statistic == Statistic.ABILITY_POINTS && it.target.ability == condition.ability }
                        is Prerequisite.EquipmentProficiency -> !indirect && mechanics.armorAdvancement == null &&
                            condition.equipment !in mechanics.equipmentProficiencies
                        is Prerequisite.ClassPowerSource -> !indirect && mechanics.multiclassFor == null
                        is Prerequisite.Size -> !indirect && mechanics.size == null
                        is Prerequisite.Selected -> !indirect && (condition.category != EntryCategory.FEAT || mechanics.multiclassFor == null)
                        is Prerequisite.AllOf, is Prerequisite.AnyOf -> false
                    }
                }
        }
    }

    /** A passive power still matters to lists that name it or ask for selected powers. */
    fun canIgnorePowerChange(power: ContentEntry): Boolean {
        val entries = checkedEntries() ?: return false
        return entries.all { entry ->
            entry.mechanics.version == 2 && entry.id != power.id &&
                (entry.mechanics.prerequisites + listOfNotNull(entry.mechanics.access)).flatMap { it.leaves() }.none {
                    it is Prerequisite.Entry && it.entryId == power.id ||
                        it is Prerequisite.Selected && it.category == EntryCategory.POWER &&
                        it.filters.usage == power.mechanics.powerProfile?.usage
                }
        }
    }

    /** Load nested grants and explicitly offered alternatives for the detail reader. */
    private suspend fun previewDefinitions(root: ContentEntry): Map<String, ContentEntry> {
        val entries = linkedMapOf<String, ContentEntry>()
        val seen = mutableSetOf(root.id)
        suspend fun visit(entry: ContentEntry) {
            val mechanics = entry.mechanics
            val grants = mechanics.grants + mechanics.progression.flatMap { it.grants }
            val choices = mechanics.choices + mechanics.progression.flatMap { it.choices }
            val references = grants.filterIsInstance<Grant.Entry>().flatMap { listOf(it.entryId) + it.replacementEntryIds } +
                choices.filterIsInstance<ChoiceDefinition.Entries>().flatMap { it.entryIds }
            for (id in references) {
                if (seen.add(id)) {
                    val resolved = (catalog.lookup(id) as? ContractResult.Available)?.value?.entry ?: continue
                    entries[id] = resolved
                    visit(resolved)
                }
            }
        }
        visit(root)
        return entries
    }

}
