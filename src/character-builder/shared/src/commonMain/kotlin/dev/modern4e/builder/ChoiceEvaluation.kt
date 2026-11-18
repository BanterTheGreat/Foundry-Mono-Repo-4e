package dev.modern4e.builder

/**
 * One implementation for listing choices and validating one requested entry. Candidate activation
 * remains in the engine; callers never need to enumerate alternatives to validate a selection.
 * Prepared content belongs to the enclosing builder operation and is released with it.
 */
internal class ChoiceEvaluation(
    private val catalog: ContentCatalog,
    private val evaluate: suspend (CharacterDocument) -> BuilderState,
    private val prepare: suspend (CharacterDocument) -> RulesContent,
) {
    private data class Selection(val ids: List<String>, val instance: String)

    suspend fun options(document: CharacterDocument, level: Int, slot: ChoiceSlotId,
        includeIneligible: Boolean): List<BuilderOption> {
        val selection = selection(document, level, slot) ?: return emptyList()
        val result = mutableListOf<BuilderOption>()
        for (id in selection.ids) {
            val option = candidate(document, level, slot, id, selection.instance) ?: continue
            if (includeIneligible || option.eligibility == Eligibility.ELIGIBLE) {
                result += option
            }
        }
        return result
    }

    /** Validate membership and only the requested candidate, using the same path as a choice list. */
    suspend fun option(document: CharacterDocument, level: Int, slot: ChoiceSlotId, id: String): BuilderOption? {
        val selection = selection(document, level, slot) ?: return null
        if (id !in selection.ids) {
            return null
        }
        return candidate(document, level, slot, id, selection.instance)
    }

    private suspend fun selection(document: CharacterDocument, level: Int, slot: ChoiceSlotId): Selection? {
        if (level !in 1..document.level) {
            return null
        }
        val current = evaluate(document)
        val offered = current.rules.choices.singleOrNull { it.slot == slot }
        if (offered?.optional == true && offered.acquisitionLevel != level) {
            return null
        }
        val category = rootCategory(level, slot)
        val ids = if (category != null) catalog.search(category = category).map { it.metadata.id }
            else offered?.entries?.map { it.entryId }.orEmpty()
        val existing = document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
        val instance = if (offered?.optional == true) ModernCreation.grantInstance(slot.sourceInstanceId, slot.choiceId)
            else existing?.instanceId ?: "builder-preview:${slot.sourceInstanceId.length}:${slot.sourceInstanceId}:${slot.choiceId}:${slot.ordinal}"
        return Selection(ids, instance)
    }

    private suspend fun candidate(document: CharacterDocument, level: Int, slot: ChoiceSlotId,
        id: String, instance: String): BuilderOption? {
        val definition = (catalog.lookup(id) as? ContractResult.Available)?.value ?: return null
        val saved = SavedSelection(id, definition.entry.presentation.title, definition.supplier.packageId, definition.fingerprint)
        val entry = EntryChoice(instance, slot, saved)
        val levels = if (document.levels.any { it.level == level }) document.levels else document.levels + LevelDecisions(level)
        val candidate = document.copy(levels = levels.map { decisions ->
            decisions.copy(entries = decisions.entries.filterNot { it.slot == slot } +
                if (decisions.level == level) listOf(entry) else emptyList())
        })
        // Legacy coverage gates use the complete diagnostic stream. V2 separates eligibility
        // from statistic coverage, so unrelated choices and totals need not be calculated here.
        val rules = if (definition.entry.mechanics.version >= 2) {
            RulesEngine.evaluateChoice(candidate, prepare(candidate), instance)
        } else {
            evaluate(candidate).rules
        }
        val diagnostics = rules.diagnostics.filter { it.slot == slot && it.entryId == id }
        val status = if (definition.entry.mechanics.version >= 2) {
            rules.entryEligibility[instance]?.status ?: Eligibility.UNRESOLVED
        } else when {
            diagnostics.any { it.kind == DiagnosticKind.INVALID_SELECTION } -> Eligibility.INELIGIBLE
            diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT } -> Eligibility.UNRESOLVED
            diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION } -> Eligibility.INCOMPLETE
            else -> Eligibility.ELIGIBLE
        }
        return BuilderOption(definition, status, diagnostics)
    }

    private fun rootCategory(level: Int, slot: ChoiceSlotId): EntryCategory? {
        if (slot.ordinal != 0) {
            return null
        }
        if (level == 2 && slot == ChoiceSlotId("advancement.2", "feat", 0)) {
            return EntryCategory.FEAT
        }
        if (level != 1 || slot.sourceInstanceId != "creation") {
            return null
        }
        return when (slot.choiceId) {
            "class" -> EntryCategory.CLASS
            "ancestry" -> EntryCategory.ANCESTRY
            "theme" -> EntryCategory.THEME
            "feat" -> EntryCategory.FEAT
            else -> null
        }
    }
}
