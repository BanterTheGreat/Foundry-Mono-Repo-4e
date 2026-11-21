package dev.modern4e.builder

/** Edits contain decisions only; callers supply IDs and timestamps, never platform services. */
sealed class BuilderEdit {
    data class LaterDecisions(val value: LevelDecisions) : BuilderEdit()
    data class Batch(val edits: List<BuilderEdit>) : BuilderEdit()
    data class RemoveProficiency(val slots: Set<ChoiceSlotId>) : BuilderEdit()
    data class Identity(val value: CharacterIdentity) : BuilderEdit()
    data class Allocation(val value: AbilityAllocation) : BuilderEdit()
    data class Level(val value: Int) : BuilderEdit()
    data class Advancement(val level: Int, val value: AbilityAdvancement?) : BuilderEdit()
    data class Entry(val level: Int, val slot: ChoiceSlotId, val entryId: String, val instanceId: String,
        val acceptIneligible: Boolean = false) : BuilderEdit()
    data class ReplacePower(val level: Int, val slot: ChoiceSlotId, val entryId: String,
        val kind: ReplacementKind = ReplacementKind.RETRAINING, val acceptIneligible: Boolean = false) : BuilderEdit()
    data class RemoveEntry(val slot: ChoiceSlotId) : BuilderEdit()
    data class RemoveReplacement(val level: Int, val slot: ChoiceSlotId) : BuilderEdit()
    data class Proficiency(val level: Int, val value: ProficiencyChoice) : BuilderEdit()
    data class Value(val level: Int, val value: ValueChoice) : BuilderEdit()
    /** Changing background preserves its skill unless the caller explicitly supplies a replacement. */
    data class Background(val kind: BackgroundKind, val name: String, val skill: Skill? = null) : BuilderEdit()
    data class Equipment(val value: EquipmentSelection) : BuilderEdit()
    data class RemoveEquipment(val instanceId: String) : BuilderEdit()
    data class CraftKnowledge(val kind: CraftKnowledgeKind, val entryIds: Set<String>) : BuilderEdit()
    data class Adjustment(val value: ManualAdjustment) : BuilderEdit()
    data class RemoveAdjustment(val id: String) : BuilderEdit()
}

enum class BackgroundKind { ENVIRONMENT, UPBRINGING }

data class BuilderState(val document: CharacterDocument, val rules: EngineResult)
data class BuilderResult(val state: BuilderState, val applied: Boolean, val diagnostics: List<Diagnostic> = emptyList())
/** [unmet] carries the typed conditions behind [eligibility]; [diagnostics] only present them. */
data class BuilderOption(val entry: ResolvedEntry, val eligibility: Eligibility, val diagnostics: List<Diagnostic>,
    val unmet: List<UnmetCondition> = emptyList())

/** Shared editing coordinator. Catalog reads are its only dependency; it never saves or exports. */
class BuilderOperations private constructor(private val catalog: ContentCatalog, private val operation: Boolean) {
    constructor(catalog: ContentCatalog) : this(catalog, false)

    private val preparation by lazy { RulesContentPreparation(catalog) }
    private val evaluated = mutableMapOf<CharacterDocument, BuilderState>()

    /** Decoded content and calculations live for one command, never across content refreshes. */
    private fun operation() = if (operation) this else BuilderOperations(catalog.readSession(), true)
    /** Direct creation through level 20; incomplete decisions remain exportable. */
    suspend fun create(id: String, savedAt: String, identity: CharacterIdentity, packages: List<PackageRevision>,
        abilities: AbilityAllocation, level: Int = 1): BuilderState {
        require(level in 1..AdvancementRules.LAST_ENFORCED_LEVEL)
        val document = CharacterDocument(id = id, savedAt = savedAt, identity = identity, packages = packages,
            level = level, abilities = abilities, levels = (1..level).map { LevelDecisions(it) })
        require(ContractCodec.encodeChecked(document) is ContractResult.Available)
        return evaluate(document)
    }

    /** Refresh resolution after every edit; no existing decision is silently pruned. */
    suspend fun evaluate(document: CharacterDocument): BuilderState {
        if (!operation) {
            return operation().evaluate(document)
        }
        evaluated[document]?.let { return it }
        return BuilderState(document, RulesEngine.evaluate(document, preparation.load(document))).also {
            evaluated[document] = it
            if (evaluated.size > 2) {
                evaluated.remove(evaluated.keys.first())
            }
        }
    }

    /** Root and child entry options share engine eligibility. Unknown/ineligible options require explicit opt-in. */
    suspend fun options(document: CharacterDocument, level: Int, slot: ChoiceSlotId,
        includeIneligible: Boolean = false): List<BuilderOption> {
        if (!operation) {
            return operation().options(document, level, slot, includeIneligible)
        }
        return choiceEvaluation().options(document.forChoiceAt(level), level, slot, includeIneligible)
    }

    /** Replacement browsing replays each candidate at its actual replacement level. */
    suspend fun replacementOptions(document: CharacterDocument, level: Int, slot: ChoiceSlotId,
        kind: ReplacementKind = ReplacementKind.PROGRESSION): List<BuilderOption> {
        if (!operation) {
            return operation().replacementOptions(document, level, slot, kind)
        }
        if (level !in 1..30) {
            return emptyList()
        }
        val historical = document.atLevel(level)
        val state = evaluate(historical)
        val current = state.rules.entries.singleOrNull { it.slot == slot && !it.granted } ?: return emptyList()
        val seed = Replacement(slot, EntryChoice(current.instanceId, slot, SavedSelection(current.definition.entry.id,
            current.definition.entry.presentation.title, current.definition.supplier.packageId, current.definition.fingerprint)), kind)
        val preview = historical.copy(levels = levels(historical, level).map {
            if (it.level == level) it.copy(replacements = it.replacements.filterNot { change ->
                change.replaces == slot || kind == ReplacementKind.PROGRESSION && change.kind == ReplacementKind.PROGRESSION
            } + seed) else it
        })
        val offered = evaluate(preview).rules.choices.singleOrNull { it.slot == slot }?.entries.orEmpty()
        return offered.mapNotNull { candidate ->
            val definition = (catalog.lookup(candidate.entryId) as? ContractResult.Available)?.value ?: return@mapNotNull null
            val replacement = seed.copy(replacement = seed.replacement.copy(selection = saved(definition)))
            val candidateDocument = preview.copy(levels = preview.levels.map { row ->
                if (row.level == level) row.copy(replacements = row.replacements.filterNot { it.replaces == slot } + replacement) else row
            })
            val rules = RulesEngine.evaluateChoice(candidateDocument, preparation.load(candidateDocument), current.instanceId)
            if (rules.slotIssues[slot].orEmpty().any { it is SlotIssue.Timing }) {
                return@mapNotNull null
            }
            val eligibility = rules.entryEligibility[current.instanceId] ?: return@mapNotNull null
            BuilderOption(definition, eligibility.status, eligibility.diagnostics, eligibility.unmet)
        }
    }

    private fun choiceEvaluation() = ChoiceEvaluation(catalog, { evaluate(it) }, { preparation.load(it) },
        extend = { baseline, document, selection -> preparation.extend(baseline, document, selection) })

    /** Read multiple saved definitions using the same catalog read session. */
    suspend fun resolveSelections(selections: Set<SavedSelection>): Map<SavedSelection, ContentEntry> {
        val reading = catalog.readSession()
        return selections.mapNotNull { selection ->
            val resolved = reading.resolve(selection) as? ContractResult.Available
            resolved?.value?.entry?.let { selection to it }
        }.toMap()
    }

    /**
     * One read session for browsing many listings of the same character. Listings made from it share
     * decoded chunks, resolved definitions and the evaluated document, instead of each repeating that
     * work. Callers serialize access and discard it when the character or its content changes.
     */
    fun browsingSession(): BuilderOperations = operation()

    /** A character edit resets prepared rules while retaining this catalog snapshot's decoded definitions. */
    fun nextBrowsingSession(): BuilderOperations = BuilderOperations(catalog.readSession(), true)

    /** Browse this snapshot using the occurrence ID a picker will save for a new selection, when supplied. */
    fun optionListing(document: CharacterDocument, level: Int, slot: ChoiceSlotId,
        newInstanceId: String? = null, featClasses: Set<String>? = null,
        featAncestries: Set<String> = document.ancestryEntryIds()): BuilderOptionListing {
        val reading = operation()
        return BuilderOptionListing(reading.choiceEvaluation(), document.forChoiceAt(level), level, slot, reading.catalog,
            newInstanceId, featClasses, featAncestries)
    }

    /** Rejected commands return the unchanged, recalculated document and an explicit operation diagnostic. */
    suspend fun apply(document: CharacterDocument, edit: BuilderEdit): BuilderResult {
        if (!operation) {
            return operation().apply(document, edit)
        }
        return when (val changed = change(document, edit)) {
            is ContractResult.Available -> BuilderResult(evaluate(changed.value), true)
            is ContractResult.Unavailable -> BuilderResult(evaluate(document), false, changed.diagnostics)
        }
    }

    /** Stage a whole command before calculating its result; batch children still validate in order. */
    private suspend fun change(document: CharacterDocument, edit: BuilderEdit): ContractResult<CharacterDocument> {
        fun reject(message: String) = ContractResult.Unavailable(
            listOf(Diagnostic("builder.rejected", DiagnosticKind.INVALID_SELECTION, message)))
        var next = document
        when (edit) {
            is BuilderEdit.LaterDecisions -> {
                if (edit.value.level < 3) {
                    return reject("Later decisions require level 3 or higher.")
                }
                next = document.copy(levels = document.levels.filterNot { it.level == edit.value.level } + edit.value)
            }
            is BuilderEdit.Batch -> {
                for (command in edit.edits) {
                    when (val result = change(next, command)) {
                        is ContractResult.Unavailable -> return result
                        is ContractResult.Available -> next = result.value
                    }
                }
            }
            is BuilderEdit.RemoveProficiency -> next = document.copy(levels = document.levels.map {
                it.copy(proficiencies = it.proficiencies.filterNot { choice -> choice.slot in edit.slots })
            })
            is BuilderEdit.Identity -> next = document.copy(identity = edit.value)
            is BuilderEdit.CraftKnowledge -> {
                val access = evaluate(document).craftKnowledgeAccess()
                val existing = document.craftKnowledge.filter { edit.kind.matches(it.entryId) }.associateBy { it.entryId }
                val reading = catalog.readSession()
                val selections = edit.entryIds.map { id ->
                    if (!edit.kind.matches(id)) {
                        return reject("That entry does not belong to this list.")
                    }
                    val entry = (reading.lookup(id) as? ContractResult.Available)?.value
                    val eligible = entry != null && access.canLearn(edit.kind, entry.entry)
                    existing[id] ?: if (eligible) saved(entry)
                        else return reject("This character cannot learn ${entry?.entry?.presentation?.title ?: "that entry"}.")
                }
                next = document.copy(craftKnowledge = document.craftKnowledge.filterNot { edit.kind.matches(it.entryId) } + selections)
            }
            is BuilderEdit.Allocation -> next = document.copy(abilities = edit.value.copy(points = edit.value.points.toMap()))
            is BuilderEdit.Advancement -> {
                if (!AdvancementRules.choosesNonMainIncrease(edit.level) ||
                    edit.value?.let { !AdvancementRules.validAdvancement(edit.level, it, document.abilities.mainAbility) } == true) {
                    return reject("Choose one non-main ability to increase at level 4 or 12.")
                }
                next = document.copy(levels = levels(document, edit.level).map { level ->
                    if (level.level == edit.level) level.copy(abilityAdvancements = listOfNotNull(edit.value)) else level
                })
            }
            is BuilderEdit.Level -> {
                if (edit.value !in 1..30) {
                    return reject("Choose a level from 1 to 30.")
                }
                val existing = document.levels.mapTo(mutableSetOf()) { it.level }
                val newLevels = (1..edit.value).filterNot(existing::contains).map(::LevelDecisions)
                next = document.copy(level = edit.value, levels = document.levels + newLevels)
            }
            is BuilderEdit.Entry -> {
                if (edit.level !in 1..30) {
                    return reject("Choose a decision level from 1 to 30.")
                }
                if (edit.instanceId.isBlank()) {
                    return reject("Entry occurrence ID must be nonblank.")
                }
                val existing = document.levels.flatMap { it.entries }.firstOrNull { it.slot == edit.slot }
                val preview = document.forChoiceAt(edit.level)
                val offered = evaluate(preview).rules.choices.singleOrNull { it.slot == edit.slot }
                if (offered?.acquisitionLevel != null && offered.acquisitionLevel != edit.level) {
                    return reject("Entry decisions belong to their source acquisition level; use replacement history for later power changes.")
                }
                val instance = if (offered?.optional == true) ModernCreation.grantInstance(edit.slot.sourceInstanceId, edit.slot.choiceId)
                    else existing?.instanceId ?: edit.instanceId
                if (document.levels.flatMap { it.entries }.any { it.slot != edit.slot && it.instanceId == instance } ||
                    document.equipment.any { it.instanceId == instance }) {
                    return reject("Entry occurrence ID is already in use.")
                }
                val option = choiceEvaluation().option(preview, edit.level, edit.slot, edit.entryId, instance)
                    ?: return reject("Entry is unavailable or is not an option for this slot.")
                if (!edit.acceptIneligible && option.eligibility != Eligibility.ELIGIBLE) {
                    return reject("Choice is ${option.eligibility}; explicitly accept it to retain its diagnostics.")
                }
                next = putEntry(document, edit.level, EntryChoice(instance, edit.slot, saved(option.entry)))
            }
            is BuilderEdit.ReplacePower -> {
                if (edit.level !in 1..30) {
                    return reject("Choose a replacement level from 1 to 30.")
                }
                val state = evaluate(document.atLevel(edit.level))
                val current = state.rules.entries.singleOrNull { it.slot == edit.slot && !it.granted }
                    ?: return reject("Replace an active selected power occurrence.")
                if (current.definition.entry.category != EntryCategory.POWER) {
                    return reject("This operation replaces powers only.")
                }
                if (state.rules.choices.none { it.slot == edit.slot }) {
                    return reject("Replacement source is unavailable.")
                }
                val definition = (catalog.lookup(edit.entryId) as? ContractResult.Available)?.value
                    ?: return reject("Replacement content is unavailable.")
                val change = Replacement(edit.slot, EntryChoice(current.instanceId, edit.slot, saved(definition)), edit.kind)
                next = document.copy(levels = levels(document, edit.level).map { level ->
                    if (level.level != edit.level) level else level.copy(replacements =
                        level.replacements.filterNot { it.replaces == edit.slot ||
                            edit.kind == ReplacementKind.PROGRESSION && it.kind == ReplacementKind.PROGRESSION } + change)
                })
                val evaluated = evaluate(next.atLevel(edit.level))
                if (evaluated.rules.choices.singleOrNull { it.slot == edit.slot }?.entries?.none { it.entryId == edit.entryId } != false) {
                    return reject("Replacement must belong to the source pool at its replacement level.")
                }
                if (evaluated.rules.slotIssues[edit.slot].orEmpty().any { it is SlotIssue.Timing }) {
                    return reject("Progression replaces one earlier class daily attack at levels 9, 15 and 19.")
                }
                val invalid = evaluated.rules.violatesSelectionSet(edit.slot)
                val eligibility = evaluated.rules.entryEligibility[current.instanceId]?.status
                if (!edit.acceptIneligible && (invalid || eligibility != Eligibility.ELIGIBLE)) {
                    return reject("Replacement violates eligibility or selection-set requirements; explicitly accept to preserve it with diagnostics.")
                }
            }
            is BuilderEdit.RemoveReplacement -> {
                next = document.copy(levels = document.levels.map { level ->
                    if (level.level == edit.level) level.copy(replacements = level.replacements.filterNot { it.replaces == edit.slot }) else level
                })
            }
            is BuilderEdit.RemoveEntry -> next = document.copy(levels = document.levels.map { level ->
                level.copy(entries = level.entries.filterNot { it.slot == edit.slot }) })
            is BuilderEdit.Value -> {
                if (edit.level !in 1..30) {
                    return reject("Choose a decision level from 1 to 30.")
                }
                val offered = evaluate(document.forChoiceAt(edit.level)).rules.choices.singleOrNull { it.slot == edit.value.slot }
                if (offered?.values?.none { it.id == edit.value.value } != false) {
                    return reject("Option is unavailable, repeated or the source is inactive.")
                }
                next = document.copy(levels = levels(document, edit.level).map { level -> level.copy(values =
                    level.values.filterNot { it.slot == edit.value.slot } + if (level.level == edit.level) listOf(edit.value) else emptyList()) })
                if (evaluate(next.forChoiceAt(edit.level)).rules.slotIssues[edit.value.slot].orEmpty().any {
                    it is SlotIssue.Timing || it is SlotIssue.InvalidOption || it is SlotIssue.Orphan
                }) {
                    return reject("Decision must be valid at its source acquisition level.")
                }
            }
            is BuilderEdit.Proficiency -> {
                if (edit.level !in 1..30) {
                    return reject("Choose a proficiency level from 1 to 30.")
                }
                val slot = edit.value.slot
                val offered = evaluate(document.forChoiceAt(edit.level)).rules.choices.singleOrNull { it.slot == slot && it.skills.isNotEmpty() }
                if (offered == null) {
                    return reject("Proficiency slot is not active; choose a background with Background first.")
                }
                if ((offered.acquisitionLevel ?: 1) != edit.level) {
                    return reject("Proficiency decisions belong to their source acquisition level.")
                }
                next = document.copy(levels = levels(document, edit.level).map { level -> level.copy(proficiencies =
                    level.proficiencies.filterNot { it.slot == slot } + if (level.level == edit.level) listOf(edit.value) else emptyList()) })
            }
            is BuilderEdit.Background -> {
                val kind = edit.kind.name.lowercase()
                val choices = if (edit.kind == BackgroundKind.ENVIRONMENT) ModernCreation.environments else ModernCreation.upbringings
                if (edit.name !in choices) {
                    return reject("Unknown $kind.")
                }
                val prefix = "background.$kind."
                val old = document.levels.flatMap { it.proficiencies }.firstOrNull { it.slot.sourceInstanceId.startsWith(prefix) }
                val skill = edit.skill ?: old?.skill ?: return reject("An initial background needs a skill decision.")
                val decision = ProficiencyChoice(ChoiceSlotId(prefix + edit.name, "skill", 0), skill)
                next = document.copy(levels = levels(document, 1).map { level -> level.copy(proficiencies =
                    level.proficiencies.filterNot { it.slot.sourceInstanceId.startsWith(prefix) } +
                        if (level.level == 1) listOf(decision) else emptyList()) })
            }
            is BuilderEdit.Equipment -> {
                if (edit.value.instanceId.isBlank() || document.levels.flatMap { it.entries }.any { it.instanceId == edit.value.instanceId }) {
                    return reject("Equipment needs a unique nonblank occurrence ID.")
                }
                val equipment = if (document.equipment.any { it.instanceId == edit.value.instanceId }) {
                    document.equipment.map { if (it.instanceId == edit.value.instanceId) edit.value else it }
                } else {
                    document.equipment + edit.value
                }
                next = document.copy(equipment = equipment)
            }
            is BuilderEdit.RemoveEquipment -> next = document.copy(equipment = document.equipment.filterNot { it.instanceId == edit.instanceId })
            is BuilderEdit.Adjustment -> next = document.copy(manualAdjustments = document.manualAdjustments.filterNot { it.id == edit.value.id } + edit.value)
            is BuilderEdit.RemoveAdjustment -> next = document.copy(manualAdjustments = document.manualAdjustments.filterNot { it.id == edit.id })
        }
        val encoded = ContractCodec.encodeChecked(next)
        if (encoded is ContractResult.Unavailable) {
            return encoded
        }
        return ContractResult.Available(next)
    }

    /** Future choices see the character at their own level, including any earlier planned decisions. */
    private fun CharacterDocument.forChoiceAt(level: Int) =
        atLevel(if (level in 1..30) maxOf(this.level, level) else this.level)

    private fun saved(entry: ResolvedEntry) = SavedSelection(entry.entry.id, entry.entry.presentation.title,
        entry.supplier.packageId, entry.fingerprint)

    private fun levels(document: CharacterDocument, level: Int) =
        if (document.levels.any { it.level == level }) document.levels else document.levels + LevelDecisions(level)

    private fun putEntry(document: CharacterDocument, level: Int, entry: EntryChoice) = document.copy(
        levels = levels(document, level).map { decisions -> decisions.copy(entries = decisions.entries.filterNot { it.slot == entry.slot } +
            if (decisions.level == level) listOf(entry) else emptyList()) })

}

/**
 * Whether the choice set holding [slot] reports an invalid selection beyond its unmade picks. An unfinished set is
 * not a violation: its single remaining-selections report is matched by its [SlotIssue.Remaining] issue.
 */
private fun EngineResult.violatesSelectionSet(slot: ChoiceSlotId): Boolean {
    val remaining = slotIssues[ChoiceSlotId(slot.sourceInstanceId, slot.choiceId, 0)].orEmpty().count { it is SlotIssue.Remaining }
    val invalid = selectionSets.filter { it.sourceInstanceId == slot.sourceInstanceId && it.choiceId == slot.choiceId }
        .sumOf { set -> set.diagnostics.count { it.kind == DiagnosticKind.INVALID_SELECTION } }
    return invalid > remaining
}
