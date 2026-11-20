package dev.modern4e.builder

enum class Eligibility { ELIGIBLE, INELIGIBLE, INCOMPLETE, UNRESOLVED }

@kotlinx.serialization.Serializable
data class EntryEligibility(val entryId: String, val status: Eligibility, val diagnostics: List<Diagnostic>)

/** Options include ineligible/unknown entries; interfaces filter ELIGIBLE by default. */
@kotlinx.serialization.Serializable
data class EngineChoice(
    val slot: ChoiceSlotId,
    val entries: List<EntryEligibility> = emptyList(),
    val skills: List<Skill> = emptyList(),
    val abilities: List<Ability> = emptyList(),
    val optional: Boolean = false,
    val acquisitionLevel: Int? = null,
    val values: List<ValueOption> = emptyList(),
    val valueKind: FactKind? = null,
)

@kotlinx.serialization.Serializable
data class EngineEntry(val instanceId: String, val slot: ChoiceSlotId, val definition: ResolvedEntry, val granted: Boolean)

data class EngineResult(
    val statistics: Map<ModifierTarget, StatisticCalculation>,
    val entries: List<EngineEntry>,
    val choices: List<EngineChoice>,
    val proficiencies: Map<Skill, List<ChoiceSlotId>>,
    val coverage: Map<String, Coverage>,
    val diagnostics: List<Diagnostic>,
    val conditionalModifiers: List<ConditionalContribution> = emptyList(),
    val entryEligibility: Map<String, EntryEligibility> = emptyMap(),
    val selectionSets: List<SelectionSetResult> = emptyList(),
    val overviewAbilityTotals: Map<Ability, Int> = emptyMap(),
    val equipmentProficiencies: Map<String, List<ChoiceSlotId>> = emptyMap(),
    val facts: List<StructuredFact> = emptyList(),
    internal val overviewStatistics: Map<Statistic, ContractResult<CalculatedValue>> = emptyMap(),
) {
    fun ability(ability: Ability) = statistics.getValue(ModifierTarget(Statistic.ABILITY_POINTS, ability = ability)).value
    fun skill(skill: Skill) = statistics.getValue(ModifierTarget(Statistic.SKILL_CHECK, skill = skill)).value

    /** Show known defense totals while the character has unfinished choices. */
    fun displayedDefense(statistic: Statistic): ContractResult<CalculatedValue> {
        require(statistic in defenseStatistics)
        return displayedStatistic(statistic)
    }

    /** Show totals from known inputs while choices elsewhere on the sheet are unfinished. */
    fun displayedStatistic(statistic: Statistic): ContractResult<CalculatedValue> =
        overviewStatistics[statistic] ?: statistics[ModifierTarget(statistic)]?.value
            ?: ContractResult.Unavailable(listOf(diagnostic("missingBase", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "$statistic has no calculation.")))

    /** Calculate the displayed modifier using committed proficiency or the picker’s draft source. */
    fun displayedSkill(skill: Skill, proficiencySource: ChoiceSlotId? = proficiencies[skill]?.firstOrNull()): ContractResult<CalculatedValue> {
        val target = ModifierTarget(Statistic.SKILL_CHECK, skill = skill)
        val proficiencyKey = "modern.proficiency:$skill"
        val known = statistics.getValue(target).modifiers.map { it.contribution }.filter { it.sourceKey != proficiencyKey }
        val points = overviewAbilityTotals.getValue(skill.ability)
        val base = ContractResult.Available(CalculatedValue(points, listOf(Contributor("${skill.ability.name} points", points))))
        return ModifierCalculator.calculate(base, skillProficiency(skill, proficiencySource) + known).value
    }
}

private val partialStatistics = setOf(Statistic.SPEED, Statistic.HIT_POINTS, Statistic.HEALING_SURGES)

private fun skillProficiency(skill: Skill, source: ChoiceSlotId?): List<ModifierContribution> =
    if (source == null) emptyList() else listOf(ModifierContribution(
        TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = skill), ModifierOperation.ADD, 5, BonusType.PROFICIENCY),
        "Proficiency", "modern.proficiency:$skill", source))

/** Shared baseline choice identities match the portable v1 fixtures. */
object ModernCreation {
    val requiredEntryKinds = listOf("class", "ancestry", "theme", "feat")

    val environments = linkedMapOf(
        "nomadic" to listOf(Skill.DIPLOMACY, Skill.ACROBATICS, Skill.MEDICINE, Skill.NATURE),
        "rural" to listOf(Skill.CRAFTING, Skill.RELIGION, Skill.DIPLOMACY, Skill.PERCEPTION),
        "wilderness" to listOf(Skill.CRAFTING, Skill.NATURE, Skill.ACROBATICS, Skill.MEDICINE),
        "urban" to listOf(Skill.BLUFF, Skill.SOCIETY, Skill.INSIGHT, Skill.INTIMIDATE),
        "secluded" to listOf(Skill.CRAFTING, Skill.ARCANA, Skill.RELIGION, Skill.SOCIETY),
    )
    val upbringings = linkedMapOf(
        "academic" to listOf(Skill.ARCANA, Skill.SOCIETY, Skill.CRAFTING, Skill.MEDICINE),
        "militaristic" to listOf(Skill.ENDURANCE, Skill.MEDICINE, Skill.ATHLETICS, Skill.DIPLOMACY),
        "lawless" to listOf(Skill.STEALTH, Skill.THIEVERY, Skill.INTIMIDATE, Skill.INSIGHT),
        "labor" to listOf(Skill.ATHLETICS, Skill.CRAFTING, Skill.ENDURANCE, Skill.PERCEPTION),
        "spiritual" to listOf(Skill.RELIGION, Skill.DIPLOMACY, Skill.MEDICINE, Skill.NATURE),
        "creative" to listOf(Skill.BLUFF, Skill.ACROBATICS, Skill.CRAFTING, Skill.DIPLOMACY),
    )

    /** Stable across saves and package reordering; grantId is scoped to its parent occurrence. */
    fun grantInstance(parent: String, grantId: String) = "grant:${parent.length}:$parent:${grantId.length}:$grantId"
}

/** Pure proof engine. No IO, clocks, ID generators, scripts, or vanilla score conversion. */
object RulesEngine {
    fun evaluate(document: CharacterDocument, content: RulesContent): EngineResult = Evaluation(document, content).run()

    /** Candidate validation activates the same mechanics without evaluating unrelated offered choices or totals. */
    internal fun evaluateChoice(document: CharacterDocument, content: RulesContent, instanceId: String): EngineResult =
        Evaluation(document, content, targetInstance = instanceId).run()

    /** A picker may reuse activation and selection-time facts for mechanically passive root feats. */
    internal fun prepareFeatChoices(document: CharacterDocument, level: Int, slot: ChoiceSlotId) =
        PreparedFeatChoices(document, level, slot)

    /** A picker may judge plain class powers against one activation of the character with the slot empty. */
    internal fun preparePowerChoices(document: CharacterDocument, level: Int, slot: ChoiceSlotId) =
        PreparedPowerChoices(document, level, slot)
}

internal data class PreparedFeatChoice(val eligibility: EntryEligibility, val diagnostics: List<Diagnostic>)

/**
 * Conservative list fast path. A passive feat cannot change character facts, so the character
 * with this slot removed is activated once. Exact content snapshots and historical exclusions
 * remain part of the cache key; active feats and ambiguous documents use normal candidate activation.
 */
internal class PreparedFeatChoices(
    private val document: CharacterDocument,
    private val level: Int,
    private val slot: ChoiceSlotId,
) {
    /** The character as the slot sees it before it is filled; its content is prepared once and extended per candidate. */
    internal val baseline = document.copy(levels = document.levels.map { decisions ->
        decisions.copy(entries = decisions.entries.filterNot { it.slot == slot })
    })

    /**
     * Identifies a content snapshot without deep-hashing every definition on each lookup. The hash covers only
     * entry IDs and the selection count, which equal snapshots always share; equality is still full [RulesContent]
     * equality, so a coarser hash can only cost a comparison, never return another snapshot's activation.
     */
    private class ContentKey(val content: RulesContent) {
        private val hash = content.entries.keys.hashCode() * 31 + content.selections.size

        override fun hashCode() = hash

        override fun equals(other: Any?) = other is ContentKey && other.content == content
    }

    private val prepared = linkedMapOf<ContentKey, Evaluation>()
    internal var factPreparations = 0
        private set

    private companion object {
        /** Most retained activations; each holds a whole evaluated character, so the cache stays bounded. */
        const val MAX_PREPARED = 48
    }

    fun check(definition: ResolvedEntry, content: RulesContent, instanceId: String): PreparedFeatChoice? {
        val entry = definition.entry
        val mechanics = entry.mechanics
        val root = slot.ordinal == 0 && slot.choiceId == "feat" &&
            AdvancementRules.rootCategory(level, slot) == EntryCategory.FEAT
        if (!root || level !in 1..document.level || document.levels.none { it.level == level } || entry.category != EntryCategory.FEAT ||
            mechanics.version != 2 || mechanics.copy(prerequisites = emptyList(), access = null,
                maximumSelections = null, unsupported = emptyList()) != Mechanics(version = 2)) {
            return null
        }
        if (document.levels.any { decisions -> decisions.replacements.any { it.replaces == slot } ||
                decisions.proficiencies.any { it.slot == slot } || decisions.values.any { it.slot == slot } }) {
            return null
        }
        val saved = baseline.levels.flatMap { decisions -> decisions.entries.map { it.selection } +
            decisions.replacements.map { it.replacement.selection } } + baseline.equipment.filter { it.equipped }.map { it.selection }
        val factsContent = content.copy(selections = content.selections.filterKeys { it in saved })
        val key = ContentKey(factsContent)
        val facts = prepared[key] ?: Evaluation(baseline, factsContent, targetInstance = "").also {
            it.run()
            factPreparations++
            prepared[key] = it
            // Snapshots differ by the prerequisite entries a feat references: about 30 distinct sets cover the
            // whole production feat list, so a smaller cap evicts and re-runs activations while the list is checked.
            if (prepared.size > MAX_PREPARED) {
                prepared.remove(prepared.keys.first())
            }
        }
        if (!facts.canCheckPassiveFeat(entry, instanceId, slot)) {
            return null
        }
        val eligibility = facts.passiveFeatEligibility(entry, slot, level)
        val selection = SavedSelection(entry.id, entry.presentation.title, definition.supplier.packageId, definition.fingerprint)
        val resolved = content.selections[selection] ?: return null
        if (resolved !is ContractResult.Available || resolved.value.entry != entry) {
            return null
        }
        val diagnostics = resolved.diagnostics.map { it.copy(slot = slot, entryId = entry.id) }.toMutableList()
        if (entry.coverage.status != CoverageStatus.SUPPORTED) {
            diagnostics += diagnostic("coverage", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "${entry.presentation.title}: ${entry.coverage.status}. ${entry.coverage.limitations.joinToString()}", slot, entry.id)
        }
        diagnostics += mechanics.unsupported.map { diagnostic("unsupportedMechanic", DiagnosticKind.INCOMPLETE_AUTOMATION,
            it, slot, entry.id) }
        diagnostics += eligibility.diagnostics
        return PreparedFeatChoice(eligibility, diagnostics.distinct())
    }
}

/**
 * Conservative list fast path for a pool slot's plain powers. The pool itself is already filtered by class and
 * level; a power whose only mechanics are its profile, usage limit and always/level/class-reference access
 * cannot change any character fact. The character with this slot emptied is therefore activated once, and each
 * candidate is judged by the ordinary eligibility code against that activation, which supplies the repeat limit
 * and the pool, level and class checks. Powers with prerequisites of their own (such as a skill proficiency),
 * any other mechanics, or any slot, instance or dependency conflict return null for normal candidate activation.
 * `content` must be prepared from [baseline], and the same instance must be passed for a whole list.
 */
internal class PreparedPowerChoices(
    private val document: CharacterDocument,
    private val level: Int,
    private val slot: ChoiceSlotId,
) {
    /** The character as the pool sees it before this slot is filled; prepare list content from this document. */
    val baseline = document.copy(levels = document.levels.map { decisions ->
        decisions.copy(entries = decisions.entries.filterNot { it.slot == slot })
    })
    private var prepared: Pair<RulesContent, Evaluation>? = null
    internal var baselinePreparations = 0
        private set

    /** [resolution] is the saved selection resolved exactly as candidate activation would resolve it. */
    fun check(definition: ResolvedEntry, resolution: ContractResult<ResolvedEntry>, content: RulesContent,
        instanceId: String): PreparedFeatChoice? {
        val entry = definition.entry
        val resolved = (resolution as? ContractResult.Available)?.value
        if (!plainPower(entry, content) || resolved == null || resolved.entry != entry) {
            return null
        }
        val facts = prepared?.takeIf { it.first == content }?.second ?: Evaluation(baseline, content, targetInstance = "").also {
            it.run()
            baselinePreparations++
            prepared = content to it
        }
        if (!facts.canCheckPassivePower(entry, instanceId, slot)) {
            return null
        }
        val eligibility = facts.passivePowerEligibility(entry, slot, level)
        val diagnostics = (resolution as ContractResult.Available).diagnostics.map { it.copy(slot = slot, entryId = entry.id) }.toMutableList()
        if (entry.coverage.status != CoverageStatus.SUPPORTED) {
            diagnostics += diagnostic("coverage", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "${entry.presentation.title}: ${entry.coverage.status}. ${entry.coverage.limitations.joinToString()}", slot, entry.id)
        }
        diagnostics += entry.mechanics.unsupported.map { diagnostic("unsupportedMechanic", DiagnosticKind.INCOMPLETE_AUTOMATION,
            it, slot, entry.id) }
        diagnostics += eligibility.diagnostics
        return PreparedFeatChoice(eligibility, diagnostics.distinct())
    }

    /** Powers whose mechanics are exactly a profile plus always/level/class-reference access. */
    private fun plainPower(entry: ContentEntry, content: RulesContent): Boolean {
        val mechanics = entry.mechanics
        if (level !in 1..document.level || document.levels.none { it.level == level } || content.diagnostics.isNotEmpty() ||
            entry.category != EntryCategory.POWER || mechanics.version != 2 || mechanics.powerProfile == null ||
            mechanics.copy(prerequisites = emptyList(), access = null, maximumSelections = null, unsupported = emptyList(),
                powerProfile = null) != Mechanics(version = 2)) {
            return false
        }
        if (document.levels.any { decisions -> decisions.replacements.any { it.replaces == slot } ||
                decisions.proficiencies.any { it.slot == slot } || decisions.values.any { it.slot == slot } }) {
            return false
        }
        val classReference = { leaf: Prerequisite.Entry ->
            (content.entries[leaf.entryId] as? ContractResult.Available)?.value?.entry?.category == EntryCategory.CLASS
        }
        return mechanics.access?.leaves().orEmpty().all {
            it is Prerequisite.Always || it is Prerequisite.Level || it is Prerequisite.Entry && classReference(it)
        } && mechanics.prerequisites.flatMap { it.leaves() }.all { it is Prerequisite.Always || it is Prerequisite.Level }
    }
}

private class Evaluation(
    private val document: CharacterDocument,
    private val content: RulesContent,
    private val factsOnly: Boolean = false,
    private val targetInstance: String? = null,
) {
    private val selectionTimeFacts by lazy {
        SelectionTimeFacts(document, content, entries, grantReplacementSlots, decisionLevels) { snapshot ->
            Evaluation(snapshot, content, factsOnly = true).also { it.run() }
        }
    }
    private val diagnostics = content.diagnostics.toMutableList()
    private val blockers = content.diagnostics.filter { it.kind == DiagnosticKind.UNRESOLVED_CONTENT }.toMutableList()
    private val entries = mutableListOf<EngineEntry>()
    private val instances = mutableSetOf<String>()
    private val choices = linkedMapOf<ChoiceSlotId, ChoiceDefinition>()
    private val grantReplacementSlots = mutableSetOf<ChoiceSlotId>()
    private val modifiers = mutableListOf<ModifierContribution>()
    private val proficiencies = linkedMapOf<Skill, MutableList<ChoiceSlotId>>()
    private val equipmentProficiencies = linkedMapOf<String, MutableList<ChoiceSlotId>>()
    private val usedEntries = mutableSetOf<EntryChoice>()
    private data class PendingChoice(val owner: EngineEntry, val choice: ChoiceDefinition, val ancestors: Set<String>, val acquiredAt: Int)
    private val choiceAcquisitionLevels = mutableMapOf<ChoiceSlotId, Int>()
    private val pendingChoices = mutableListOf<PendingChoice>()
    private val sets = mutableListOf<SelectionSetResult>()
    private val usedProficiencies = mutableSetOf<ProficiencyChoice>()
    private val valueDecisions = document.levels.sortedBy { it.level }.flatMap { it.values }
    private val facts = mutableListOf<StructuredFact>()
    private val selectedValues = mutableListOf<ValueChoice>()
    private val valueOptions = linkedMapOf<ChoiceSlotId, List<ValueOption>>()
    private val entryDecisions = effectiveDecisions()
    private val decisionLevels = document.levels.sortedBy { it.level }.flatMap { level ->
        level.entries.map { it.slot to level.level } + level.replacements.map { it.replaces to level.level }
    }.toMap().toMutableMap()

    /** Replay a replacement against its stable acquisition occurrence, retaining saved history. */
    private fun effectiveDecisions(): List<EntryChoice> {
        val current = mutableListOf<EntryChoice>()
        for (level in document.levels.sortedBy { it.level }) {
            current += level.entries
            for (change in level.replacements) {
                val original = current.singleOrNull { it.slot == change.replaces }
                val resolved = content.selections[change.replacement.selection] as? ContractResult.Available
                val source = original?.let { content.selections[it.selection] as? ContractResult.Available }
                if (original == null || change.replacement.slot != change.replaces ||
                    source?.value?.entry?.category != EntryCategory.POWER || resolved?.value?.entry?.category != EntryCategory.POWER) {
                    invalid("replacementTarget", "Replacement needs an existing power occurrence and the same persistent slot.",
                        change.replaces, change.replacement.selection.entryId)
                    continue
                }
                if (resolved.value.entry.mechanics.powerProfile?.level?.let { it > level.level } == true) {
                    invalid("replacementAcquisition", "A replacement power cannot exceed its recorded replacement level.",
                        change.replaces, change.replacement.selection.entryId)
                }
                current.remove(original)
                current += change.replacement.copy(instanceId = original.instanceId)
                if (change.kind == ReplacementKind.RETRAINING) {
                    diagnostics += diagnostic("replacementTiming", DiagnosticKind.INCOMPLETE_AUTOMATION,
                        "Retraining allowances are not specified by the local advancement rules.",
                        change.replaces, change.replacement.selection.entryId)
                } else {
                    val acquired = document.levels.firstOrNull { row -> row.entries.any { it.slot == change.replaces } }?.level
                    val profile = source.value.entry.mechanics.powerProfile
                    val classInstances = document.levels.flatMap { it.entries }.filter {
                        it.slot == ChoiceSlotId("creation", "class", 0)
                    }.map { it.instanceId }
                    if (level.level !in AdvancementRules.dailyReplacementLevels || acquired == null || acquired >= level.level ||
                        change.replaces.sourceInstanceId !in classInstances || profile?.powerKind != "ATTACK" || profile.usage != "DAILY" ||
                        level.replacements.count { it.kind == ReplacementKind.PROGRESSION } > 1) {
                        invalid("replacementTiming", "Replace one earlier class daily attack at levels 9, 15 and 19.",
                            change.replaces, change.replacement.selection.entryId)
                    }
                }
            }
        }
        return current
    }
    private val proficiencyDecisions = document.levels.sortedBy { it.level }.flatMap { it.proficiencies }
    private val abilityValues = linkedMapOf<Ability, StatisticCalculation>()
    private val abilityFacts = linkedMapOf<Ability, StatisticCalculation>()
    private val overviewAbilityTotals = linkedMapOf<Ability, Int>()
    private val overviewAbilityValues = linkedMapOf<Ability, ContractResult<CalculatedValue>>()
    private val proficiencySelectionRules by lazy { ProficiencySelectionRules(document, entries, proficiencies) }

    /** Never reuse activation when the candidate would create an instance or definition conflict. */
    fun canCheckPassiveFeat(entry: ContentEntry, instanceId: String, slot: ChoiceSlotId): Boolean =
        slot !in choices && slot !in grantReplacementSlots && entries.none {
            it.slot == slot || it.instanceId == instanceId || it.definition.entry.id == entry.id && it.definition.entry != entry
        }

    /** Uses exactly the ordinary eligibility implementation, including historical self-benefit exclusion. */
    fun passiveFeatEligibility(entry: ContentEntry, slot: ChoiceSlotId, level: Int): EntryEligibility {
        decisionLevels[slot] = level
        return eligibility(entry, slot, entries.map { it.definition.entry.id }.toSet())
    }

    /**
     * A plain power can be judged here only for an empty, offered, ordinary pool slot, with no occurrence or
     * definition conflict and no other counted occurrence whose requirements would be excluded as depending on it.
     */
    fun canCheckPassivePower(entry: ContentEntry, instanceId: String, slot: ChoiceSlotId): Boolean {
        val source = choices[slot] as? ChoiceDefinition.Entries ?: return false
        if (slot in grantReplacementSlots || entry.id !in source.entryIds || source.collection != null ||
            source.requiresCollection != null || source.constraints.any { it.type == "notKnown" }) {
            return false
        }
        if (entries.any { it.slot == slot || it.instanceId == instanceId || it.definition.entry.id == entry.id && it.definition.entry != entry }) {
            return false
        }
        return entries.filter { !it.granted || it.slot in grantReplacementSlots }.none { other ->
            val mechanics = other.definition.entry.mechanics
            (mechanics.prerequisites + listOfNotNull(mechanics.access)).flatMap { it.leaves() }
                .any { selectionTimeFacts.selfDependency(entry, it) }
        }
    }

    /** Uses exactly the ordinary eligibility implementation, as if the candidate were selected at [level]. */
    fun passivePowerEligibility(entry: ContentEntry, slot: ChoiceSlotId, level: Int): EntryEligibility {
        decisionLevels[slot] = level
        return eligibility(entry, slot, entries.map { it.definition.entry.id }.toSet())
    }

    fun run(): EngineResult {
        val repeatedSlots = (entryDecisions.map { it.slot } + proficiencyDecisions.map { it.slot } + valueDecisions.map { it.slot })
            .groupingBy { it }.eachCount().filterValues { it > 1 }.keys
        for (slot in repeatedSlots) {
            invalid("duplicateSlot", "Multiple decisions occupy the same choice slot.", slot)
            blockers += diagnostics.last()
        }
        if (document.level > 19) {
            diagnostics += diagnostic("progressionUnsupported", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "Progression after level 19 remains unsupported.")
        }
        for (level in document.levels.sortedBy { it.level }) {
            for (decision in level.entries) {
                if (decision.slot in repeatedSlots) {
                    continue
                }
                val rootCategory = AdvancementRules.rootCategory(level.level, decision.slot)
                if (rootCategory != null) {
                    usedEntries += decision
                    val definition = selected(decision)
                    if (definition != null) {
                        if (definition.entry.category != rootCategory) {
                            invalid("rootCategory", "Expected a $rootCategory selection.", decision.slot, definition.entry.id)
                        } else {
                            visit(definition, decision.instanceId, decision.slot, false, emptySet())
                        }
                    }
                }
            }
        }
        for (equipment in document.equipment.filter { it.equipped }) {
            val slot = ChoiceSlotId(equipment.instanceId, "equipment", 0)
            val resolved = content.selections[equipment.selection]
            val definition = accept(resolved, slot, equipment.selection.entryId)
            if (definition != null) {
                if (definition.entry.category != EntryCategory.ITEM) {
                    invalid("equipmentCategory", "Equipped definition must be an item.", slot, definition.entry.id)
                } else if (equipment.configuration.isNotEmpty()) {
                    diagnostics += diagnostic("equipmentConfiguration", DiagnosticKind.INCOMPLETE_AUTOMATION,
                        "Conditional equipment configurations are not interpreted by the proof engine.", slot, definition.entry.id)
                    visit(definition, equipment.instanceId, slot, false, emptySet())
                } else {
                    visit(definition, equipment.instanceId, slot, false, emptySet())
                }
            }
        }
        while (pendingChoices.isNotEmpty()) {
            // Resolve finite feature choices before shared pools, so active feature exceptions apply.
            val index = pendingChoices.indexOfFirst { (it.choice as? ChoiceDefinition.Entries)?.query == null }
                .let { if (it < 0) 0 else it }
            processChoice(pendingChoices.removeAt(index))
        }
        validateSelectionSets()
        for ((id, occurrences) in entries.groupBy { it.definition.entry.id }) {
            if (occurrences.map { it.definition.entry }.distinct().size > 1) {
                val error = diagnostic("conflictingDefinitions", DiagnosticKind.UNRESOLVED_CONTENT,
                    "Conflicting definitions for $id.", entryId = id)
                diagnostics += error
                blockers += error
            }
        }
        baselineProficiencies()
        for ((slot, definition) in choices) {
            if (definition is ChoiceDefinition.Proficiencies) {
                applyProficiency(slot, definition.skills)
            }
        }
        for (decision in entryDecisions.filter { it !in usedEntries }) {
            invalid("orphanEntry", "Choice has no active granting source or supported root slot.", decision.slot, decision.selection.entryId)
        }
        for (decision in proficiencyDecisions.filter { it !in usedProficiencies }) {
            invalid("orphanProficiency", "Proficiency choice has no active granting source.", decision.slot)
        }
        for (adjustment in document.manualAdjustments) {
            modifiers += ModifierContribution(adjustment.modifier, "Manual Adjustment", "manual:${adjustment.id}")
        }
        calculateEquipmentProficiencies()
        calculateValueChoices()
        calculateAbilities()
        if (factsOnly) {
            return EngineResult(emptyMap(), entries.toList(), emptyList(), proficiencies.mapValues { it.value.toList() },
                entries.associate { it.instanceId to it.definition.entry.coverage }, diagnostics.distinct())
        }
        val entryIds = entries.map { it.definition.entry.id }.toSet()
        val selectedEligibility = entries.filter { (!it.granted || it.slot in grantReplacementSlots) &&
            (targetInstance == null || it.instanceId == targetInstance) }.associate { entry ->
            entry.instanceId to eligibility(entry.definition.entry, entry.slot, entryIds)
        }
        diagnostics += selectedEligibility.values.flatMap { it.diagnostics }
        if (targetInstance != null) {
            return EngineResult(emptyMap(), entries.toList(), emptyList(), proficiencies.mapValues { it.value.toList() },
                entries.associate { it.instanceId to it.definition.entry.coverage }, diagnostics.distinct(),
                entryEligibility = selectedEligibility, selectionSets = sets.toList(),
                overviewAbilityTotals = overviewAbilityTotals.toMap(),
                equipmentProficiencies = equipmentProficiencies.mapValues { it.value.toList() }, facts = facts.toList())
        }
        val offered = choices.map { (slot, definition) ->
            when (definition) {
                is ChoiceDefinition.Entries -> EngineChoice(slot, optional = slot in grantReplacementSlots,
                    acquisitionLevel = if (slot in grantReplacementSlots) decisionLevels[slot] else choiceAcquisitionLevels[slot] ?: definition.atLevel, entries = definition.entryIds.map { id ->
                    val resolved = content.entries[id]
                    if (resolved is ContractResult.Available) {
                        eligibility(resolved.value.entry, slot, entryIds)
                    } else {
                        EntryEligibility(id, Eligibility.UNRESOLVED,
                            (resolved as? ContractResult.Unavailable)?.diagnostics.orEmpty().ifEmpty {
                                listOf(diagnostic("missingDefinition", DiagnosticKind.UNRESOLVED_CONTENT, "Definition $id is unavailable.", slot, id))
                            }.map { it.copy(slot = slot, entryId = id) })
                    }
                })
                is ChoiceDefinition.Proficiencies -> EngineChoice(slot, skills = proficiencySelectionRules.skills(slot, definition), acquisitionLevel = choiceAcquisitionLevels[slot])
                is ChoiceDefinition.MainAbility -> EngineChoice(slot, abilities = definition.abilities)
                is ChoiceDefinition.Values -> EngineChoice(slot, values = valueOptions[slot].orEmpty(), valueKind = definition.kind, acquisitionLevel = choiceAcquisitionLevels[slot])
            }
        }
        val statistics = linkedMapOf<ModifierTarget, StatisticCalculation>()
        for ((ability, value) in abilityValues) {
            statistics[ModifierTarget(Statistic.ABILITY_POINTS, ability = ability)] = value
        }
        for (skill in Skill.entries) {
            val ability = abilityValues.getValue(skill.ability).value
            val target = ModifierTarget(Statistic.SKILL_CHECK, skill = skill)
            val proficiency = skillProficiency(skill, proficiencies[skill]?.firstOrNull())
            val contributions = proficiency + modifiers.filter { it.modifier.target == target }
            statistics[target] = ModifierCalculator.calculate(ability, contributions)
        }
        val defenseEquipment = DefenseEquipment(entries, equipmentProficiencies.keys)
        val overviewStatistics = linkedMapOf<Statistic, ContractResult<CalculatedValue>>()
        val mayPreview = blockers.all { it.code == "engine.missingChoice" }
        for (statistic in Statistic.entries.filter { it != Statistic.ABILITY_POINTS && it != Statistic.SKILL_CHECK }) {
            val target = ModifierTarget(statistic)
            val isDefense = statistic in defenseStatistics
            val contributions = modifiers.filter { it.modifier.target == target } + if (isDefense) {
                defenseEquipment.modifiers(statistic, document.level)
            } else {
                emptyList()
            }
            val base = if (blockers.isEmpty()) {
                statisticBase(statistic, defenseEquipment) { abilityValues.getValue(it).value }
            } else {
                ContractResult.Unavailable(blockers.toList())
            }
            val calculation = ModifierCalculator.calculate(base, contributions)
            statistics[target] = calculation
            if ((isDefense || statistic in partialStatistics) && mayPreview && calculation.value is ContractResult.Unavailable) {
                val preview = statisticBase(statistic, defenseEquipment) { overviewAbilityValues.getValue(it) }
                overviewStatistics[statistic] = ModifierCalculator.calculate(preview, contributions).value
            }
        }
        diagnostics += statistics.values.flatMap { calculation ->
            (calculation.value as? ContractResult.Unavailable)?.diagnostics.orEmpty().filter { it.code != "engine.missingBase" }
        }
        return EngineResult(statistics, entries.toList(), offered, proficiencies.mapValues { it.value.toList() },
            entries.associate { it.instanceId to it.definition.entry.coverage }, diagnostics.distinct(),
            entries.flatMap { occurrence -> occurrence.definition.entry.mechanics.conditionalModifiers.map {
                ConditionalContribution(occurrence.instanceId, occurrence.slot, it)
            } }, selectedEligibility, sets.toList(), overviewAbilityTotals.toMap(), equipmentProficiencies.mapValues { it.value.toList() }, facts.toList(),
            overviewStatistics)
    }

    /** Resolve finite fact decisions in acquisition order, preserving rejected decisions for diagnostics. */
    private fun acquisitionLevel(occurrence: EngineEntry, seen: Set<String> = emptySet()): Int {
        decisionLevels[occurrence.slot]?.let { return it }
        if (occurrence.instanceId in seen) {
            return document.level
        }
        val parent = entries.singleOrNull { it.instanceId == occurrence.slot.sourceInstanceId } ?: return 1
        val mechanics = parent.definition.entry.mechanics
        val grantedAt = mechanics.grants.filterIsInstance<Grant.Entry>().singleOrNull { it.grantId == occurrence.slot.choiceId }?.atLevel ?: 1
        val progressedAt = mechanics.progression.filter { progression -> progression.grants.any {
            it is Grant.Entry && it.grantId == occurrence.slot.choiceId
        } }.maxOfOrNull { it.level } ?: 1
        return maxOf(grantedAt, progressedAt, acquisitionLevel(parent, seen + occurrence.instanceId))
    }

    private fun calculateValueChoices() {
        fun grant(kind: FactKind, value: String, target: String?, slot: ChoiceSlotId) {
            facts += StructuredFact(kind, value, target, slot)
            for (link in entries.flatMap { it.definition.entry.mechanics.factLinks }.filter { it.kind == kind && it.sourceTargetId == target }) {
                facts += StructuredFact(kind, value, link.targetId, slot)
            }
            if (kind == FactKind.EQUIPMENT_PROFICIENCY) {
                equipmentProficiencies.getOrPut(value) { mutableListOf() }.add(slot)
            }
        }
        val used = mutableSetOf<ValueChoice>()
        val ordered = entries.sortedWith(compareBy<EngineEntry> { acquisitionLevel(it) }
            .thenBy { if (it.definition.entry.category == EntryCategory.FEAT) 1 else 0 })
        for ((_, acquired) in ordered.groupBy { acquisitionLevel(it) }) {
            // Independent explicit grants at the same acquisition level are already present before decisions.
            for (owner in acquired) {
                for (fact in owner.definition.entry.mechanics.facts) {
                    for (value in fact.values) { grant(fact.kind, value, fact.targetId, owner.slot) }
                }
            }
            for (owner in acquired) {
                val definitions = choices.filterKeys { it.sourceInstanceId == owner.instanceId }.values
                    .filterIsInstance<ChoiceDefinition.Values>().distinctBy { it.id }
                for (choice in definitions) {
                    val prior = facts.filter { fact -> fact.kind == choice.kind && when (choice.distinctScope) {
                        FactScope.NONE -> false
                        FactScope.CHARACTER -> fact.targetId == null
                        FactScope.POWER -> fact.targetId == choice.targetId
                        FactScope.ENTRY -> entries.any { it.definition.entry.id == owner.definition.entry.id &&
                            it.instanceId == fact.source.sourceInstanceId } && fact.source.choiceId == choice.id
                    } }.map { it.value }.toMutableSet()
                    if (choice.distinctScope == FactScope.ENTRY) {
                        prior += selectedValues.filter { it.slot.choiceId == choice.id && entries.any { ownerEntry ->
                            ownerEntry.instanceId == it.slot.sourceInstanceId && ownerEntry.definition.entry.id == owner.definition.entry.id
                        } }.map { it.value }
                    }
                    for (ordinal in 0 until choice.count) {
                        val slot = ChoiceSlotId(owner.instanceId, choice.id, ordinal)
                        var available = choice.options.filter { it.id !in prior }
                        if (choice.distinctScope == FactScope.NONE) {
                            available = choice.options
                        }
                        if (available.isEmpty() && choice.allowRepeatWhenExhausted) {
                            available = choice.options
                        }
                        valueOptions[slot] = available
                        val decisions = valueDecisions.filter { it.slot == slot }
                        used += decisions
                        val decision = decisions.singleOrNull()
                        if (decision == null) {
                            invalid("missingValue", "Select exactly one ${choice.kind} option.", slot, owner.definition.entry.id)
                            continue
                        }
                        val storedAt = document.levels.single { decision in it.values }.level
                        if (storedAt != acquisitionLevel(owner)) {
                            invalid("valueTiming", "Decision must belong to its source acquisition level; later choices cannot rewrite earlier facts.", slot, owner.definition.entry.id)
                            continue
                        }
                        val option = available.singleOrNull { it.id == decision.value }
                        if (option == null) {
                            invalid("valueOption", "Saved ${choice.kind} decision is unavailable, already known, or repeated.", slot, owner.definition.entry.id)
                            continue
                        }
                        prior += option.id
                        selectedValues += decision
                        for (value in option.grants.ifEmpty { listOf(option.id) }) {
                            grant(choice.kind, value, choice.targetId, slot)
                        }
                        if (choice.kind == FactKind.SKILL_BONUS) {
                            val skill = Skill.entries.firstOrNull { it.name == option.id }
                            if (skill != null) {
                                val bonus = if (document.level >= 21 && choice.epicBonus != 0) choice.epicBonus else choice.bonus
                                modifiers += ModifierContribution(TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = skill),
                                    ModifierOperation.ADD, bonus, BonusType.FEAT), owner.definition.entry.presentation.title,
                                    owner.definition.entry.id, slot)
                            }
                        }
                    }
                }
            }
        }
        for (decision in valueDecisions.filter { it !in used }) {
            invalid("orphanValue", "Saved decision has no active granting source or slot.", decision.slot)
        }
    }

    /** Replay equipment grants in acquisition order, including independent grants before each advancement. */
    private fun calculateEquipmentProficiencies() {
        fun level(occurrence: EngineEntry, seen: Set<String> = emptySet()): Int {
            decisionLevels[occurrence.slot]?.let { return it }
            if (occurrence.instanceId in seen) {
                return document.level
            }
            val parent = entries.singleOrNull { it.instanceId == occurrence.slot.sourceInstanceId } ?: return 1
            val mechanics = parent.definition.entry.mechanics
            val grantLevel = mechanics.grants.filterIsInstance<Grant.Entry>()
                .singleOrNull { it.grantId == occurrence.slot.choiceId }?.atLevel ?: 1
            val progressionLevel = mechanics.progression.filter { progression -> progression.grants.any {
                it is Grant.Entry && it.grantId == occurrence.slot.choiceId
            } }.maxOfOrNull { it.level } ?: 1
            return maxOf(grantLevel, progressionLevel, level(parent, seen + occurrence.instanceId))
        }
        fun grant(value: String, source: ChoiceSlotId) {
            equipmentProficiencies.getOrPut(value) { mutableListOf() }.add(source)
        }
        for ((_, acquired) in entries.groupBy { level(it) }.entries.sortedBy { it.key }) {
            for (occurrence in acquired) {
                val mechanics = occurrence.definition.entry.mechanics
                val values = mechanics.classProfile?.proficiencies?.values?.flatten().orEmpty() + mechanics.equipmentProficiencies
                for (value in values.distinct()) {
                    grant(value, occurrence.slot)
                }
            }
            for (occurrence in acquired) {
                val advancement = occurrence.definition.entry.mechanics.armorAdvancement ?: continue
                val highest = advancement.order.indexOfLast { it in equipmentProficiencies }
                if (highest >= 0 && highest + advancement.steps <= advancement.order.lastIndex) {
                    grant(advancement.order[highest + advancement.steps], occurrence.slot)
                }
            }
        }
    }

    private fun statisticBase(
        statistic: Statistic,
        equipment: DefenseEquipment,
        abilityValue: (Ability) -> ContractResult<CalculatedValue>,
    ): ContractResult<CalculatedValue> {
        val base = when (statistic) {
            Statistic.AC -> equipment.armorClassBase(abilityValue)
            Statistic.REFLEX -> equipment.reflexUnavailable ?: classBase(statistic, abilityValue)
            else -> classBase(statistic, abilityValue)
        }
        return base ?: ContractResult.Unavailable(listOf(diagnostic("missingBase", DiagnosticKind.INCOMPLETE_AUTOMATION,
            "$statistic has no authored base; an ADD is not a base value.")))
    }

    /** A single active class establishes a base with every term visible in the breakdown. */
    private fun classBase(
        statistic: Statistic,
        abilityValue: (Ability) -> ContractResult<CalculatedValue>,
    ): ContractResult<CalculatedValue>? {
        val classes = entries.filter { it.definition.entry.mechanics.classProfile != null }
        if (classes.isEmpty()) {
            return null
        }
        if (classes.size != 1) {
            return ContractResult.Unavailable(listOf(diagnostic("conflictingClasses", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "Multiple class profiles cannot establish one class statistic.")))
        }
        val owner = classes.single()
        val formula = owner.definition.entry.mechanics.classProfile!!.statistics[statistic] ?: return null
        val terms = if (statistic in defenseStatistics && statistic != Statistic.AC && formula.base >= 10) {
            mutableListOf(Contributor("Defense base", 10),
                Contributor("${owner.definition.entry.presentation.title} defense bonus", formula.base - 10, owner.slot))
        } else {
            mutableListOf(Contributor("${owner.definition.entry.presentation.title} base", formula.base, owner.slot))
        }
        val level = formula.perLevel.toLong() * document.level
        if (level !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) {
            return ContractResult.Unavailable(listOf(diagnostic("formulaOverflow", DiagnosticKind.INCOMPLETE_AUTOMATION, "Class formula overflow.")))
        }
        terms += Contributor("Class level", level.toInt(), owner.slot)
        for ((ability, multiplier) in formula.abilities) {
            val value = abilityValue(ability)
            if (value is ContractResult.Unavailable) {
                return value
            }
            val term = (value as ContractResult.Available).value.total.toLong() * multiplier
            if (term !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) {
                return ContractResult.Unavailable(listOf(diagnostic("formulaOverflow", DiagnosticKind.INCOMPLETE_AUTOMATION, "Class formula overflow.")))
            }
            terms += Contributor("$ability x $multiplier", term.toInt(), document.abilities.source)
        }
        val total = terms.sumOf { it.value.toLong() }
        return if (total in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) {
            ContractResult.Available(CalculatedValue(total.toInt(), terms))
        } else {
            ContractResult.Unavailable(listOf(diagnostic("formulaOverflow", DiagnosticKind.INCOMPLETE_AUTOMATION, "Class formula overflow.")))
        }
    }

    private fun selected(decision: EntryChoice): ResolvedEntry? = accept(content.selections[decision.selection], decision.slot, decision.selection.entryId)

    private fun accept(result: ContractResult<ResolvedEntry>?, slot: ChoiceSlotId, id: String): ResolvedEntry? {
        return when (result) {
            is ContractResult.Available -> {
                diagnostics += result.diagnostics.map { it.copy(slot = slot, entryId = id) }
                if (result.value.entry.id != id) {
                    val error = diagnostic("definitionMismatch", DiagnosticKind.UNRESOLVED_CONTENT, "Resolved definition does not match $id.", slot, id)
                    diagnostics += error
                    blockers += error
                    null
                } else {
                    result.value
                }
            }
            else -> {
                val errors = (result as? ContractResult.Unavailable)?.diagnostics.orEmpty().ifEmpty {
                    listOf(diagnostic("missingDefinition", DiagnosticKind.UNRESOLVED_CONTENT, "Definition $id is unavailable.", slot, id))
                }.map { it.copy(slot = slot, entryId = id) }
                diagnostics += errors
                blockers += errors
                null
            }
        }
    }

    private fun visit(resolved: ResolvedEntry, instance: String, slot: ChoiceSlotId, granted: Boolean, ancestors: Set<String>) {
        val entry = resolved.entry
        if (entry.id in ancestors) {
            val error = diagnostic("grantCycle", DiagnosticKind.INCOMPLETE_AUTOMATION, "Recursive grant of ${entry.id} was stopped.", slot, entry.id)
            diagnostics += error
            blockers += error
            return
        }
        if (!instances.add(instance)) {
            invalid("duplicateInstance", "Entry occurrences must have unique instance IDs.", slot, entry.id)
            blockers += diagnostics.last()
            return
        }
        entries += EngineEntry(instance, slot, resolved, granted)
        if (entry.coverage.status != CoverageStatus.SUPPORTED) {
            diagnostics += diagnostic("coverage", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "${entry.presentation.title}: ${entry.coverage.status}. ${entry.coverage.limitations.joinToString()}", slot, entry.id)
        }
        val progression = entry.mechanics.progression.filter { it.level <= document.level }
        if (entry.mechanics.version !in 1..2) {
            val error = diagnostic("mechanicsVersion", DiagnosticKind.INCOMPATIBLE_FORMAT,
                "Unsupported mechanics version ${entry.mechanics.version}.", slot, entry.id)
            diagnostics += error
            blockers += error
            return
        }
        for (reason in entry.mechanics.unsupported) {
            diagnostics += diagnostic("unsupportedMechanic", DiagnosticKind.INCOMPLETE_AUTOMATION, reason, slot, entry.id)
        }
        val profile = entry.mechanics.classProfile
        if (profile != null && entry.category != EntryCategory.CLASS) {
            val error = diagnostic("classProfile", DiagnosticKind.INCOMPLETE_AUTOMATION, "Only a class may establish class statistics.", slot, entry.id)
            diagnostics += error
            blockers += error
        }
        val sourceChoices = (entry.mechanics.choices + progression.flatMap { it.choices } +
            if (profile != null) listOf(ChoiceDefinition.MainAbility("main", profile.mainAbilities)) else emptyList())
            .filter { it !is ChoiceDefinition.Entries || it.atLevel <= document.level }
        val sourceGrants = (entry.mechanics.grants + progression.flatMap { it.grants }).filter { it !is Grant.Entry || it.atLevel <= document.level }
        for (modifier in entry.mechanics.modifiers + progression.flatMap { it.modifiers }) {
            modifiers += ModifierContribution(modifier, entry.presentation.title, entry.id, slot)
        }
        val grantIds = sourceGrants.map { when (it) { is Grant.Entry -> it.grantId; is Grant.Proficiency -> it.grantId } }
        for (grant in sourceGrants) {
            val id = when (grant) { is Grant.Entry -> grant.grantId; is Grant.Proficiency -> grant.grantId }
            if (id.isBlank() || grantIds.count { it == id } != 1) {
                diagnostics += diagnostic("grantDefinition", DiagnosticKind.INCOMPLETE_AUTOMATION,
                    "Grant IDs must be nonblank and unique within an occurrence.", slot, entry.id)
                blockers += diagnostics.last()
                continue
            }
            val grantSlot = ChoiceSlotId(instance, id, 0)
            when (grant) {
                is Grant.Proficiency -> proficiencies.getOrPut(grant.skill) { mutableListOf() }.add(grantSlot)
                is Grant.Entry -> {
                    val saved = entryDecisions.filter { it.slot == grantSlot }
                    val acquiredAt = maxOf(acquisitionLevel(entries.first { it.instanceId == instance }), grant.atLevel,
                        progression.filter { grant in it.grants }.maxOfOrNull { it.level } ?: 1)
                    decisionLevels[grantSlot] = acquiredAt
                    if (grant.replacementEntryIds.isNotEmpty()) {
                        grantReplacementSlots += grantSlot
                        choices[grantSlot] = ChoiceDefinition.Entries(id, 1, listOf(grant.entryId) + grant.replacementEntryIds,
                            atLevel = grant.atLevel)
                    }
                    val decision = saved.singleOrNull()
                    val next = if (saved.isEmpty()) {
                        accept(content.entries[grant.entryId], grantSlot, grant.entryId)
                    } else {
                        usedEntries += saved
                        if (decision == null) {
                            invalid("duplicateSlot", "A grant substitution needs exactly one saved decision.", grantSlot)
                            null
                        } else if (document.levels.single { decision in it.entries }.level != acquiredAt) {
                            invalid("grantTiming", "A grant substitution must be recorded at its source acquisition level; the default grant remains active.",
                                grantSlot, decision.selection.entryId)
                            accept(content.entries[grant.entryId], grantSlot, grant.entryId)
                        } else if (decision.selection.entryId != grant.entryId && decision.selection.entryId !in grant.replacementEntryIds ||
                            grant.replacementEntryIds.isEmpty()) {
                            invalid("grantReplacement", "Saved substitution is no longer permitted by this grant; the default grant remains active.",
                                grantSlot, decision.selection.entryId)
                            accept(content.entries[grant.entryId], grantSlot, grant.entryId)
                        } else {
                            if (decision.instanceId != ModernCreation.grantInstance(instance, id)) {
                                invalid("grantInstance", "A grant substitution must retain its stable granted occurrence identity.", grantSlot, decision.selection.entryId)
                            }
                            selected(decision)
                        }
                    }
                    if (next != null) {
                        visit(next, ModernCreation.grantInstance(instance, id), grantSlot, true, ancestors + entry.id)
                    }
                }
            }
        }
        val owner = entries.first { it.instanceId == instance }
        for (choice in sourceChoices) {
            val acquiredAt = maxOf(acquisitionLevel(owner), (choice as? ChoiceDefinition.Entries)?.atLevel ?: 1,
                progression.filter { choice in it.choices }.maxOfOrNull { it.level } ?: 1)
            pendingChoices += PendingChoice(owner, choice, ancestors + entry.id, acquiredAt)
        }
    }

    private fun processChoice(pending: PendingChoice) {
        val owner = pending.owner
        val instance = owner.instanceId
        var choice = pending.choice
        val id = when (choice) { is ChoiceDefinition.Entries -> choice.id; is ChoiceDefinition.Proficiencies -> choice.id; is ChoiceDefinition.MainAbility -> choice.id; is ChoiceDefinition.Values -> choice.id }
        if (choice is ChoiceDefinition.Entries) {
            val changes = entries.flatMap { it.definition.entry.mechanics.selectionModifiers }.filter { it.choiceId == id }
                .map { modifier -> modifier.copy(count = modifier.countByLevel.filter { it.atLevel <= document.level }
                    .maxByOrNull { it.atLevel }?.count ?: modifier.count) }
            if (changes.map { it.count }.distinct().size > 1 || changes.mapNotNull { it.collection }.distinct().size > 1) {
                diagnostics += diagnostic("selectionOverrideConflict", DiagnosticKind.INCOMPLETE_AUTOMATION,
                    "Active features disagree about count or collection for $id.", ChoiceSlotId(instance, id, 0))
            } else {
                choice = choice.copy(count = changes.firstOrNull()?.count ?: choice.countByLevel
                    .filter { it.atLevel <= document.level }.maxByOrNull { it.atLevel }?.count ?: choice.count,
                    constraints = (choice.constraints + changes.flatMap { it.constraints }).distinct(),
                    collection = changes.firstNotNullOfOrNull { it.collection } ?: choice.collection)
            }
            val query = choice.query
            if (query != null) {
                if (query.category != EntryCategory.POWER) {
                    diagnostics += diagnostic("queryCoverage", DiagnosticKind.INCOMPLETE_AUTOMATION,
                        "${query.category} query requires an adapted fact catalog; no candidate eligibility is inferred.", ChoiceSlotId(instance, id, 0))
                }
                val replacementLevel = document.levels.filter { level -> level.replacements.any {
                    it.replaces.sourceInstanceId == instance && it.replaces.choiceId == id
                } }.maxOfOrNull { it.level }
                val ceiling = if (query.characterLevel) document.level else maxOf(query.levelMaximum ?: choice.atLevel,
                    replacementLevel ?: choice.atLevel)
                val candidates = content.entries.values.filterIsInstance<ContractResult.Available<ResolvedEntry>>()
                    .map { it.value.entry }.filter { candidate ->
                        val profile = candidate.mechanics.powerProfile
                        query.category == EntryCategory.POWER && candidate.category == query.category && profile != null && candidate.mechanics.access != null &&
                            (query.usage == null || profile.usage == query.usage) &&
                            (query.powerKind == null || profile.powerKind == query.powerKind) &&
                            (query.pickKind == null || query.pickKind in profile.pickKinds) &&
                            profile.level <= ceiling &&
                            profile.keywords.containsAll(query.keywords)
                    }.map { it.id }.sorted()
                choice = choice.copy(entryIds = candidates, query = null)
            }
        }
        val count = when (choice) { is ChoiceDefinition.Entries -> choice.count; is ChoiceDefinition.Proficiencies -> choice.count; is ChoiceDefinition.MainAbility -> 1; is ChoiceDefinition.Values -> choice.count }
        if (id.isBlank() || count !in 0..100 || choices.keys.any { it.sourceInstanceId == instance && it.choiceId == id } ||
            choice is ChoiceDefinition.Entries && (choice.entryIds.distinct().size != choice.entryIds.size || choice.entryIds.any { it.isBlank() } ||
                (pending.choice as? ChoiceDefinition.Entries)?.query == null && choice.distinct && count > choice.entryIds.size)) {
            diagnostics += diagnostic("choiceDefinition", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "Choice IDs must be unique and counts must be within 0?100.", owner.slot, owner.definition.entry.id)
            return
        }
        if (choice is ChoiceDefinition.Entries) {
            effectiveSets += Triple(owner, choice, pending.ancestors)
        }
        for (ordinal in 0 until count) {
            val slot = ChoiceSlotId(instance, id, ordinal)
            choiceAcquisitionLevels[slot] = pending.acquiredAt
            val originalQuery = (pending.choice as? ChoiceDefinition.Entries)?.query
            val slotChoice = if (choice is ChoiceDefinition.Entries && originalQuery != null && !originalQuery.characterLevel) {
                val replacedAt = document.levels.filter { level -> level.replacements.any { it.replaces == slot } }.maxOfOrNull { it.level }
                val maximum = replacedAt ?: originalQuery.levelMaximum ?: choice.atLevel
                choice.copy(entryIds = choice.entryIds.filter { candidate ->
                    val found = content.entries[candidate] as? ContractResult.Available
                    found?.value?.entry?.mechanics?.powerProfile?.level?.let { it <= maximum } == true
                })
            } else choice
            choices[slot] = slotChoice
            if (choice is ChoiceDefinition.Entries) {
                val decisions = entryDecisions.filter { it.slot == slot }
                if (decisions.size != 1) {
                    invalid("missingChoice", "Select exactly one entry for this slot.", slot, owner.definition.entry.id)
                    blockers += diagnostics.last()
                    continue
                }
                val decision = decisions.single()
                usedEntries += decision
                val definition = selected(decision)
                if (decision.selection.entryId !in (slotChoice as ChoiceDefinition.Entries).entryIds) {
                    invalid("choiceOption", "Selected entry is not an option for this slot.", slot, decision.selection.entryId)
                }
                // Preserve and diagnose invalid saved decisions; never silently drop an owned occurrence.
                if (definition != null) {
                    visit(definition, decision.instanceId, slot, false, pending.ancestors)
                }
            }
        }
    }

    private val effectiveSets = mutableListOf<Triple<EngineEntry, ChoiceDefinition.Entries, Set<String>>>()

    private fun validateSelectionSets() {
        val collections = linkedMapOf<String, MutableList<EntryChoice>>()
        for ((owner, choice) in effectiveSets) {
            val selected = entryDecisions.filter { it.slot.sourceInstanceId == owner.instanceId && it.slot.choiceId == choice.id && it.slot.ordinal < choice.count }
            choice.collection?.let { collections.getOrPut(it) { mutableListOf() }.addAll(selected) }
        }
        for ((owner, choice) in effectiveSets) {
            val slot = ChoiceSlotId(owner.instanceId, choice.id, 0)
            val selected = entryDecisions.filter { it.slot.sourceInstanceId == owner.instanceId && it.slot.choiceId == choice.id }
            val errors = mutableListOf<Diagnostic>()
            fun error(code: String, message: String, kind: DiagnosticKind = DiagnosticKind.INVALID_SELECTION) {
                errors += diagnostic(code, kind, message, slot)
            }
            if (selected.size > choice.count) {
                error("selectionCount", "This choice requires ${choice.count} entries; ${selected.size} are saved.")
            }
            val constraints = choice.constraints + if (choice.distinct) listOf(SelectionConstraint("distinct")) else emptyList()
            for (constraint in constraints.distinct()) {
                if (constraint.type == "distinct" && selected.map { it.selection.entryId }.distinct().size != selected.size) {
                    error("distinctChoice", "Choose different entries within this choice set.")
                }
                if (constraint.type == "notKnown") {
                    val known = entries.filter { other -> other.slot.sourceInstanceId != owner.instanceId || other.slot.choiceId != choice.id }
                        .filter { (choices[it.slot] as? ChoiceDefinition.Entries)?.requiresCollection == null }
                        .map { it.definition.entry.id }.toSet()
                    if (selected.any { it.selection.entryId in known }) {
                        error("alreadyKnown", "Stored power must differ from powers already known.")
                    }
                }
                if (constraint.type == "keywordCount") {
                    val profiles = selected.map { (content.selections[it.selection] as? ContractResult.Available)?.value?.entry?.mechanics?.powerProfile }
                    if (profiles.any { it == null }) {
                        error("constraintUnavailable", "Keyword bounds depend on unavailable power facts.", DiagnosticKind.INCOMPLETE_AUTOMATION)
                    } else {
                        val matching = profiles.count { constraint.keyword in it!!.keywords }
                        val remaining = (choice.count - selected.size).coerceAtLeast(0)
                        if (matching + remaining < constraint.minimum || constraint.maximum?.let { matching > it } == true) {
                            error("keywordCount", "Choose ${constraint.minimum}?${constraint.maximum ?: choice.count} ${constraint.keyword} powers in this set; currently $matching.")
                        }
                    }
                }
            }
            for (level in document.levels) {
                if (choice.replacementLevels.isNotEmpty() && level.replacements.any {
                    it.replaces.sourceInstanceId == owner.instanceId && it.replaces.choiceId == choice.id
                } && level.level !in choice.replacementLevels) {
                    error("replacementLevel", "This stored choice may only be replaced at levels ${choice.replacementLevels}.")
                }
            }
            choice.requiresCollection?.let { required ->
                val owned = collections[required].orEmpty().map { it.selection.entryId }.toSet()
                for (decision in selected.filter { it.selection.entryId !in owned }) {
                    errors += diagnostic("collectionOwnership", DiagnosticKind.INVALID_SELECTION,
                        "Prepared/stored choice must belong to $required.", decision.slot, decision.selection.entryId)
                }
            }
            choice.collection?.let { id ->
                val definitions = entries.flatMap { it.definition.entry.mechanics.collections }.filter { it.id == id }
                if (definitions.isEmpty() || definitions.map { it.capacity }.distinct().size != 1) {
                    error("collectionDefinition", "Collection $id is missing or has conflicting capacities.", DiagnosticKind.INCOMPLETE_AUTOMATION)
                } else if (collections[id].orEmpty().size > definitions.first().capacity) {
                    error("collectionCapacity", "Collection $id exceeds capacity ${definitions.first().capacity}.")
                }
            }
            if (selected.size < choice.count) {
                errors += diagnostic("selectionRemaining", DiagnosticKind.INVALID_SELECTION,
                    "${choice.count - selected.size} selections remain for this choice set.", slot)
            }
            diagnostics += errors
            sets += SelectionSetResult(owner.instanceId, choice.id, choice.count, selected.size,
                (choice.count - selected.size).coerceAtLeast(0), errors)
        }
    }

    private fun baselineProficiencies() {
        for (ordinal in 0..1) {
            val slot = ChoiceSlotId("creation", "free-skill", ordinal)
            choices[slot] = ChoiceDefinition.Proficiencies("free-skill", 2, Skill.entries)
        }
        fun background(kind: String, options: Map<String, List<Skill>>) {
            val prefix = "background.$kind."
            val explicit = if (kind == "environment") document.identity.environment else document.identity.upbringing
            val sources = if (explicit.isNotBlank()) listOf(prefix + explicit) else
                proficiencyDecisions.map { it.slot.sourceInstanceId }.filter { it.startsWith(prefix) }.distinct()
            if (sources.size != 1) {
                invalid("background", "Select exactly one $kind and its skill.", ChoiceSlotId("background.$kind", "skill", 0))
                return
            }
            val source = sources.single()
            val skills = options[source.removePrefix(prefix)]
            if (skills == null) {
                invalid("background", "Unknown $kind choice.", ChoiceSlotId(source, "skill", 0))
            } else {
                choices[ChoiceSlotId(source, "skill", 0)] = ChoiceDefinition.Proficiencies("skill", 1, skills)
            }
        }
        background("environment", ModernCreation.environments)
        background("upbringing", ModernCreation.upbringings)
    }

    private fun applyProficiency(slot: ChoiceSlotId, options: List<Skill>) {
        val decisions = proficiencyDecisions.filter { it.slot == slot }
        usedProficiencies += decisions
        if (decisions.size != 1) {
            invalid("missingChoice", "Select exactly one skill for this slot.", slot)
            return
        }
        val decision = decisions.single()
        if (decision.skill !in options) {
            invalid("choiceOption", "Skill is not an option for its source.", slot)
            return
        }
        val sources = proficiencies.getOrPut(decision.skill) { mutableListOf() }
        if (sources.isNotEmpty()) {
            diagnostics += diagnostic("duplicateProficiency", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "Duplicate proficiency adds +5 only once. Any replacement choice needs a rule clarification.", slot)
        }
        sources += slot
    }

    private fun calculateAbilities() {
        val allocation = document.abilities
        val points = Ability.entries.associateWith { allocation.points[it] ?: 0 }
        val validPoints = allocation.hasValidPoints()
        val source = choices[allocation.source] as? ChoiceDefinition.MainAbility
        val legalSource = source != null && allocation.mainAbility in source.abilities
        val classInstances = entries.filter { it.definition.entry.category == EntryCategory.CLASS }.map { it.instanceId }.toSet()
        val classAbilities = choices.filterKeys { it.sourceInstanceId in classInstances }.values
            .filterIsInstance<ChoiceDefinition.MainAbility>().flatMap { it.abilities }.distinct()
        val defaultMain = if (allocation.source.sourceInstanceId in classInstances && legalSource) {
            allocation.mainAbility
        } else {
            classAbilities.singleOrNull()
        }
        val hasAllocation = points.values.any { it != 0 }
        val legal = validPoints && legalSource
        val errors = mutableListOf<Diagnostic>()
        if (!legalSource) {
            errors += diagnostic("mainAbility", DiagnosticKind.INVALID_SELECTION,
                "Main ability must be chosen from an active source's main-ability slot.", allocation.source)
        }
        if (!validPoints) {
            errors += diagnostic("abilityAllocation", DiagnosticKind.INVALID_SELECTION,
                "Assign main 4 and non-main 5, at most 2 each; optionally lower one non-main to -1 and raise another by 1.", allocation.source)
        }
        diagnostics += errors
        for ((slot, definition) in choices) {
            if (definition is ChoiceDefinition.MainAbility && slot != allocation.source) {
                diagnostics += diagnostic("missingChoice", DiagnosticKind.INVALID_SELECTION,
                    "Main-ability slot is not filled by this allocation.", slot)
            }
        }
        val advancementPoints = Ability.entries.associateWith { 0 }.toMutableMap()
        for (level in document.levels) {
            for (advancement in level.abilityAdvancements) {
                if (!AdvancementRules.validAdvancement(level.level, advancement, allocation.mainAbility) ||
                    level.abilityAdvancements.size != 1) {
                    errors += diagnostic("abilityAdvancement", DiagnosticKind.INVALID_SELECTION,
                        "Choose exactly one non-main ability to increase by 1 at levels 4 and 12.", advancement.slot)
                } else {
                    for ((ability, amount) in advancement.increases) {
                        advancementPoints[ability] = advancementPoints.getValue(ability) + amount
                    }
                }
            }
        }
        for (level in AdvancementRules.nonMainLevels.filter { it <= document.level }) {
            if (document.levels.singleOrNull { it.level == level }?.abilityAdvancements.isNullOrEmpty()) {
                errors += diagnostic("missingAdvancement", DiagnosticKind.INVALID_SELECTION,
                    "Choose a non-main ability to increase by 1.", AdvancementRules.abilitySlot(level))
            }
        }
        if (document.level >= 8) {
            advancementPoints[allocation.mainAbility] = advancementPoints.getValue(allocation.mainAbility) + 1
        }
        if (document.level >= 16) {
            for (ability in Ability.entries) {
                advancementPoints[ability] = advancementPoints.getValue(ability) + 1
            }
        }
        diagnostics += errors.filter { it !in diagnostics }
        for (ability in Ability.entries) {
            val target = ModifierTarget(Statistic.ABILITY_POINTS, ability = ability)
            val knownPoints = (if (hasAllocation) points.getValue(ability) else if (ability == defaultMain) 4 else 0) + advancementPoints.getValue(ability)
            val contributions = modifiers.filter { it.modifier.target == target }
            val knownBase = ContractResult.Available(CalculatedValue(knownPoints,
                listOf(Contributor("${ability.name} points", knownPoints, allocation.source))))
            val knownValue = ModifierCalculator.calculate(knownBase, contributions).value
            overviewAbilityValues[ability] = knownValue
            overviewAbilityTotals[ability] = (knownValue as? ContractResult.Available)?.value?.total ?: knownPoints
            val base = if (!legal || errors.isNotEmpty() || blockers.isNotEmpty()) {
                ContractResult.Unavailable((errors + blockers).distinct())
            } else {
                ContractResult.Available(CalculatedValue(points.getValue(ability) + advancementPoints.getValue(ability),
                    listOf(Contributor("${ability.name} points", points.getValue(ability), allocation.source),
                        Contributor("Ability advancement", advancementPoints.getValue(ability))).filter { it.value != 0 }))
            }
            abilityValues[ability] = ModifierCalculator.calculate(base, contributions)
            // An unfilled feature choice cannot erase an independently validated allocation.
            // Unavailable definitions/cycles still block facts because their effects are unknown.
            val factBlockers = blockers.filter { it.code != "engine.missingChoice" }
            val facts = if (!legal || errors.isNotEmpty() || factBlockers.isNotEmpty()) {
                ContractResult.Unavailable((errors + factBlockers).distinct())
            } else {
                ContractResult.Available(CalculatedValue(points.getValue(ability) + advancementPoints.getValue(ability),
                    listOf(Contributor("${ability.name} points", points.getValue(ability), allocation.source),
                        Contributor("Ability advancement", advancementPoints.getValue(ability))).filter { it.value != 0 }))
            }
            abilityFacts[ability] = ModifierCalculator.calculate(facts, contributions)
        }
    }

    /** Coverage is reported separately; incomplete effects cannot change the truth of access. */
    private fun eligibility(entry: ContentEntry, slot: ChoiceSlotId, selected: Set<String>): EntryEligibility {
        if (entry.mechanics.version !in 1..2) {
            return EntryEligibility(entry.id, Eligibility.UNRESOLVED, listOf(diagnostic("mechanicsVersion",
                DiagnosticKind.INCOMPATIBLE_FORMAT, "Unsupported mechanics version ${entry.mechanics.version}.", slot, entry.id)))
        }
        fun evaluate(condition: Prerequisite): EntryEligibility {
            val children = when (condition) {
                is Prerequisite.AllOf -> condition.conditions
                is Prerequisite.AnyOf -> condition.conditions
                else -> return leafEligibility(entry, slot, selected, condition)
            }
            if (children.isEmpty()) {
                return EntryEligibility(entry.id, Eligibility.INCOMPLETE, listOf(diagnostic("conditionDefinition",
                    DiagnosticKind.INCOMPLETE_AUTOMATION, "Condition groups cannot be empty.", slot, entry.id)))
            }
            val results = children.map { evaluate(it) }
            val any = condition is Prerequisite.AnyOf
            val status = when {
                any && results.any { it.status == Eligibility.ELIGIBLE } -> Eligibility.ELIGIBLE
                !any && results.any { it.status == Eligibility.INELIGIBLE } -> Eligibility.INELIGIBLE
                results.any { it.status == Eligibility.UNRESOLVED } -> Eligibility.UNRESOLVED
                results.any { it.status == Eligibility.INCOMPLETE } -> Eligibility.INCOMPLETE
                any -> Eligibility.INELIGIBLE
                else -> Eligibility.ELIGIBLE
            }
            return EntryEligibility(entry.id, status, if (status == Eligibility.ELIGIBLE) emptyList() else results
                .filter { !any || it.status != Eligibility.INELIGIBLE || status == Eligibility.INELIGIBLE }
                .flatMap { it.diagnostics })
        }
        val sourceChoice = choices[slot] as? ChoiceDefinition.Entries
        if (sourceChoice != null && entry.id !in sourceChoice.entryIds) {
            return EntryEligibility(entry.id, Eligibility.INELIGIBLE, listOf(diagnostic("choiceOption",
                DiagnosticKind.INVALID_SELECTION, "Entry does not belong to this acquisition pool.", slot, entry.id)))
        }
        if (diagnostics.any { it.code == "engine.selectionOverrideConflict" && it.slot?.sourceInstanceId == slot.sourceInstanceId && it.slot.choiceId == slot.choiceId }) {
            return EntryEligibility(entry.id, Eligibility.INCOMPLETE, listOf(diagnostic("selectionOverrideConflict",
                DiagnosticKind.INCOMPLETE_AUTOMATION, "Conflicting active overrides prevent establishing selection eligibility.", slot, entry.id)))
        }
        sourceChoice?.requiresCollection?.let { required ->
            val owned = effectiveSets.filter { it.second.collection == required }.flatMap { (owner, choice) ->
                entryDecisions.filter { it.slot.sourceInstanceId == owner.instanceId && it.slot.choiceId == choice.id && it.slot.ordinal < choice.count }
            }.map { it.selection.entryId }
            if (entry.id !in owned) {
                return EntryEligibility(entry.id, Eligibility.INELIGIBLE, listOf(diagnostic("collectionOwnership",
                    DiagnosticKind.INVALID_SELECTION, "Selection must already belong to $required.", slot, entry.id)))
            }
        }
        if (sourceChoice?.constraints?.any { it.type == "notKnown" } == true && entries.any {
            it.slot != slot && it.definition.entry.id == entry.id &&
                (choices[it.slot] as? ChoiceDefinition.Entries)?.requiresCollection == null
        }) {
            return EntryEligibility(entry.id, Eligibility.INELIGIBLE, listOf(diagnostic("alreadyKnown",
                DiagnosticKind.INVALID_SELECTION, "Stored power must differ from already known powers.", slot, entry.id)))
        }
        val maximum = entry.mechanics.maximumSelections
        if ((choices[slot] as? ChoiceDefinition.Entries)?.requiresCollection == null && maximum != null && (maximum < 1 || entries.count {
            (!it.granted || it.slot in grantReplacementSlots) && it.slot != slot && it.definition.entry.id == entry.id &&
                (choices[it.slot] as? ChoiceDefinition.Entries)?.requiresCollection == null
        } >= maximum)) {
            return EntryEligibility(entry.id, Eligibility.INELIGIBLE, listOf(diagnostic("selectionMaximum",
                DiagnosticKind.INVALID_SELECTION, "Entry selection maximum exceeded.", slot, entry.id)))
        }
        val proficiencyErrors = proficiencySelectionRules.validate(entry, slot)
        if (proficiencyErrors.isNotEmpty()) {
            return EntryEligibility(entry.id, Eligibility.INELIGIBLE, proficiencyErrors)
        }
        for (choice in entry.mechanics.choices.filterIsInstance<ChoiceDefinition.Values>()) {
            if (choice.distinctScope == FactScope.NONE || choice.allowRepeatWhenExhausted) {
                continue
            }
            val snapshot = selectionTimeFacts.forCandidate(entry, slot)
            val excluded = snapshot.facts.filter { fact -> fact.kind == choice.kind && when (choice.distinctScope) {
                FactScope.CHARACTER -> fact.targetId == null
                FactScope.POWER -> fact.targetId == choice.targetId
                FactScope.ENTRY -> snapshot.entries.any { it.instanceId == fact.source.sourceInstanceId && it.definition.entry.id == entry.id } && fact.source.choiceId == choice.id
                FactScope.NONE -> false
            } }.map { it.value }.toMutableSet()
            if (choice.distinctScope == FactScope.ENTRY) {
                excluded += snapshot.selectedValues.filter { decision -> decision.slot.choiceId == choice.id && snapshot.entries.any {
                    it.instanceId == decision.slot.sourceInstanceId && it.definition.entry.id == entry.id
                } }.map { it.value }
            }
            if (choice.options.count { it.id !in excluded } < choice.count) {
                return EntryEligibility(entry.id, Eligibility.INELIGIBLE, listOf(diagnostic("valueExhausted",
                    DiagnosticKind.INVALID_SELECTION, "Not enough distinct ${choice.kind} options remain at acquisition.", slot, entry.id)))
            }
        }
        entry.mechanics.armorAdvancement?.let { advancement ->
            val facts = selectionTimeFacts.forCandidate(entry, slot)
            val highest = advancement.order.indexOfLast { it in facts.equipmentProficiencies }
            if (highest < 0 || highest + advancement.steps > advancement.order.lastIndex) {
                return EntryEligibility(entry.id, Eligibility.INELIGIBLE, listOf(diagnostic("armorAdvancement",
                    DiagnosticKind.INVALID_SELECTION, "Armor advancement needs an independent starting proficiency below the authored cap.", slot, entry.id)))
            }
        }
        val result = evaluate(Prerequisite.AllOf(listOfNotNull(entry.mechanics.access) + entry.mechanics.prerequisites + Prerequisite.Always))
        if (entry.mechanics.version == 1 && entry.coverage.status != CoverageStatus.SUPPORTED) {
            val notice = diagnostic("coverage", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "${entry.presentation.title}: ${entry.coverage.status}. ${entry.coverage.limitations.joinToString()}", slot, entry.id)
            return result.copy(status = if (result.status == Eligibility.ELIGIBLE) Eligibility.INCOMPLETE else result.status,
                diagnostics = result.diagnostics + notice)
        }
        return result
    }

    private fun leafEligibility(entry: ContentEntry, slot: ChoiceSlotId, selected: Set<String>, prerequisite: Prerequisite): EntryEligibility {
        val errors = mutableListOf<Diagnostic>()
        val factBlockers = if (factsOnly) blockers.filter { it.code != "engine.missingChoice" } else blockers
        var unresolved = false
        var incomplete = false
        var invalid = false
        val selectionLevel = decisionLevels[slot]
        val historical = selectionLevel != null && selectionLevel < document.level && prerequisite !is Prerequisite.Level && prerequisite !is Prerequisite.Always
        if (!factsOnly && entry.mechanics.version >= 2 && prerequisite !is Prerequisite.Level &&
            prerequisite !is Prerequisite.Always && prerequisite !is Prerequisite.Unresolved && prerequisite !is Prerequisite.Unadapted) {
            val facts = selectionTimeFacts.forCandidate(entry, slot)
            return facts.leafEligibility(entry, slot, facts.entries.map { it.definition.entry.id }.toSet(), prerequisite)
        }
        if (!factsOnly && (selfDependency(entry, prerequisite) || historical)) {
            incomplete = true
            errors += diagnostic("prerequisiteDependency", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "Eligibility needs independent or historical prerequisite evaluation; this proof cannot establish it from current benefits.", slot, entry.id)
            return EntryEligibility(entry.id, Eligibility.INCOMPLETE, errors)
        }
        val satisfied: Boolean? = when (prerequisite) {
            is Prerequisite.Always -> true
            is Prerequisite.AllOf, is Prerequisite.AnyOf -> error("Groups are evaluated recursively")
            is Prerequisite.ClassPowerSource, is Prerequisite.EquipmentProficiency -> {
                val classes = entries.filter { it.definition.entry.category == EntryCategory.CLASS }
                val qualifyingMulticlasses = if (prerequisite is Prerequisite.ClassPowerSource && entry.category in setOf(EntryCategory.FEAT, EntryCategory.PARAGON_PATH)) {
                    entries.mapNotNull { it.definition.entry.mechanics.multiclassFor }.distinct().map {
                        (content.entries[it] as? ContractResult.Available)?.value?.entry?.mechanics?.classProfile
                    }
                } else emptyList()
                val known = classes.mapNotNull { it.definition.entry.mechanics.classProfile } + qualifyingMulticlasses.filterNotNull()
                val matches = when (prerequisite) {
                    is Prerequisite.ClassPowerSource -> known.any { prerequisite.powerSource in it.powerSources }
                    is Prerequisite.EquipmentProficiency -> prerequisite.equipment in equipmentProficiencies
                    else -> false
                }
                when {
                    matches -> true
                    factBlockers.isNotEmpty() -> { unresolved = true; null }
                    known.size != classes.size + qualifyingMulticlasses.size -> {
                        incomplete = true
                        errors += diagnostic("classFactsUnavailable", DiagnosticKind.INCOMPLETE_AUTOMATION,
                            "A legacy class has no shared source/proficiency facts.", slot, entry.id)
                        null
                    }
                    else -> false
                }
            }
            is Prerequisite.Size -> {
                val ancestries = entries.filter { it.definition.entry.category == EntryCategory.ANCESTRY }
                val sizes = ancestries.mapNotNull { it.definition.entry.mechanics.size }.distinct()
                when {
                    factBlockers.isNotEmpty() -> { unresolved = true; null }
                    ancestries.isEmpty() || ancestries.any { it.definition.entry.mechanics.size == null } || sizes.size != 1 -> {
                        incomplete = true
                        errors += diagnostic("sizeFactsUnavailable", DiagnosticKind.INCOMPLETE_AUTOMATION,
                            "Size requires one unambiguous structured ancestry size.", slot, entry.id)
                        null
                    }
                    else -> sizes.single() == prerequisite.size
                }
            }
            is Prerequisite.Selected -> {
                val candidates = entries.filter { !it.granted && it.definition.entry.category == prerequisite.category }
                val matches = candidates.any {
                    val mechanics = it.definition.entry.mechanics
                    when (prerequisite.category) {
                        EntryCategory.FEAT -> mechanics.multiclassFor != null
                        EntryCategory.POWER -> mechanics.powerProfile?.usage == prerequisite.filters.usage
                        else -> false
                    }
                }
                when {
                    matches -> true
                    factBlockers.isNotEmpty() -> { unresolved = true; null }
                    prerequisite.category == EntryCategory.POWER && candidates.any { it.definition.entry.mechanics.powerProfile == null } -> {
                        incomplete = true
                        errors += diagnostic("selectedFactsUnavailable", DiagnosticKind.INCOMPLETE_AUTOMATION,
                            "A selected power has no structured level/usage profile.", slot, entry.id)
                        null
                    }
                    else -> false
                }
            }
            is Prerequisite.Unavailable -> {
                errors += diagnostic("unavailableCondition", DiagnosticKind.INVALID_SELECTION,
                    "${prerequisite.text}: ${prerequisite.reason}", slot, entry.id)
                false
            }
            is Prerequisite.Unresolved -> {
                incomplete = true
                errors += diagnostic("unresolvedCondition", DiagnosticKind.INCOMPLETE_AUTOMATION,
                    "${prerequisite.text}: ${prerequisite.reason}", slot, entry.id)
                null
            }
            is Prerequisite.Level -> (selectionLevel ?: document.level) >= prerequisite.minimum
            is Prerequisite.Entry -> {
                val multiclassMatch = entry.category in setOf(EntryCategory.FEAT, EntryCategory.PARAGON_PATH) &&
                    entries.any { it.definition.entry.category == EntryCategory.FEAT && it.definition.entry.mechanics.multiclassFor == prerequisite.entryId } &&
                    (content.entries[prerequisite.entryId] as? ContractResult.Available)?.value?.entry?.category == EntryCategory.CLASS
                if (prerequisite.entryId in selected || multiclassMatch || facts.any { it.kind == FactKind.ANCESTRY_QUALIFICATION && it.value == prerequisite.entryId }) {
                    true
                } else if (factBlockers.isNotEmpty() || content.entries[prerequisite.entryId] !is ContractResult.Available) {
                    unresolved = true
                    null
                } else {
                    false
                }
            }
            is Prerequisite.AbilityPoints -> {
                val values = if (entry.mechanics.version >= 2) abilityFacts else abilityValues
                when (val value = values.getValue(prerequisite.ability).value) {
                    is ContractResult.Available -> value.value.total >= prerequisite.minimum
                    is ContractResult.Unavailable -> {
                        when {
                            value.diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT } -> unresolved = true
                            value.diagnostics.any { it.kind == DiagnosticKind.INVALID_SELECTION } -> invalid = true
                            else -> incomplete = true
                        }
                        errors += value.diagnostics.map { it.copy(slot = slot, entryId = entry.id) }
                        null
                    }
                }
            }
            is Prerequisite.Proficiency -> {
                if (prerequisite.skill in proficiencies) true else if (factBlockers.isNotEmpty()) { unresolved = true; null } else false
            }
            is Prerequisite.Unadapted -> {
                incomplete = true
                errors += diagnostic("unadaptedPrerequisite", DiagnosticKind.INCOMPLETE_AUTOMATION,
                    "Prerequisite needs adaptation: ${prerequisite.sourceText}", slot, entry.id)
                null
            }
        }
        if (satisfied == false) {
            invalid = true
            errors += diagnostic("prerequisite", DiagnosticKind.INVALID_SELECTION,
                "Unsatisfied prerequisite: $prerequisite", slot, entry.id)
        }
        if (unresolved) {
            errors += diagnostic("prerequisiteUnavailable", DiagnosticKind.UNRESOLVED_CONTENT,
                "Prerequisites depend on unavailable definitions or calculations.", slot, entry.id)
        }
        return EntryEligibility(entry.id, when {
            invalid -> Eligibility.INELIGIBLE
            unresolved -> Eligibility.UNRESOLVED
            incomplete -> Eligibility.INCOMPLETE
            else -> Eligibility.ELIGIBLE
        }, errors)
    }

    /** Preserve the legacy dependency check while sharing the selection-time implementation. */
    private fun selfDependency(entry: ContentEntry, prerequisite: Prerequisite): Boolean =
        selectionTimeFacts.selfDependency(entry, prerequisite)

    private fun invalid(code: String, message: String, slot: ChoiceSlotId, entryId: String? = null) {
        diagnostics += diagnostic(code, DiagnosticKind.INVALID_SELECTION, message, slot, entryId)
    }
}

private fun diagnostic(code: String, kind: DiagnosticKind, message: String, slot: ChoiceSlotId? = null, entryId: String? = null) =
    Diagnostic("engine.$code", kind, message, slot, entryId)

private fun missing(message: String, slot: ChoiceSlotId? = null, entryId: String? = null) = ContractResult.Unavailable(
    listOf(diagnostic("missingDefinition", DiagnosticKind.UNRESOLVED_CONTENT, message, slot, entryId)))
