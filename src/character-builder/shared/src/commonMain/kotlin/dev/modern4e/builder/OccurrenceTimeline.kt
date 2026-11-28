package dev.modern4e.builder

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** A grant one entry makes, with the earliest character level its own data allows it to activate. */
internal data class TimedGrant(val grant: Grant, val atLevel: Int)

/** A choice one entry opens, with the earliest character level its own data allows it to activate. */
internal data class TimedChoice(val choice: ChoiceDefinition, val atLevel: Int)

/**
 * What one entry activates by a character level, read from that entry's own data alone: the progression rows it
 * has reached, its grants (with their substitution alternatives) and the choices it opens, each with the level it
 * needs. An occurrence's actual acquisition level is the later of its owner's and this level.
 */
internal data class EntryActivation(
    val progression: List<ClassProgression>,
    val grants: List<TimedGrant>,
    val choices: List<TimedChoice>,
)

/**
 * The per-entry rule of the occurrence timeline. It needs neither a character nor loaded content, so content
 * loading can follow exactly the dependencies an entry activates by [level]. A class profile opens the main-ability
 * choice. Pass [Int.MAX_VALUE] for everything the entry can ever activate.
 */
internal fun ContentEntry.activation(level: Int): EntryActivation {
    val progression = mechanics.progression.filter { it.level <= level }
    val profile = mechanics.classProfile
    val choices = (mechanics.choices + progression.flatMap { it.choices } +
        if (profile != null) listOf(ChoiceDefinition.MainAbility("main", profile.mainAbilities)) else emptyList())
        .filter { it !is ChoiceDefinition.Entries || it.atLevel <= level }
    val grants = (mechanics.grants + progression.flatMap { it.grants }).filter { it !is Grant.Entry || it.atLevel <= level }
    return EntryActivation(progression,
        grants.map { grant ->
            TimedGrant(grant, maxOf((grant as? Grant.Entry)?.atLevel ?: 1,
                progression.filter { grant in it.grants }.maxOfOrNull { it.level } ?: 1))
        },
        choices.map { choice ->
            TimedChoice(choice, maxOf((choice as? ChoiceDefinition.Entries)?.atLevel ?: 1,
                progression.filter { choice in it.choices }.maxOfOrNull { it.level } ?: 1))
        })
}

/**
 * A replacement that took effect: [retired] stops being active at [level] and [replacement] continues its
 * occurrence (same instance ID and slot). [firstChosenAt] is the level whose decisions first filled that slot.
 */
internal data class Retirement(
    val level: Int,
    val retired: EntryChoice,
    val replacement: EntryChoice,
    val retiredDefinition: ResolvedEntry,
    val replacementDefinition: ResolvedEntry,
    val firstChosenAt: Int?,
)

/** One saved replacement in replay order; [retirement] is null when it has no power occurrence to take over. */
internal data class ReplacementRecord(val row: LevelDecisions, val change: Replacement, val retirement: Retirement?)

/** One activated choice set: the effective definition [owner] offers after active overrides and queries. */
internal data class OfferedSet(val owner: EngineEntry, val choice: ChoiceDefinition.Entries)

/**
 * What the timeline met while activating, in walk order. The engine turns these into diagnostics, blockers and
 * contributions; the timeline only decides what is active.
 */
internal sealed class TimelineEvent {
    /** A definition was looked up for [slot]; a failed or mismatched [result] activates nothing. */
    data class Resolution(val result: ContractResult<ResolvedEntry>?, val slot: ChoiceSlotId, val entryId: String,
        val selection: SavedSelection? = null) : TimelineEvent() {
        val definition: ResolvedEntry? get() = OccurrenceTimeline.resolve(result, entryId)
    }
    /** A root pick resolved to another category than its slot expects. */
    data class RootCategory(val slot: ChoiceSlotId, val entryId: String, val expected: EntryCategory) : TimelineEvent()
    /** An equipped definition is not an item. */
    data class EquipmentCategory(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /** An equipped item carries a configuration the engine does not interpret; it still activates. */
    data class EquipmentConfiguration(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /** An entry would grant itself through its ancestors; the walk stopped. */
    data class GrantCycle(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /** An occurrence reused an active instance ID and was not activated. */
    data class DuplicateInstance(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /**
     * [occurrence] became active with the progression rows it has reached. An unsupported mechanics version
     * activates the occurrence but none of its grants or choices.
     */
    data class Activated(val occurrence: EngineEntry, val progression: List<ClassProgression>,
        val supportedVersion: Boolean) : TimelineEvent()
    /** A grant ID is blank or repeated within its occurrence, so the grant was skipped. */
    data class InvalidGrant(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /** A skill proficiency grant from [slot]. */
    data class ProficiencyGranted(val skill: Skill, val slot: ChoiceSlotId) : TimelineEvent()
    /** More than one decision fills one grant slot; nothing is granted there. */
    data class RepeatedSubstitution(val slot: ChoiceSlotId) : TimelineEvent()
    /** A substitution is recorded at another level than its grant's acquisition; the default stays active. */
    data class LateSubstitution(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /** A substitution names an entry the grant no longer offers; the default stays active. */
    data class WithdrawnSubstitution(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /** A substitution keeps its slot but saved another occurrence identity; it still activates. */
    data class SubstitutionIdentity(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
    /** Active features disagree about a choice set's count or collection. */
    data class OverrideConflict(val slot: ChoiceSlotId, val choiceId: String) : TimelineEvent()
    /** A non-power query cannot list candidates. */
    data class QueryCoverage(val slot: ChoiceSlotId, val category: EntryCategory) : TimelineEvent()
    /** A choice definition is malformed or repeated within its owner; it offers no slots. */
    data class InvalidChoice(val owner: EngineEntry) : TimelineEvent()
    /** An offered entry slot does not hold exactly one decision. */
    data class MissingPick(val slot: ChoiceSlotId, val owner: EngineEntry) : TimelineEvent()
    /** A saved pick is not among its slot's options; it still activates. */
    data class OptionNotOffered(val slot: ChoiceSlotId, val entryId: String) : TimelineEvent()
}

/**
 * The occurrence timeline of one character document: which occurrences are active at the document's level, when
 * each was acquired, which choice slots they offer and from when, which grants were substituted and which saved
 * replacements retired an occurrence. Built once per evaluation by [of]; the engine reads it instead of re-deriving
 * activation, and only judges whether each substitution and replacement was valid.
 *
 * Every saved pick whose content resolves activates when its root slot or offering choice is active; eligibility
 * stays the engine's question. Picks with missing content stay saved, activate nothing and appear in [unresolved].
 * To preview a candidate, build the document with the candidate applied and ask for its timeline.
 */
internal class OccurrenceTimeline private constructor(
    private val document: CharacterDocument,
    private val content: RulesContent,
) {
    /** The level each saved decision or replacement was recorded at, by slot (a later record wins). */
    private val savedLevels = document.levels.sortedBy { it.level }.flatMap { level ->
        level.entries.map { it.slot to level.level } + level.replacements.map { it.replaces to level.level }
    }.toMap()

    private val replacementRecords = mutableListOf<ReplacementRecord>()

    /** Saved entry decisions after replaying replacements: a replacement continues its retired occurrence. */
    val decisions: List<EntryChoice> = replay()

    /** Saved replacements in replay order, with the retirement each caused. */
    val replacements: List<ReplacementRecord> get() = replacementRecords

    /** The retirements: occurrences a later replacement took the place of. */
    val retirements: List<Retirement> get() = replacementRecords.mapNotNull { it.retirement }

    /** Slots holding more than one entry, proficiency or value decision; none of their root picks activate. */
    val repeatedSlots: Set<ChoiceSlotId> = document.levels.sortedBy { it.level }.let { levels ->
        decisions.map { it.slot } + levels.flatMap { it.proficiencies }.map { it.slot } + levels.flatMap { it.values }.map { it.slot }
    }.groupingBy { it }.eachCount().filterValues { it > 1 }.keys

    private val activeEntries = mutableListOf<EngineEntry>()
    private val acquisitionLevels = mutableMapOf<String, Int>()
    private val instances = mutableSetOf<String>()
    private val offered = linkedMapOf<ChoiceSlotId, ChoiceDefinition>()
    private val substitutionSlots = mutableSetOf<ChoiceSlotId>()
    private val slotLevels = savedLevels.toMutableMap()
    private val offeredLevels = mutableMapOf<ChoiceSlotId, Int>()
    private val offeredSets = mutableListOf<OfferedSet>()
    private val conflicts = mutableSetOf<Pair<String, String>>()
    private val usedDecisions = mutableSetOf<EntryChoice>()
    private val log = mutableListOf<TimelineEvent>()
    private data class PendingChoice(val owner: EngineEntry, val choice: ChoiceDefinition, val ancestors: Set<String>, val acquiredAt: Int)
    private val pendingChoices = mutableListOf<PendingChoice>()

    /** Active occurrences in activation order. */
    val entries: List<EngineEntry> get() = activeEntries
    /** Offered choice slots in activation order, with each slot's effective definition. */
    val choices: Map<ChoiceSlotId, ChoiceDefinition> get() = offered
    /** Grant slots that offer a substitution; they are optional decisions. */
    val substitutionChoices: Set<ChoiceSlotId> get() = substitutionSlots
    /** The level each decision slot is acquired at: saved picks at their recorded level, grants at their acquisition. */
    val decisionLevels: Map<ChoiceSlotId, Int> get() = slotLevels
    /** The acquisition level of each offered choice slot. */
    val choiceLevels: Map<ChoiceSlotId, Int> get() = offeredLevels
    /** Entry choice sets in activation order, after overrides and queries. */
    val sets: List<OfferedSet> get() = offeredSets
    /** (source occurrence, choice ID) pairs whose active overrides disagree. */
    val overrideConflicts: Set<Pair<String, String>> get() = conflicts
    /** Saved decisions some active root slot, grant or offered choice consumed; the rest are orphans. */
    val used: Set<EntryChoice> get() = usedDecisions
    /** What the walk met, in order, for the engine to report. */
    val events: List<TimelineEvent> get() = log
    /** Lookups that activated nothing: missing or mismatched definitions for picks, grants and substitutions. */
    val unresolved: List<TimelineEvent.Resolution>
        get() = log.filterIsInstance<TimelineEvent.Resolution>().filter { it.definition == null }

    /** The character level at which [occurrence] became active. Equipment has no dated history: the current level. */
    fun acquisitionLevel(occurrence: EngineEntry): Int = acquisitionLevels[occurrence.instanceId] ?: document.level

    companion object {
        /** The timeline of [document] at its own level against prepared [content]. */
        fun of(document: CharacterDocument, content: RulesContent): OccurrenceTimeline =
            OccurrenceTimeline(document, content).also { it.walk() }

        /** A lookup activates only an available definition with the requested ID. */
        fun resolve(result: ContractResult<ResolvedEntry>?, id: String): ResolvedEntry? =
            (result as? ContractResult.Available)?.value?.takeIf { it.entry.id == id }
    }

    /** Replay replacements against their stable acquisition occurrence, recording each retirement. */
    private fun replay(): List<EntryChoice> {
        val current = mutableListOf<EntryChoice>()
        for (level in document.levels.sortedBy { it.level }) {
            current += level.entries
            for (change in level.replacements) {
                val original = current.singleOrNull { it.slot == change.replaces }
                val resolved = content.selections[change.replacement.selection] as? ContractResult.Available
                val source = original?.let { content.selections[it.selection] as? ContractResult.Available }
                if (original == null || change.replacement.slot != change.replaces ||
                    source?.value?.entry?.category != EntryCategory.POWER || resolved?.value?.entry?.category != EntryCategory.POWER) {
                    replacementRecords += ReplacementRecord(level, change, null)
                    continue
                }
                val replacement = change.replacement.copy(instanceId = original.instanceId)
                current.remove(original)
                current += replacement
                val firstChosenAt = document.levels.firstOrNull { row -> row.entries.any { it.slot == change.replaces } }?.level
                replacementRecords += ReplacementRecord(level, change,
                    Retirement(level.level, original, replacement, source.value, resolved.value, firstChosenAt))
            }
        }
        return current
    }

    private fun walk() {
        for (level in document.levels.sortedBy { it.level }) {
            for (decision in level.entries) {
                if (decision.slot in repeatedSlots) {
                    continue
                }
                val rootCategory = AdvancementRules.rootCategory(level.level, decision.slot) ?: continue
                usedDecisions += decision
                val definition = select(decision) ?: continue
                if (definition.entry.category != rootCategory) {
                    log += TimelineEvent.RootCategory(decision.slot, definition.entry.id, rootCategory)
                } else {
                    visit(definition, decision.instanceId, decision.slot, false, emptySet(), savedLevels.getValue(decision.slot))
                }
            }
        }
        for (equipment in document.equipment.filter { it.equipped }) {
            val slot = ChoiceSlotId(equipment.instanceId, "equipment", 0)
            val definition = lookup(content.selections[equipment.selection], slot, equipment.selection.entryId, equipment.selection)
                ?: continue
            if (definition.entry.category != EntryCategory.ITEM) {
                log += TimelineEvent.EquipmentCategory(slot, definition.entry.id)
                continue
            }
            val profile = definition.entry.sharedData?.get("equipment") as? JsonObject
            val kind = (profile?.get("kind") as? JsonPrimitive)?.contentOrNull
            if (equipment.hasUnsupportedConfiguration(kind)) {
                log += TimelineEvent.EquipmentConfiguration(slot, definition.entry.id)
            }
            visit(definition, equipment.instanceId, slot, false, emptySet(), document.level)
        }
        while (pendingChoices.isNotEmpty()) {
            // Resolve finite feature choices before shared pools, so active feature exceptions apply.
            val index = pendingChoices.indexOfFirst { (it.choice as? ChoiceDefinition.Entries)?.query == null }
                .let { if (it < 0) 0 else it }
            offer(pendingChoices.removeAt(index))
        }
    }

    private fun lookup(result: ContractResult<ResolvedEntry>?, slot: ChoiceSlotId, id: String,
        selection: SavedSelection? = null): ResolvedEntry? {
        val event = TimelineEvent.Resolution(result, slot, id, selection)
        log += event
        return event.definition
    }

    private fun select(decision: EntryChoice): ResolvedEntry? =
        lookup(content.selections[decision.selection], decision.slot, decision.selection.entryId, decision.selection)

    private fun visit(resolved: ResolvedEntry, instance: String, slot: ChoiceSlotId, granted: Boolean, ancestors: Set<String>,
        acquiredAt: Int) {
        val entry = resolved.entry
        if (entry.id in ancestors) {
            log += TimelineEvent.GrantCycle(slot, entry.id)
            return
        }
        if (!instances.add(instance)) {
            log += TimelineEvent.DuplicateInstance(slot, entry.id)
            return
        }
        val occurrence = EngineEntry(instance, slot, resolved, granted)
        activeEntries += occurrence
        acquisitionLevels[instance] = acquiredAt
        val activation = entry.activation(document.level)
        val supported = entry.mechanics.version in 1..2
        log += TimelineEvent.Activated(occurrence, activation.progression, supported)
        if (!supported) {
            return
        }
        val grantIds = activation.grants.map { when (val grant = it.grant) { is Grant.Entry -> grant.grantId; is Grant.Proficiency -> grant.grantId } }
        for ((grant, grantLevel) in activation.grants) {
            val id = when (grant) { is Grant.Entry -> grant.grantId; is Grant.Proficiency -> grant.grantId }
            if (id.isBlank() || grantIds.count { it == id } != 1) {
                log += TimelineEvent.InvalidGrant(slot, entry.id)
                continue
            }
            val grantSlot = ChoiceSlotId(instance, id, 0)
            when (grant) {
                is Grant.Proficiency -> log += TimelineEvent.ProficiencyGranted(grant.skill, grantSlot)
                is Grant.Entry -> grantEntry(grant, grantSlot, instance, maxOf(acquiredAt, grantLevel), ancestors + entry.id)
            }
        }
        for ((choice, choiceLevel) in activation.choices) {
            pendingChoices += PendingChoice(occurrence, choice, ancestors + entry.id, maxOf(acquiredAt, choiceLevel))
        }
    }

    /** Activate a grant's default or its saved substitution, which keeps the grant's slot and occurrence identity. */
    private fun grantEntry(grant: Grant.Entry, grantSlot: ChoiceSlotId, instance: String, acquiredAt: Int, ancestors: Set<String>) {
        val id = grant.grantId
        val saved = decisions.filter { it.slot == grantSlot }
        slotLevels[grantSlot] = acquiredAt
        if (grant.replacementEntryIds.isNotEmpty()) {
            substitutionSlots += grantSlot
            offered[grantSlot] = ChoiceDefinition.Entries(id, 1, listOf(grant.entryId) + grant.replacementEntryIds, atLevel = grant.atLevel)
        }
        val decision = saved.singleOrNull()
        val default = { lookup(content.entries[grant.entryId], grantSlot, grant.entryId) }
        val next = if (saved.isEmpty()) {
            default()
        } else {
            usedDecisions += saved
            if (decision == null) {
                log += TimelineEvent.RepeatedSubstitution(grantSlot)
                null
            } else if (document.levels.single { decision in it.entries }.level != acquiredAt) {
                log += TimelineEvent.LateSubstitution(grantSlot, decision.selection.entryId)
                default()
            } else if (decision.selection.entryId != grant.entryId && decision.selection.entryId !in grant.replacementEntryIds ||
                grant.replacementEntryIds.isEmpty()) {
                log += TimelineEvent.WithdrawnSubstitution(grantSlot, decision.selection.entryId)
                default()
            } else {
                if (decision.instanceId != ModernCreation.grantInstance(instance, id)) {
                    log += TimelineEvent.SubstitutionIdentity(grantSlot, decision.selection.entryId)
                }
                select(decision)
            }
        }
        if (next != null) {
            visit(next, ModernCreation.grantInstance(instance, id), grantSlot, true, ancestors, acquiredAt)
        }
    }

    /** Offer one choice's slots, applying active overrides and queries, and activate the picks that fill them. */
    private fun offer(pending: PendingChoice) {
        val owner = pending.owner
        val instance = owner.instanceId
        var choice = pending.choice
        val id = when (choice) { is ChoiceDefinition.Entries -> choice.id; is ChoiceDefinition.Proficiencies -> choice.id; is ChoiceDefinition.MainAbility -> choice.id; is ChoiceDefinition.Values -> choice.id }
        if (choice is ChoiceDefinition.Entries) {
            val changes = activeEntries.flatMap { it.definition.entry.mechanics.selectionModifiers }.filter { it.choiceId == id }
                .map { modifier -> modifier.copy(count = modifier.countByLevel.filter { it.atLevel <= document.level }
                    .maxByOrNull { it.atLevel }?.count ?: modifier.count) }
            if (changes.map { it.count }.distinct().size > 1 || changes.mapNotNull { it.collection }.distinct().size > 1) {
                log += TimelineEvent.OverrideConflict(ChoiceSlotId(instance, id, 0), id)
                conflicts += instance to id
            } else {
                choice = choice.copy(count = changes.firstOrNull()?.count ?: choice.countByLevel
                    .filter { it.atLevel <= document.level }.maxByOrNull { it.atLevel }?.count ?: choice.count,
                    constraints = (choice.constraints + changes.flatMap { it.constraints }).distinct(),
                    collection = changes.firstNotNullOfOrNull { it.collection } ?: choice.collection)
            }
            val query = choice.query
            if (query != null) {
                if (query.category != EntryCategory.POWER) {
                    log += TimelineEvent.QueryCoverage(ChoiceSlotId(instance, id, 0), query.category)
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
        if (id.isBlank() || count !in 0..100 || offered.keys.any { it.sourceInstanceId == instance && it.choiceId == id } ||
            choice is ChoiceDefinition.Entries && (choice.entryIds.distinct().size != choice.entryIds.size || choice.entryIds.any { it.isBlank() } ||
                (pending.choice as? ChoiceDefinition.Entries)?.query == null && choice.distinct && count > choice.entryIds.size)) {
            log += TimelineEvent.InvalidChoice(owner)
            return
        }
        if (choice is ChoiceDefinition.Entries) {
            offeredSets += OfferedSet(owner, choice)
        }
        for (ordinal in 0 until count) {
            val slot = ChoiceSlotId(instance, id, ordinal)
            offeredLevels[slot] = pending.acquiredAt
            val originalQuery = (pending.choice as? ChoiceDefinition.Entries)?.query
            val slotChoice = if (choice is ChoiceDefinition.Entries && originalQuery != null && !originalQuery.characterLevel) {
                val replacedAt = document.levels.filter { level -> level.replacements.any { it.replaces == slot } }.maxOfOrNull { it.level }
                val maximum = replacedAt ?: originalQuery.levelMaximum ?: choice.atLevel
                choice.copy(entryIds = choice.entryIds.filter { candidate ->
                    val found = content.entries[candidate] as? ContractResult.Available
                    found?.value?.entry?.mechanics?.powerProfile?.level?.let { it <= maximum } == true
                })
            } else choice
            offered[slot] = slotChoice
            if (choice is ChoiceDefinition.Entries) {
                val picks = decisions.filter { it.slot == slot }
                if (picks.size != 1) {
                    log += TimelineEvent.MissingPick(slot, owner)
                    continue
                }
                val decision = picks.single()
                usedDecisions += decision
                val definition = select(decision)
                if (decision.selection.entryId !in (slotChoice as ChoiceDefinition.Entries).entryIds) {
                    log += TimelineEvent.OptionNotOffered(slot, decision.selection.entryId)
                }
                // Preserve and diagnose invalid saved decisions; never silently drop an owned occurrence.
                if (definition != null) {
                    visit(definition, decision.instanceId, slot, false, pending.ancestors, savedLevels.getValue(slot))
                }
            }
        }
    }
}
