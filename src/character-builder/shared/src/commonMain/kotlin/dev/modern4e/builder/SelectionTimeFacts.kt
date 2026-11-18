package dev.modern4e.builder

/**
 * Selection-time facts own dependency exclusion, historical reconstruction and equivalent-snapshot reuse.
 * The lifetime is one rules evaluation; changing a document or content snapshot creates a fresh module.
 * Evaluation is supplied internally so facts never recurse into eligibility calculation.
 */
internal class SelectionTimeFacts<T>(
    private val document: CharacterDocument,
    private val content: RulesContent,
    private val entries: List<EngineEntry>,
    private val grantReplacementSlots: Set<ChoiceSlotId>,
    private val decisionLevels: Map<ChoiceSlotId, Int>,
    private val evaluate: (CharacterDocument) -> T,
) {
    private val prepared = mutableMapOf<CharacterDocument, T>()
    private val candidates = mutableMapOf<Pair<String, ChoiceSlotId>, T>()

    /** Never use a candidate's own benefits as proof of its prerequisite. */
    fun selfDependency(entry: ContentEntry, prerequisite: Prerequisite, visiting: Set<String> = emptySet()): Boolean {
        if (prerequisite is Prerequisite.AllOf || prerequisite is Prerequisite.AnyOf) {
            return prerequisite.leaves().any { selfDependency(entry, it, visiting) }
        }
        if (entry.id in visiting) {
            return true
        }
        val mechanics = entry.mechanics
        val grants = mechanics.grants + mechanics.progression.filter { it.level <= document.level }.flatMap { it.grants }
        val sourceChoices = mechanics.choices + mechanics.progression.filter { it.level <= document.level }.flatMap { it.choices }
        val sourceModifiers = mechanics.modifiers + mechanics.progression.filter { it.level <= document.level }.flatMap { it.modifiers }
        val direct = when (prerequisite) {
            is Prerequisite.AbilityPoints -> sourceModifiers.any { it.target == ModifierTarget(Statistic.ABILITY_POINTS, ability = prerequisite.ability) }
            is Prerequisite.Proficiency -> grants.filterIsInstance<Grant.Proficiency>().any { it.skill == prerequisite.skill } ||
                sourceChoices.filterIsInstance<ChoiceDefinition.Proficiencies>().any { prerequisite.skill in it.skills }
            is Prerequisite.ClassPowerSource -> prerequisite.powerSource in mechanics.classProfile?.powerSources.orEmpty() ||
                mechanics.multiclassFor?.let { target ->
                    val profile = (content.entries[target] as? ContractResult.Available)?.value?.entry?.mechanics?.classProfile
                    prerequisite.powerSource in profile?.powerSources.orEmpty()
                } == true
            is Prerequisite.EquipmentProficiency -> prerequisite.equipment in mechanics.classProfile?.proficiencies?.values?.flatten().orEmpty() ||
                prerequisite.equipment in mechanics.equipmentProficiencies || prerequisite.equipment in mechanics.armorAdvancement?.order.orEmpty() ||
                sourceChoices.filterIsInstance<ChoiceDefinition.Values>().any { it.kind == FactKind.EQUIPMENT_PROFICIENCY && it.options.any { option -> prerequisite.equipment in option.grants.ifEmpty { listOf(option.id) } } }
            is Prerequisite.Size -> mechanics.size != null
            is Prerequisite.Selected -> when (prerequisite.category) {
                EntryCategory.FEAT -> entry.category == EntryCategory.FEAT && mechanics.multiclassFor != null
                EntryCategory.POWER -> entry.category == EntryCategory.POWER && mechanics.powerProfile?.usage == prerequisite.filters.usage
                else -> false
            }
            is Prerequisite.Entry -> prerequisite.entryId == entry.id || prerequisite.entryId == mechanics.multiclassFor ||
                grants.filterIsInstance<Grant.Entry>().any { it.entryId == prerequisite.entryId } ||
                sourceChoices.filterIsInstance<ChoiceDefinition.Values>().any { it.kind == FactKind.ANCESTRY_QUALIFICATION && it.options.any { option -> option.id == prerequisite.entryId } }
            else -> false
        }
        if (direct) {
            return true
        }
        val childIds = grants.filterIsInstance<Grant.Entry>().flatMap { listOf(it.entryId) + it.replacementEntryIds } +
            sourceChoices.filterIsInstance<ChoiceDefinition.Entries>().flatMap { it.entryIds }
        return childIds.any { id ->
            val child = content.entries[id] as? ContractResult.Available
            child != null && selfDependency(child.value.entry, prerequisite, visiting + entry.id)
        }
    }

    /**
     * Reconstruct selection-time facts without this occurrence or a benefit chain depending on it.
     * The snapshot never evaluates eligibility itself, so circular requirements cannot recurse.
     */
    fun forCandidate(candidate: ContentEntry, slot: ChoiceSlotId): T =
        candidates.getOrPut(candidate.id to slot) { prepare(candidate, slot) }

    private fun prepare(candidate: ContentEntry, slot: ChoiceSlotId): T {
        val excludedDefinitions = linkedMapOf(candidate.id to candidate)
        var changed = true
        while (changed) {
            changed = false
            for (other in entries.filter { !it.granted || it.slot in grantReplacementSlots }.map { it.definition.entry }) {
                if (other.id in excludedDefinitions) {
                    continue
                }
                val requirements = (other.mechanics.prerequisites + listOfNotNull(other.mechanics.access)).flatMap { it.leaves() }
                if (requirements.any { requirement -> excludedDefinitions.values.any { selfDependency(it, requirement) } }) {
                    excludedDefinitions[other.id] = other
                    changed = true
                }
            }
        }
        val excludedInstances = entries.filter {
            it.slot == slot || it.definition.entry.id != candidate.id && it.definition.entry.id in excludedDefinitions
        }.map { it.instanceId }.toMutableSet()
        do {
            changed = false
            for (occurrence in entries) {
                if (occurrence.slot.sourceInstanceId in excludedInstances && excludedInstances.add(occurrence.instanceId)) {
                    changed = true
                }
            }
        } while (changed)
        val atLevel = decisionLevels[slot] ?: document.level
        val snapshot = document.copy(level = atLevel, levels = document.levels.filter { it.level <= atLevel }.map { level ->
            level.copy(entries = level.entries.filter { it.instanceId !in excludedInstances && it.slot != slot },
                proficiencies = level.proficiencies.filter { it.slot.sourceInstanceId !in excludedInstances },
                values = level.values.filter { it.slot.sourceInstanceId !in excludedInstances },
                replacements = level.replacements.filter { it.replaces.sourceInstanceId !in excludedInstances && it.replaces != slot })
        }, equipment = emptyList(), manualAdjustments = emptyList())
        return prepared.getOrPut(snapshot) { evaluate(snapshot) }
    }

}
