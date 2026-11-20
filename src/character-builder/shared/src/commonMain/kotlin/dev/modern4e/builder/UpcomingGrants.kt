package dev.modern4e.builder

data class UpcomingGrant(val occurrence: EngineEntry, val level: Int, val sourceCategory: EntryCategory)

/** Loads future automatic features and powers from selected advancement sources for the Levels preview. */
suspend fun ContentCatalog.upcomingGrants(state: BuilderState): List<UpcomingGrant> {
    val reading = readSession()
    return upcomingGrants(state) { id ->
        (reading.lookup(id) as? ContractResult.Available)?.value
    }
}

private val upcomingGrantSources = setOf(EntryCategory.ANCESTRY, EntryCategory.CLASS, EntryCategory.THEME,
    EntryCategory.PARAGON_PATH, EntryCategory.EPIC_DESTINY)
private val upcomingGrantCategories = setOf(EntryCategory.FEATURE, EntryCategory.POWER)

/** Walks automatic grants in a read-only preview without activating future choices or modifiers. */
internal suspend fun upcomingGrants(state: BuilderState, lookup: suspend (String) -> ResolvedEntry?): List<UpcomingGrant> {
    val currentLevel = state.document.level
    val active = state.rules.entries.associateBy { it.slot }
    val editable = state.rules.choices.mapTo(mutableSetOf()) { it.slot }
    val output = mutableListOf<UpcomingGrant>()

    suspend fun visit(owner: EngineEntry, level: Int, source: EntryCategory, ancestors: Set<String>) {
        val entry = owner.definition.entry
        if (entry.id in ancestors || entry.mechanics.version !in 1..2) {
            return
        }
        // Every grant the entry can ever make, by the occurrence timeline's per-entry rule.
        val automatic = entry.activation(Int.MAX_VALUE).grants.mapNotNull { (grant, atLevel) -> (grant as? Grant.Entry)?.let { atLevel to it } }
        val counts = automatic.groupingBy { (_, grant) -> grant.grantId }.eachCount()
        for ((atLevel, grant) in automatic) {
            if (grant.grantId.isBlank() || counts[grant.grantId] != 1) {
                continue
            }
            val slot = ChoiceSlotId(owner.instanceId, grant.grantId, 0)
            if (grant.replacementEntryIds.isNotEmpty() || slot in editable) {
                continue
            }
            val acquired = maxOf(level, atLevel, grant.atLevel)
            val child = if (acquired <= currentLevel) {
                active[slot]?.takeIf { it.granted }
            } else {
                lookup(grant.entryId)?.let { definition ->
                    EngineEntry(ModernCreation.grantInstance(owner.instanceId, grant.grantId), slot, definition, granted = true)
                }
            } ?: continue
            val childEntry = child.definition.entry
            if (childEntry.id in ancestors || childEntry.id == entry.id) {
                continue
            }
            if (acquired in (currentLevel + 1)..30 &&
                childEntry.category in upcomingGrantCategories &&
                childEntry.presentation.grantDisplay == GrantDisplay.STANDALONE) {
                output += UpcomingGrant(child, acquired, source)
            }
            visit(child, acquired, source, ancestors + entry.id)
        }
    }

    val acquisitionLevels = state.document.levels.flatMap { row -> row.entries.map { it.instanceId to row.level } }.toMap()
    for (root in state.rules.entries) {
        val category = root.definition.entry.category
        val status = state.rules.entryEligibility[root.instanceId]?.status
        if (!root.granted && category in upcomingGrantSources && status !in setOf(Eligibility.INELIGIBLE, Eligibility.UNRESOLVED)) {
            visit(root, acquisitionLevels[root.instanceId] ?: 1, category, emptySet())
        }
    }
    return output
}
