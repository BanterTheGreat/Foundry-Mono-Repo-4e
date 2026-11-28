package dev.modern4e.builder

/** Authored proficiency distinctness is separate from ordinary duplicate-proficiency handling. */
internal class ProficiencySelectionRules(
    private val document: CharacterDocument,
    private val entries: List<EngineEntry>,
    private val proficiencies: Map<Skill, List<ChoiceSlotId>>,
) {
    private val occurrences = entries.associateBy { it.instanceId }
    private val decisions = document.levels.flatMap { level -> level.proficiencies.map { it.slot to level.level } +
        if (level.skillIncreases.isEmpty()) emptyList() else listOf(SkillAdvancement.slot(level.level) to level.level) }.toMap()
    private val entryLevels = document.levels.flatMap { level -> level.entries.map { it.slot to level.level } }.toMap()

    /** Keep this slot's existing value editable while excluding siblings and independent sources. */
    fun skills(slot: ChoiceSlotId, definition: ChoiceDefinition.Proficiencies): List<Skill> {
        val offered = definition.skills.mapNotNull { it.current }.distinct()
        if (!definition.distinctAgainstCharacter) {
            return offered
        }
        val atLevel = decisions[slot] ?: acquisitionLevel(slot.sourceInstanceId)
        return offered.filter { skill -> proficiencies[skill].orEmpty().none {
            it != slot && sourceLevel(it) <= atLevel
        } }
    }

    /** Check the complete grant against independent facts at the occurrence's acquisition level. */
    fun validate(entry: ContentEntry, slot: ChoiceSlotId): List<Diagnostic> {
        val constrained = entry.mechanics.choices.filterIsInstance<ChoiceDefinition.Proficiencies>()
            .filter { it.distinctAgainstCharacter }
        if (constrained.isEmpty()) {
            return emptyList()
        }
        val occurrence = entries.singleOrNull { it.slot == slot && it.definition.entry.id == entry.id }
        val atLevel = entryLevels[slot] ?: occurrence?.let { acquisitionLevel(it.instanceId) } ?: document.level
        val errors = mutableListOf<Diagnostic>()
        for (choice in constrained) {
            val independent = proficiencies.filterValues { sources -> sources.any {
                sourceLevel(it) <= atLevel && !ownedBy(it.sourceInstanceId, occurrence?.instanceId)
            } }.keys
            if (choice.skills.mapNotNull { it.current }.distinct().count { it !in independent } < choice.count) {
                errors += error("proficiencyExhausted", "Select ${choice.count} new skills; too few untrained options remain.", slot, entry.id)
            }
            val selected = document.levels.filter { it.level <= atLevel }.flatMap { it.proficiencies }
                .filter { it.slot.sourceInstanceId == occurrence?.instanceId && it.slot.choiceId == choice.id && it.slot.ordinal < choice.count }
            for (decision in selected) {
                if (decision.skill.current in independent || selected.count { it.skill.current == decision.skill.current } > 1) {
                    errors += error("proficiencyDistinct", "This choice must grant a skill not already proficient from another source or slot.", decision.slot, entry.id)
                }
            }
        }
        return errors
    }

    private fun ownedBy(instance: String, owner: String?, seen: Set<String> = emptySet()): Boolean {
        if (owner == null || instance in seen) {
            return false
        }
        if (instance == owner) {
            return true
        }
        return occurrences[instance]?.let { ownedBy(it.slot.sourceInstanceId, owner, seen + instance) } ?: false
    }

    /** The level from which the training [slot] gives is held. */
    fun sourceLevel(slot: ChoiceSlotId): Int {
        decisions[slot]?.let { return it }
        val progressionLevel = occurrences[slot.sourceInstanceId]?.definition?.entry?.mechanics?.progression
            .orEmpty().filter { level -> level.grants.any { it is Grant.Proficiency && it.grantId == slot.choiceId } ||
                level.choices.any { it is ChoiceDefinition.Proficiencies && it.id == slot.choiceId } }
            .maxOfOrNull { it.level } ?: 1
        return maxOf(progressionLevel, acquisitionLevel(slot.sourceInstanceId))
    }

    private fun acquisitionLevel(instance: String, seen: Set<String> = emptySet()): Int {
        if (instance in seen) {
            return document.level
        }
        val occurrence = occurrences[instance] ?: return 1
        entryLevels[occurrence.slot]?.let { return it }
        val parent = occurrences[occurrence.slot.sourceInstanceId] ?: return 1
        val mechanics = parent.definition.entry.mechanics
        val grantLevel = mechanics.grants.filterIsInstance<Grant.Entry>()
            .filter { it.grantId == occurrence.slot.choiceId }.maxOfOrNull { it.atLevel } ?: 1
        val progressionLevel = mechanics.progression.filter { level -> level.grants.any {
            it is Grant.Entry && it.grantId == occurrence.slot.choiceId
        } }.maxOfOrNull { it.level } ?: 1
        return maxOf(grantLevel, progressionLevel, acquisitionLevel(parent.instanceId, seen + instance))
    }

    private fun error(code: String, message: String, slot: ChoiceSlotId, entryId: String) =
        Diagnostic("engine.$code", DiagnosticKind.INVALID_SELECTION, message, slot, entryId)
}
