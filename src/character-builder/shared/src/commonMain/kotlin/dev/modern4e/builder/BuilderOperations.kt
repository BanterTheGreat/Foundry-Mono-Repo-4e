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
    data class RemoveEntry(val slot: ChoiceSlotId) : BuilderEdit()
    data class Proficiency(val level: Int, val value: ProficiencyChoice) : BuilderEdit()
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
class BuilderOperations(private val catalog: ContentCatalog) {
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
        val rules = RulesEngine.evaluate(document, RulesContent.load(document, catalog))
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
        if (level !in 1..document.level || level > 2) {
            return emptyList()
        }
        val current = evaluate(document)
        val category = rootCategory(level, slot)
        val offered = current.rules.choices.singleOrNull { it.slot == slot }
        val ids = if (category != null) catalog.search(category = category).map { it.metadata.id }
            else offered?.entries?.map { it.entryId }.orEmpty()
        val result = mutableListOf<BuilderOption>()
        for (id in ids) {
            val definition = (catalog.lookup(id) as? ContractResult.Available)?.value ?: continue
            val existing = document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
            val instance = existing?.instanceId ?: "builder-preview:${slot.sourceInstanceId.length}:${slot.sourceInstanceId}:${slot.choiceId}:${slot.ordinal}"
            val candidate = putEntry(document, level, EntryChoice(instance, slot, saved(definition)))
            val evaluated = evaluate(candidate)
            val diagnostics = evaluated.rules.diagnostics.filter { it.slot == slot && it.entryId == id }
            val status = if (definition.entry.mechanics.version >= 2) {
                evaluated.rules.entryEligibility[instance]?.status ?: Eligibility.UNRESOLVED
            } else when {
                diagnostics.any { it.kind == DiagnosticKind.INVALID_SELECTION } -> Eligibility.INELIGIBLE
                diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT } -> Eligibility.UNRESOLVED
                diagnostics.any { it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION } -> Eligibility.INCOMPLETE
                else -> Eligibility.ELIGIBLE
            }
            if (includeIneligible || status == Eligibility.ELIGIBLE) {
                result += BuilderOption(definition, status, diagnostics)
            }
        }
        return result
    }

    /** Rejected commands return the unchanged, recalculated document and an explicit operation diagnostic. */
    suspend fun apply(document: CharacterDocument, edit: BuilderEdit): BuilderResult {
        suspend fun reject(message: String) = BuilderResult(evaluate(document), false,
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
                    val result = apply(next, command)
                    if (!result.applied) {
                        return BuilderResult(evaluate(document), false, result.diagnostics)
                    }
                    next = result.state.document
                }
            }
            is BuilderEdit.RemoveProficiency -> next = document.copy(levels = document.levels.map {
                it.copy(proficiencies = it.proficiencies.filterNot { choice -> choice.slot in edit.slots })
            })
            is BuilderEdit.Identity -> next = document.copy(identity = edit.value)
            is BuilderEdit.Allocation -> next = document.copy(abilities = edit.value.copy(points = edit.value.points.toMap()))
            is BuilderEdit.Level -> {
                if (edit.value !in document.level..2) {
                    return reject("Only forward progression through level 2 is supported.")
                }
                next = document.copy(level = edit.value, levels = document.levels +
                    (1..edit.value).filter { level -> document.levels.none { it.level == level } }.map { LevelDecisions(it) })
            }
            is BuilderEdit.Entry -> {
                if (edit.instanceId.isBlank()) {
                    return reject("Entry occurrence ID must be nonblank.")
                }
                val existing = document.levels.flatMap { it.entries }.firstOrNull { it.slot == edit.slot }
                val instance = existing?.instanceId ?: edit.instanceId
                if (document.levels.flatMap { it.entries }.any { it.slot != edit.slot && it.instanceId == instance } ||
                    document.equipment.any { it.instanceId == instance }) {
                    return reject("Entry occurrence ID is already in use.")
                }
                val option = options(document, edit.level, edit.slot, true).firstOrNull { it.entry.entry.id == edit.entryId }
                    ?: return reject("Entry is unavailable or is not an option for this slot.")
                if (!edit.acceptIneligible && option.eligibility != Eligibility.ELIGIBLE) {
                    return reject("Choice is ${option.eligibility}; explicitly accept it to retain its diagnostics.")
                }
                next = putEntry(document, edit.level, EntryChoice(instance, edit.slot, saved(option.entry)))
            }
            is BuilderEdit.RemoveEntry -> next = document.copy(levels = document.levels.map { level ->
                level.copy(entries = level.entries.filterNot { it.slot == edit.slot }) })
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
            return BuilderResult(evaluate(document), false, encoded.diagnostics)
        }
        return BuilderResult(evaluate(next), true)
    }

    private fun saved(entry: ResolvedEntry) = SavedSelection(entry.entry.id, entry.entry.presentation.title,
        entry.supplier.packageId, entry.fingerprint)

    private fun levels(document: CharacterDocument, level: Int) =
        if (document.levels.any { it.level == level }) document.levels else document.levels + LevelDecisions(level)

    private fun putEntry(document: CharacterDocument, level: Int, entry: EntryChoice) = document.copy(
        levels = levels(document, level).map { decisions -> decisions.copy(entries = decisions.entries.filterNot { it.slot == entry.slot } +
            if (decisions.level == level) listOf(entry) else emptyList()) })

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
