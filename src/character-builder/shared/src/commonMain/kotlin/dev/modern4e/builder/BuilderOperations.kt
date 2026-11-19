package dev.modern4e.builder

/** Edits contain decisions only; callers supply IDs and timestamps, never platform services. */
sealed class BuilderEdit {
    data class LaterDecisions(val value: LevelDecisions) : BuilderEdit()
    data class Batch(val edits: List<BuilderEdit>) : BuilderEdit()
    data class RemoveProficiency(val slots: Set<ChoiceSlotId>) : BuilderEdit()
    data class Identity(val value: CharacterIdentity) : BuilderEdit()
    data class Allocation(val value: AbilityAllocation) : BuilderEdit()
    data class Level(val value: Int) : BuilderEdit()
    data class Entry(val level: Int, val slot: ChoiceSlotId, val entryId: String, val instanceId: String,
        val acceptIneligible: Boolean = false) : BuilderEdit()
    data class ReplacePower(val level: Int, val slot: ChoiceSlotId, val entryId: String,
        val kind: ReplacementKind = ReplacementKind.RETRAINING, val acceptIneligible: Boolean = false) : BuilderEdit()
    data class RemoveEntry(val slot: ChoiceSlotId) : BuilderEdit()
    data class Proficiency(val level: Int, val value: ProficiencyChoice) : BuilderEdit()
    data class Value(val level: Int, val value: ValueChoice) : BuilderEdit()
    /** Changing background preserves its skill unless the caller explicitly supplies a replacement. */
    data class Background(val kind: BackgroundKind, val name: String, val skill: Skill? = null) : BuilderEdit()
    data class Equipment(val value: EquipmentSelection) : BuilderEdit()
    data class RemoveEquipment(val instanceId: String) : BuilderEdit()
    data class Adjustment(val value: ManualAdjustment) : BuilderEdit()
    data class RemoveAdjustment(val id: String) : BuilderEdit()
}

enum class BackgroundKind { ENVIRONMENT, UPBRINGING }

data class BuilderState(val document: CharacterDocument, val rules: EngineResult)
data class BuilderResult(val state: BuilderState, val applied: Boolean, val diagnostics: List<Diagnostic> = emptyList())
data class BuilderOption(val entry: ResolvedEntry, val eligibility: Eligibility, val diagnostics: List<Diagnostic>)

/** Shared editing coordinator. Catalog reads are its only dependency; it never saves or exports. */
class BuilderOperations private constructor(private val catalog: ContentCatalog, private val operation: Boolean) {
    constructor(catalog: ContentCatalog) : this(catalog, false)

    private val preparation by lazy { RulesContentPreparation(catalog) }
    private val evaluated = mutableMapOf<CharacterDocument, BuilderState>()

    /** Decoded content and calculations live for one command, never across content refreshes. */
    private fun operation() = if (operation) this else BuilderOperations(catalog.readSession(), true)
    /** Direct creation at either proof level; incomplete decisions remain exportable. */
    suspend fun create(id: String, savedAt: String, identity: CharacterIdentity, packages: List<PackageRevision>,
        abilities: AbilityAllocation, level: Int = 1): BuilderState {
        require(level in 1..2)
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
        return calculate(document).also {
            evaluated[document] = it
            if (evaluated.size > 2) {
                evaluated.remove(evaluated.keys.first())
            }
        }
    }

    private suspend fun calculate(document: CharacterDocument): BuilderState {
        val rules = RulesEngine.evaluate(document, preparation.load(document))
        val required = listOf("class", "ancestry", "feat").map { ChoiceSlotId("creation", it, 0) } +
            if (document.level >= 2) listOf(ChoiceSlotId("advancement.2", "feat", 0)) else emptyList()
        val selected = document.levels.flatMap { it.entries }.map { it.slot }.toSet()
        val missing = required.filter { it !in selected }.map {
            Diagnostic("builder.missingChoice", DiagnosticKind.INVALID_SELECTION, "Select an entry for this starting or advancement slot.", it)
        }
        return BuilderState(document, rules.copy(diagnostics = rules.diagnostics + missing))
    }

    /** Root and child entry options share engine eligibility. Unknown/ineligible options require explicit opt-in. */
    suspend fun options(document: CharacterDocument, level: Int, slot: ChoiceSlotId,
        includeIneligible: Boolean = false): List<BuilderOption> {
        if (!operation) {
            return operation().options(document, level, slot, includeIneligible)
        }
        return choiceEvaluation().options(document, level, slot, includeIneligible)
    }

    private fun choiceEvaluation() = ChoiceEvaluation(catalog, { evaluate(it) }, { preparation.load(it) })

    /** Read multiple saved definitions using the same catalog read session. */
    suspend fun resolveSelections(selections: Set<SavedSelection>): Map<SavedSelection, ContentEntry> {
        val reading = catalog.readSession()
        return selections.mapNotNull { selection ->
            val resolved = reading.resolve(selection) as? ContractResult.Available
            resolved?.value?.entry?.let { selection to it }
        }.toMap()
    }

    /** Browse this snapshot using the occurrence ID a picker will save for a new selection, when supplied. */
    fun optionListing(document: CharacterDocument, level: Int, slot: ChoiceSlotId,
        newInstanceId: String? = null, featClasses: Set<String>? = null,
        featAncestries: Set<String> = document.ancestryEntryIds()): BuilderOptionListing {
        val reading = operation()
        return BuilderOptionListing(reading.choiceEvaluation(), document, level, slot, reading.catalog, newInstanceId, featClasses, featAncestries)
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
                if (edit.value.level !in 3..document.level) {
                    return reject("Later decisions require an active level above the proof range.")
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
            is BuilderEdit.Allocation -> next = document.copy(abilities = edit.value.copy(points = edit.value.points.toMap()))
            is BuilderEdit.Level -> {
                if (edit.value !in document.level..30) {
                    return reject("Levels can only increase, up to level 30.")
                }
                next = document.copy(level = edit.value, levels = document.levels +
                    (1..edit.value).filter { level -> document.levels.none { it.level == level } }.map { LevelDecisions(it) })
            }
            is BuilderEdit.Entry -> {
                if (edit.instanceId.isBlank()) {
                    return reject("Entry occurrence ID must be nonblank.")
                }
                val existing = document.levels.flatMap { it.entries }.firstOrNull { it.slot == edit.slot }
                val offered = evaluate(document).rules.choices.singleOrNull { it.slot == edit.slot }
                if (offered?.optional == true && offered.acquisitionLevel != edit.level) {
                    return reject("Grant substitutions belong to the granting source's acquisition level; later replacement allowances are not implemented.")
                }
                val instance = if (offered?.optional == true) ModernCreation.grantInstance(edit.slot.sourceInstanceId, edit.slot.choiceId)
                    else existing?.instanceId ?: edit.instanceId
                if (document.levels.flatMap { it.entries }.any { it.slot != edit.slot && it.instanceId == instance } ||
                    document.equipment.any { it.instanceId == instance }) {
                    return reject("Entry occurrence ID is already in use.")
                }
                val option = choiceEvaluation().option(document, edit.level, edit.slot, edit.entryId, instance)
                    ?: return reject("Entry is unavailable or is not an option for this slot.")
                if (!edit.acceptIneligible && option.eligibility != Eligibility.ELIGIBLE) {
                    return reject("Choice is ${option.eligibility}; explicitly accept it to retain its diagnostics.")
                }
                next = putEntry(document, edit.level, EntryChoice(instance, edit.slot, saved(option.entry)))
            }
            is BuilderEdit.ReplacePower -> {
                if (edit.level !in 1..document.level) {
                    return reject("Replacement level must be active.")
                }
                val state = evaluate(document)
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
                        level.replacements.filterNot { it.replaces == edit.slot } + change)
                })
                val evaluated = evaluate(next)
                if (evaluated.rules.choices.singleOrNull { it.slot == edit.slot }?.entries?.none { it.entryId == edit.entryId } != false) {
                    return reject("Replacement must belong to the source pool at its replacement level.")
                }
                val invalid = evaluated.rules.selectionSets.filter { it.sourceInstanceId == edit.slot.sourceInstanceId && it.choiceId == edit.slot.choiceId }
                    .flatMap { it.diagnostics }.any { it.code != "engine.selectionRemaining" && it.kind == DiagnosticKind.INVALID_SELECTION }
                val eligibility = evaluated.rules.entryEligibility[current.instanceId]?.status
                if (!edit.acceptIneligible && (invalid || eligibility != Eligibility.ELIGIBLE)) {
                    return reject("Replacement violates eligibility or selection-set requirements; explicitly accept to preserve it with diagnostics.")
                }
            }
            is BuilderEdit.RemoveEntry -> next = document.copy(levels = document.levels.map { level ->
                level.copy(entries = level.entries.filterNot { it.slot == edit.slot }) })
            is BuilderEdit.Value -> {
                if (edit.level !in 1..document.level) {
                    return reject("Decision level must be active.")
                }
                val offered = evaluate(document).rules.choices.singleOrNull { it.slot == edit.value.slot }
                if (offered?.values?.none { it.id == edit.value.value } != false) {
                    return reject("Option is unavailable, repeated or the source is inactive.")
                }
                next = document.copy(levels = levels(document, edit.level).map { level -> level.copy(values =
                    level.values.filterNot { it.slot == edit.value.slot } + if (level.level == edit.level) listOf(edit.value) else emptyList()) })
                if (evaluate(next).rules.diagnostics.any { it.slot == edit.value.slot && it.code in setOf("engine.valueTiming", "engine.valueOption", "engine.orphanValue") }) {
                    return reject("Decision must be valid at its source acquisition level.")
                }
            }
            is BuilderEdit.Proficiency -> {
                if (edit.level !in 1..document.level || edit.level > 2) {
                    return reject("Proficiency level must be an active proof level.")
                }
                val slot = edit.value.slot
                if (evaluate(document).rules.choices.none { it.slot == slot && it.skills.isNotEmpty() }) {
                    return reject("Proficiency slot is not active; choose a background with Background first.")
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
                next = document.copy(equipment = document.equipment.filterNot { it.instanceId == edit.value.instanceId } + edit.value)
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

    private fun saved(entry: ResolvedEntry) = SavedSelection(entry.entry.id, entry.entry.presentation.title,
        entry.supplier.packageId, entry.fingerprint)

    private fun levels(document: CharacterDocument, level: Int) =
        if (document.levels.any { it.level == level }) document.levels else document.levels + LevelDecisions(level)

    private fun putEntry(document: CharacterDocument, level: Int, entry: EntryChoice) = document.copy(
        levels = levels(document, level).map { decisions -> decisions.copy(entries = decisions.entries.filterNot { it.slot == entry.slot } +
            if (decisions.level == level) listOf(entry) else emptyList()) })

}
