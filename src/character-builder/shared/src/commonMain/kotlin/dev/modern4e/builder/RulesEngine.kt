package dev.modern4e.builder

/** Snapshot prepared outside the pure engine. Saved references never fall back to an ordinary lookup. */
data class RulesContent(
    val entries: Map<String, ContractResult<ResolvedEntry>>,
    val selections: Map<SavedSelection, ContractResult<ResolvedEntry>>,
    val diagnostics: List<Diagnostic> = emptyList(),
) {
    companion object {
        /** Loads selected definitions, grant dependencies and choice candidates; performs no character writes. */
        suspend fun load(document: CharacterDocument, catalog: ContentCatalog): RulesContent {
            val entries = linkedMapOf<String, ContractResult<ResolvedEntry>>()
            val selections = linkedMapOf<SavedSelection, ContractResult<ResolvedEntry>>()
            val pending = mutableListOf<String>()
            fun dependencies(entry: ContentEntry) {
                val mechanics = entry.mechanics
                pending += (mechanics.grants + mechanics.progression.flatMap { it.grants })
                    .filterIsInstance<Grant.Entry>().map { it.entryId }
                pending += (mechanics.choices + mechanics.progression.flatMap { it.choices })
                    .filterIsInstance<ChoiceDefinition.Entries>().flatMap { it.entryIds }
                pending += (mechanics.prerequisites + listOfNotNull(mechanics.access)).flatMap { it.leaves() }
                    .filterIsInstance<Prerequisite.Entry>().map { it.entryId }
            }
            val saved = document.levels.flatMap { level ->
                level.entries.map { it.selection } + level.replacements.map { it.replacement.selection }
            } + document.equipment.filter { it.equipped }.map { it.selection }
            for (selection in saved.distinct()) {
                val resolved = catalog.resolve(selection)
                selections[selection] = resolved
                if (resolved is ContractResult.Available) {
                    dependencies(resolved.value.entry)
                }
            }
            var index = 0
            while (index < pending.size) {
                val id = pending[index++]
                if (id in entries) {
                    continue
                }
                val found = catalog.lookup(id)
                val resolved = when (found) {
                    is ContractResult.Unavailable -> found
                    is ContractResult.Available -> found.value?.let { ContractResult.Available(it, found.diagnostics) }
                        ?: missing("Definition $id is unavailable", entryId = id)
                }
                entries[id] = resolved
                if (resolved is ContractResult.Available) {
                    dependencies(resolved.value.entry)
                }
            }
            return RulesContent(entries.toMap(), selections.toMap(), catalog.diagnostics)
        }
    }
}

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
) {
    fun ability(ability: Ability) = statistics.getValue(ModifierTarget(Statistic.ABILITY_POINTS, ability = ability)).value
    fun skill(skill: Skill) = statistics.getValue(ModifierTarget(Statistic.SKILL_CHECK, skill = skill)).value
}

/** Shared baseline choice identities match the portable v1 fixtures. */
object ModernCreation {
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
}

private class Evaluation(private val document: CharacterDocument, private val content: RulesContent) {
    private val diagnostics = content.diagnostics.toMutableList()
    private val blockers = content.diagnostics.filter { it.kind == DiagnosticKind.UNRESOLVED_CONTENT }.toMutableList()
    private val entries = mutableListOf<EngineEntry>()
    private val instances = mutableSetOf<String>()
    private val choices = linkedMapOf<ChoiceSlotId, ChoiceDefinition>()
    private val modifiers = mutableListOf<ModifierContribution>()
    private val proficiencies = linkedMapOf<Skill, MutableList<ChoiceSlotId>>()
    private val usedEntries = mutableSetOf<EntryChoice>()
    private val usedProficiencies = mutableSetOf<ProficiencyChoice>()
    private val entryDecisions = document.levels.sortedBy { it.level }.flatMap { it.entries }
    private val proficiencyDecisions = document.levels.sortedBy { it.level }.flatMap { it.proficiencies }
    private val abilityValues = linkedMapOf<Ability, StatisticCalculation>()
    private val abilityFacts = linkedMapOf<Ability, StatisticCalculation>()

    fun run(): EngineResult {
        val repeatedSlots = (entryDecisions.map { it.slot } + proficiencyDecisions.map { it.slot })
            .groupingBy { it }.eachCount().filterValues { it > 1 }.keys
        for (slot in repeatedSlots) {
            invalid("duplicateSlot", "Multiple decisions occupy the same choice slot.", slot)
            blockers += diagnostics.last()
        }
        if (document.level > 2 || document.levels.any { it.replacements.isNotEmpty() || it.abilityAdvancements.isNotEmpty() }) {
            diagnostics += diagnostic("progressionUnsupported", DiagnosticKind.INCOMPLETE_AUTOMATION,
                "General progression above level 2, advancement and replacements require the progression milestone; explicit class acquisition and formulas still apply.")
            val sharedClass = entryDecisions.any { decision ->
                val resolved = content.selections[decision.selection] as? ContractResult.Available
                resolved?.value?.entry?.mechanics?.classProfile != null
            }
            if (!sharedClass || document.levels.any { it.replacements.isNotEmpty() || it.abilityAdvancements.isNotEmpty() }) {
                blockers += diagnostics.last()
            }
        }
        for (level in document.levels.sortedBy { it.level }) {
            for (decision in level.entries) {
                if (decision.slot in repeatedSlots) {
                    continue
                }
                val rootCategory = when (decision.slot.choiceId) {
                    "class" -> EntryCategory.CLASS
                    "ancestry" -> EntryCategory.ANCESTRY
                    "theme" -> EntryCategory.THEME
                    "feat" -> EntryCategory.FEAT
                    else -> null
                }
                val initial = level.level == 1 && decision.slot.sourceInstanceId == "creation"
                val secondFeat = level.level == 2 && decision.slot.sourceInstanceId == "advancement.2" && decision.slot.choiceId == "feat"
                if ((initial || secondFeat) && rootCategory != null && decision.slot.ordinal == 0) {
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
        calculateAbilities()
        val entryIds = entries.map { it.definition.entry.id }.toSet()
        val selectedEligibility = entries.filterNot { it.granted }.associate { entry ->
            entry.instanceId to eligibility(entry.definition.entry, entry.slot, entryIds)
        }
        diagnostics += selectedEligibility.values.flatMap { it.diagnostics }
        val offered = choices.map { (slot, definition) ->
            when (definition) {
                is ChoiceDefinition.Entries -> EngineChoice(slot, entries = definition.entryIds.map { id ->
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
                is ChoiceDefinition.Proficiencies -> EngineChoice(slot, skills = definition.skills)
                is ChoiceDefinition.MainAbility -> EngineChoice(slot, abilities = definition.abilities)
            }
        }
        val statistics = linkedMapOf<ModifierTarget, StatisticCalculation>()
        for ((ability, value) in abilityValues) {
            statistics[ModifierTarget(Statistic.ABILITY_POINTS, ability = ability)] = value
        }
        for (skill in Skill.entries) {
            val ability = abilityValues.getValue(skill.ability).value
            val target = ModifierTarget(Statistic.SKILL_CHECK, skill = skill)
            val sources = proficiencies[skill].orEmpty()
            val proficiency = if (sources.isEmpty()) emptyList() else listOf(ModifierContribution(
                TypedModifier(target, ModifierOperation.ADD, 5, BonusType.PROFICIENCY), "Proficiency", "modern.proficiency:$skill", sources.first()))
            statistics[target] = ModifierCalculator.calculate(ability, proficiency + modifiers.filter { it.modifier.target == target })
        }
        for (statistic in Statistic.entries.filter { it != Statistic.ABILITY_POINTS && it != Statistic.SKILL_CHECK }) {
            val target = ModifierTarget(statistic)
            val base = if (blockers.isEmpty()) {
                classBase(statistic) ?: ContractResult.Unavailable(listOf(diagnostic("missingBase", DiagnosticKind.INCOMPLETE_AUTOMATION,
                    "$statistic has no authored base; an ADD is not a base value.")))
            } else {
                ContractResult.Unavailable(blockers.toList())
            }
            statistics[target] = ModifierCalculator.calculate(base, modifiers.filter { it.modifier.target == target })
        }
        diagnostics += statistics.values.flatMap { calculation ->
            (calculation.value as? ContractResult.Unavailable)?.diagnostics.orEmpty().filter { it.code != "engine.missingBase" }
        }
        return EngineResult(statistics, entries.toList(), offered, proficiencies.mapValues { it.value.toList() },
            entries.associate { it.instanceId to it.definition.entry.coverage }, diagnostics.distinct(),
            entries.flatMap { occurrence -> occurrence.definition.entry.mechanics.conditionalModifiers.map {
                ConditionalContribution(occurrence.instanceId, occurrence.slot, it)
            } }, selectedEligibility)
    }

    /** A single active class establishes a base with every term visible in the breakdown. */
    private fun classBase(statistic: Statistic): ContractResult<CalculatedValue>? {
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
        val terms = mutableListOf(Contributor("${owner.definition.entry.presentation.title} base", formula.base, owner.slot))
        val level = formula.perLevel.toLong() * document.level
        if (level !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) {
            return ContractResult.Unavailable(listOf(diagnostic("formulaOverflow", DiagnosticKind.INCOMPLETE_AUTOMATION, "Class formula overflow.")))
        }
        terms += Contributor("Class level", level.toInt(), owner.slot)
        for ((ability, multiplier) in formula.abilities) {
            val value = abilityValues.getValue(ability).value
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
                    val next = accept(content.entries[grant.entryId], grantSlot, grant.entryId)
                    if (next != null) {
                        visit(next, ModernCreation.grantInstance(instance, id), grantSlot, true, ancestors + entry.id)
                    }
                }
            }
        }
        val choiceIds = sourceChoices.map { when (it) {
            is ChoiceDefinition.Entries -> it.id; is ChoiceDefinition.Proficiencies -> it.id; is ChoiceDefinition.MainAbility -> it.id
        } }
        for (choice in sourceChoices) {
            val id = when (choice) { is ChoiceDefinition.Entries -> choice.id; is ChoiceDefinition.Proficiencies -> choice.id; is ChoiceDefinition.MainAbility -> choice.id }
            val count = when (choice) { is ChoiceDefinition.Entries -> choice.count; is ChoiceDefinition.Proficiencies -> choice.count; is ChoiceDefinition.MainAbility -> 1 }
            if (id.isBlank() || choiceIds.count { it == id } != 1 || count !in 1..100 ||
                choice is ChoiceDefinition.Entries && (choice.entryIds.distinct().size != choice.entryIds.size ||
                    choice.entryIds.any { it.isBlank() } || choice.distinct && count > choice.entryIds.size)) {
                diagnostics += diagnostic("choiceDefinition", DiagnosticKind.INCOMPLETE_AUTOMATION,
                    "Choice IDs must be unique and counts must be within 1–100.", slot, entry.id)
                blockers += diagnostics.last()
                continue
            }
            if (choice is ChoiceDefinition.Entries && choice.distinct) {
                val selectedIds = entryDecisions.filter { it.slot.sourceInstanceId == instance && it.slot.choiceId == id }
                    .map { it.selection.entryId }
                if (selectedIds.distinct().size != selectedIds.size) {
                    invalid("distinctChoice", "Choose different entries within this choice set.", ChoiceSlotId(instance, id, 0), entry.id)
                }
            }
            for (ordinal in 0 until count) {
                val choiceSlot = ChoiceSlotId(instance, id, ordinal)
                choices[choiceSlot] = choice
                if (choice is ChoiceDefinition.Entries) {
                    val decisions = entryDecisions.filter { it.slot == choiceSlot }
                    if (decisions.size != 1) {
                        invalid("missingChoice", "Select exactly one entry for this slot.", choiceSlot, entry.id)
                        blockers += diagnostics.last()
                        continue
                    }
                    val decision = decisions.single()
                    usedEntries += decision
                    if (decision.selection.entryId !in choice.entryIds) {
                        invalid("choiceOption", "Selected entry is not an option for this slot.", choiceSlot, decision.selection.entryId)
                        continue
                    }
                    val definition = selected(decision)
                    if (definition != null) {
                        visit(definition, decision.instanceId, choiceSlot, false, ancestors + entry.id)
                    }
                }
            }
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
        val nonMain = points.filterKeys { it != allocation.mainAbility }
        val negatives = nonMain.filterValues { it == -1 }
        // Reconstruct the pre-trade allocation: a zero was lowered to -1 and another non-main gained one.
        val standard = nonMain.values.sum() == 5 && nonMain.values.all { it in 0..2 }
        val trade = negatives.size == 1 && nonMain.values.sum() == 5 && nonMain.values.all { it in -1..3 } &&
            nonMain.filterValues { it > 2 }.size <= 1 && nonMain.values.count { it > 0 } > 0
        val source = choices[allocation.source] as? ChoiceDefinition.MainAbility
        val legalSource = source != null && allocation.mainAbility in source.abilities
        val legal = points[allocation.mainAbility] == 4 && (standard || trade) && legalSource
        val errors = mutableListOf<Diagnostic>()
        if (!legalSource) {
            errors += diagnostic("mainAbility", DiagnosticKind.INVALID_SELECTION,
                "Main ability must be chosen from an active source's main-ability slot.", allocation.source)
        }
        if (points[allocation.mainAbility] != 4 || !(standard || trade)) {
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
        for (ability in Ability.entries) {
            val target = ModifierTarget(Statistic.ABILITY_POINTS, ability = ability)
            val base = if (!legal || blockers.isNotEmpty()) {
                ContractResult.Unavailable((errors + blockers).distinct())
            } else {
                ContractResult.Available(CalculatedValue(points.getValue(ability),
                    listOf(Contributor("${ability.name} points", points.getValue(ability), allocation.source))))
            }
            abilityValues[ability] = ModifierCalculator.calculate(base, modifiers.filter { it.modifier.target == target })
            // An unfilled feature choice cannot erase an independently validated allocation.
            // Unavailable definitions/cycles still block facts because their effects are unknown.
            val factBlockers = blockers.filter { it.code != "engine.missingChoice" }
            val facts = if (!legal || factBlockers.isNotEmpty()) {
                ContractResult.Unavailable((errors + factBlockers).distinct())
            } else {
                ContractResult.Available(CalculatedValue(points.getValue(ability),
                    listOf(Contributor("${ability.name} points", points.getValue(ability), allocation.source))))
            }
            abilityFacts[ability] = ModifierCalculator.calculate(facts, modifiers.filter { it.modifier.target == target })
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
        val maximum = entry.mechanics.maximumSelections
        if (maximum != null && (maximum < 1 || entries.count {
            !it.granted && it.slot != slot && it.definition.entry.id == entry.id
        } >= maximum)) {
            return EntryEligibility(entry.id, Eligibility.INELIGIBLE, listOf(diagnostic("selectionMaximum",
                DiagnosticKind.INVALID_SELECTION, "Entry selection maximum exceeded.", slot, entry.id)))
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
        var unresolved = false
        var incomplete = false
        var invalid = false
        val selectionLevel = document.levels.firstOrNull { level -> level.entries.any { it.slot == slot } }?.level
        val historical = selectionLevel != null && selectionLevel < document.level && prerequisite !is Prerequisite.Level && prerequisite !is Prerequisite.Always
        if (selfDependency(entry, prerequisite) || entry.mechanics.version >= 2 && dependentBenefit(entry, prerequisite) || historical) {
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
                val known = classes.mapNotNull { it.definition.entry.mechanics.classProfile }
                val matches = when (prerequisite) {
                    is Prerequisite.ClassPowerSource -> known.any { prerequisite.powerSource in it.powerSources }
                    is Prerequisite.EquipmentProficiency -> known.any { prerequisite.equipment in it.proficiencies.values.flatten() }
                    else -> false
                }
                when {
                    matches -> true
                    blockers.isNotEmpty() -> { unresolved = true; null }
                    known.size != classes.size -> {
                        incomplete = true
                        errors += diagnostic("classFactsUnavailable", DiagnosticKind.INCOMPLETE_AUTOMATION,
                            "A legacy class has no shared source/proficiency facts.", slot, entry.id)
                        null
                    }
                    else -> false
                }
            }
            is Prerequisite.Unresolved -> {
                incomplete = true
                errors += diagnostic("unresolvedCondition", DiagnosticKind.INCOMPLETE_AUTOMATION,
                    "${prerequisite.text}: ${prerequisite.reason}", slot, entry.id)
                null
            }
            is Prerequisite.Level -> (selectionLevel ?: document.level) >= prerequisite.minimum
            is Prerequisite.Entry -> {
                if (prerequisite.entryId in selected) {
                    true
                } else if (blockers.isNotEmpty() || content.entries[prerequisite.entryId] !is ContractResult.Available) {
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
                if (prerequisite.skill in proficiencies) true else if (blockers.isNotEmpty()) { unresolved = true; null } else false
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

    /** Never use a candidate's own benefits as proof of its prerequisite. */
    private fun selfDependency(entry: ContentEntry, prerequisite: Prerequisite, visiting: Set<String> = emptySet()): Boolean {
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
            is Prerequisite.ClassPowerSource -> prerequisite.powerSource in mechanics.classProfile?.powerSources.orEmpty()
            is Prerequisite.EquipmentProficiency -> prerequisite.equipment in mechanics.classProfile?.proficiencies?.values?.flatten().orEmpty()
            is Prerequisite.Entry -> prerequisite.entryId == entry.id || grants.filterIsInstance<Grant.Entry>().any { it.entryId == prerequisite.entryId }
            else -> false
        }
        if (direct) {
            return true
        }
        val childIds = grants.filterIsInstance<Grant.Entry>().map { it.entryId } +
            sourceChoices.filterIsInstance<ChoiceDefinition.Entries>().flatMap { it.entryIds }
        return childIds.any { id ->
            val child = content.entries[id] as? ContractResult.Available
            child != null && selfDependency(child.value.entry, prerequisite, visiting + entry.id)
        }
    }

    /** Also exclude benefits of selected entries whose eligibility depends on this candidate. */
    private fun dependentBenefit(candidate: ContentEntry, prerequisite: Prerequisite): Boolean {
        val dependent = linkedMapOf(candidate.id to candidate)
        val selected = entries.filterNot { it.granted }.map { it.definition.entry }
        var changed = true
        while (changed) {
            changed = false
            for (other in selected) {
                if (other.id in dependent) {
                    continue
                }
                val requirements = (other.mechanics.prerequisites + listOfNotNull(other.mechanics.access)).flatMap { it.leaves() }
                if (requirements.any { requirement -> dependent.values.any { selfDependency(it, requirement) } }) {
                    dependent[other.id] = other
                    changed = true
                }
            }
        }
        return dependent.values.filter { it.id != candidate.id }.any { selfDependency(it, prerequisite) }
    }

    private fun invalid(code: String, message: String, slot: ChoiceSlotId, entryId: String? = null) {
        diagnostics += diagnostic(code, DiagnosticKind.INVALID_SELECTION, message, slot, entryId)
    }
}

private fun diagnostic(code: String, kind: DiagnosticKind, message: String, slot: ChoiceSlotId? = null, entryId: String? = null) =
    Diagnostic("engine.$code", kind, message, slot, entryId)

private fun missing(message: String, slot: ChoiceSlotId? = null, entryId: String? = null) = ContractResult.Unavailable(
    listOf(diagnostic("missingDefinition", DiagnosticKind.UNRESOLVED_CONTENT, message, slot, entryId)))
