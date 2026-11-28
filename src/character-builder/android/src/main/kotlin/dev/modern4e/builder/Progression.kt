package dev.modern4e.builder

/**
 * Display strings for one row of the shared [AdvancementRules] schedule; totals describe grants, never calculated
 * combat statistics.
 */
data class ProgressionLevel(val level: Int, val powers: List<String>, val feat: Boolean,
    val ability: AbilityIncreaseKind? = null, val replacement: String? = null, val automatic: List<String> = emptyList())

internal data class ProgressionGrant(val occurrence: EngineEntry, val level: Int, val sourceCategory: EntryCategory) {
    val entry get() = occurrence.definition.entry
    val isPower get() = entry.category == EntryCategory.POWER
    val label get() = sourceCategory.name.split('_').joinToString(" ") { it.readable() } +
        if (isPower) " Power" else " Feature"
}

object Progression {
    /** Preview a replacement draft for this milestone without counting its saved increase twice. */
    internal fun advancementPreviewPoints(state: BuilderState, level: Int, selected: Set<Ability>): Map<Ability, Int> {
        val current = state.rules.overviewAbilityTotals
        if (!AdvancementRules.choosesAbilityIncrease(level) || level > state.document.level) {
            return current
        }
        val saved = state.document.levels.firstOrNull { it.level == level }?.abilityAdvancements?.singleOrNull()
            ?.takeIf { AdvancementRules.validAdvancement(level, it) }
        return current.mapValues { (ability, points) ->
            points - (saved?.increases?.get(ability) ?: 0) +
                if (ability in selected) 1 else 0
        }
    }

    private val grantSources = setOf(EntryCategory.ANCESTRY, EntryCategory.CLASS, EntryCategory.THEME, EntryCategory.PARAGON_PATH, EntryCategory.EPIC_DESTINY)

    /** Level [n] of the shared schedule with display labels for scheduled powers and features. */
    fun level(n: Int): ProgressionLevel {
        val row = AdvancementRules.level(n)
        val powers = row.powers.map { power ->
            val kind = when (power.kind) {
                ScheduledPowerKind.AT_WILL -> "at-will"
                ScheduledPowerKind.ENCOUNTER -> "encounter"
                ScheduledPowerKind.DAILY -> "daily"
                ScheduledPowerKind.UTILITY -> "utility"
            }
            when (power.source) {
                EntryCategory.PARAGON_PATH -> "Paragon $kind"
                EntryCategory.EPIC_DESTINY -> "Epic $kind"
                else -> kind.replaceFirstChar { it.titlecase() }
            }
        }
        val features = row.features?.let { features ->
            when (features.source) {
                EntryCategory.PARAGON_PATH -> if (features.several) "Paragon path features" else "Paragon path feature"
                else -> "Epic destiny feature"
            }
        }
        return ProgressionLevel(n, powers, row.feat, row.abilityIncrease, row.replacement?.name?.lowercase(), listOfNotNull(features))
    }

    /** Level at which an engine entry arrived: its own decision level, else its source chain's grant/progression level. */
    fun acquiredAt(state: BuilderState, source: EngineEntry, seen: Set<String> = emptySet()): Int {
        state.document.levels.firstOrNull { level -> level.entries.any { it.instanceId == source.instanceId } }?.let { return it.level }
        if (source.instanceId in seen) {
            return 1
        }
        val parent = state.rules.entries.firstOrNull { it.instanceId == source.slot.sourceInstanceId } ?: return 1
        val grant = parent.definition.entry.mechanics.grants.filterIsInstance<Grant.Entry>().firstOrNull { it.grantId == source.slot.choiceId }
        val progressedAt = parent.definition.entry.mechanics.progression.filter { progression -> progression.grants.any {
            it is Grant.Entry && it.grantId == source.slot.choiceId
        } }.maxOfOrNull { it.level } ?: 1
        return maxOf(grant?.atLevel ?: 1, progressedAt, acquiredAt(state, parent, seen + source.instanceId))
    }

    /**
     * Only the engine can declare real class choices; this is the set of inline offers the Progression screen shows
     * at a level. Root offers have their own rows, found through [AdvancementRules.rootSlot].
     */
    fun levelChoices(state: BuilderState, level: Int): List<EngineChoice> = state.rules.choices.filter { choice ->
        choice.listing == SlotListing.INLINE && (choice.acquisitionLevel ?: state.rules.entries.firstOrNull {
            it.instanceId == choice.slot.sourceInstanceId
        }?.let { source ->
            maxOf(acquiredAt(state, source), source.definition.entry.mechanics.progression.filter { progression ->
                progression.choices.any { it.choiceId() == choice.slot.choiceId }
            }.maxOfOrNull { it.level } ?: 1)
        }) == level
    }

    /** Active class attack acquisitions that can be replaced at this printed milestone. */
    internal fun replacementTargets(state: BuilderState, level: Int): List<EntryChoice> {
        val usage = level(level).replacement?.uppercase() ?: return emptyList()
        val selectedAt = state.document.levels.flatMap { decisions -> decisions.entries.map { it.slot to decisions.level } }.toMap()
        return state.rules.entries.filter { occurrence ->
            val profile = occurrence.definition.entry.mechanics.powerProfile
            val choice = state.rules.choices.firstOrNull { it.slot == occurrence.slot }
            !occurrence.granted && (selectedAt[occurrence.slot] ?: level) < level &&
                profile?.powerKind == "ATTACK" && profile.usage == usage &&
                choice != null && isClassFeatureChoice(state, choice)
        }.map { occurrence ->
            val definition = occurrence.definition
            EntryChoice(occurrence.instanceId, occurrence.slot, SavedSelection(definition.entry.id,
                definition.entry.presentation.title, definition.supplier.packageId, definition.fingerprint))
        }
    }

    /** Direct ancestry language choices displayed at creation. */
    internal fun ancestryLanguageChoices(state: BuilderState): List<EngineChoice> {
        val ancestryInstances = state.rules.entries.filter { it.definition.entry.category == EntryCategory.ANCESTRY }
            .mapTo(mutableSetOf()) { it.instanceId }
        return levelChoices(state, 1).filter { it.valueKind == FactKind.LANGUAGE && it.slot.sourceInstanceId in ancestryInstances }
    }

    /** Starting ancestry power choices shown at creation, including choices owned by granted traits. */
    internal fun ancestryPowerChoices(state: BuilderState, powerEntryIds: Set<String>): List<EngineChoice> {
        val entries = state.rules.entries.associateBy { it.instanceId }
        fun belongsToAncestry(instanceId: String): Boolean {
            val visited = mutableSetOf<String>()
            var owner = entries[instanceId]
            while (owner != null && visited.add(owner.instanceId)) {
                if (owner.definition.entry.category == EntryCategory.ANCESTRY) {
                    return true
                }
                if (!owner.granted) {
                    return false
                }
                owner = entries[owner.slot.sourceInstanceId]
            }
            return false
        }
        return levelChoices(state, 1).filter { choice ->
            val definition = entries[choice.slot.sourceInstanceId]?.definition?.entry?.mechanics?.choices
                ?.filterIsInstance<ChoiceDefinition.Entries>()?.firstOrNull { it.id == choice.slot.choiceId }
            val level = choice.acquisitionLevel ?: definition?.atLevel ?: 1
            level == 1 && choice.isPowerChoice(powerEntryIds) && belongsToAncestry(choice.slot.sourceInstanceId)
        }
    }

    /** Returns the authored introduction for an active choice owned by an introductory feature. */
    internal fun choiceIntroduction(state: BuilderState, slot: ChoiceSlotId): String? {
        if (state.rules.choices.none { it.slot == slot }) {
            return null
        }
        val description = state.rules.entries.firstOrNull { it.instanceId == slot.sourceInstanceId }?.definition?.entry
            ?.presentation?.takeIf { it.grantDisplay == GrantDisplay.CHOICE_INTRODUCTION }
            ?.description ?: return null
        val introduction = when (slot.choiceId) {
            "modern4e.choice.sorcerer-spell-source" -> description.substringBefore("Choose either").trimEnd()
            "modern4e.choice.warlock-eldritch-pact" -> description.substringBefore("Choose one pact").trimEnd()
            else -> description
        }
        return introduction.takeIf { it.isNotBlank() }
    }

    /** Finds granted features and powers whose entire source chain is automatic beneath a selected advancement entry. */
    internal fun automaticGrants(state: BuilderState): List<ProgressionGrant> {
        val entries = state.rules.entries.associateBy { it.instanceId }
        val editableSlots = state.rules.choices.mapTo(mutableSetOf()) { it.slot }
        return state.rules.entries.mapNotNull { occurrence ->
            val entry = occurrence.definition.entry
            if ((entry.category != EntryCategory.FEATURE && entry.category != EntryCategory.POWER) ||
                entry.presentation.grantDisplay != GrantDisplay.STANDALONE
            ) {
                return@mapNotNull null
            }
            var current = occurrence
            val visited = mutableSetOf<String>()
            while (current.granted && current.slot !in editableSlots && visited.add(current.instanceId)) {
                val source = entries[current.slot.sourceInstanceId] ?: break
                val sourceCategory = source.definition.entry.category
                if (sourceCategory in grantSources) {
                    val acquired = acquiredAt(state, occurrence)
                    val startingGrant = when (sourceCategory) {
                        EntryCategory.ANCESTRY, EntryCategory.CLASS, EntryCategory.THEME -> true
                        else -> false
                    }
                    val displayLevel = if (startingGrant && acquired == 1) 0 else acquired
                    return@mapNotNull ProgressionGrant(occurrence, displayLevel, sourceCategory)
                }
                current = source
            }
            null
        }
    }

    /** Separates Level 1 power slots from the regular rows while preserving engine order. */
    fun partitionLevelChoices(
        level: Int,
        choices: List<EngineChoice>,
        powerEntryIds: Set<String>,
    ): Pair<List<EngineChoice>, List<EngineChoice>> =
        choices.filter { it.abilities.isEmpty() }.partition { choice ->
            level == 1 && choice.isPowerChoice(powerEntryIds)
        }

    /**
     * One level's automatic grants in the groups its row shows them in.
     *
     * @property path features and powers a Paragon Path grants; they follow the path's own choice row.
     * @property classGrants the class's features and powers.
     * @property features other features, shown after the level's choices.
     * @property powers other powers, shown after the level's feat.
     */
    internal data class LevelGrants(
        val path: List<ProgressionGrant>,
        val classGrants: List<ProgressionGrant>,
        val features: List<ProgressionGrant>,
        val powers: List<ProgressionGrant>,
    )

    /** Group a level's [grants] by where its row shows them. */
    internal fun levelGrants(grants: List<ProgressionGrant>): LevelGrants {
        val (path, rest) = grants.partition { it.sourceCategory == EntryCategory.PARAGON_PATH }
        val (classGrants, other) = rest.partition { it.sourceCategory == EntryCategory.CLASS }
        val (powers, features) = other.partition { it.isPower }
        return LevelGrants(path, classGrants, features, powers)
    }

    internal fun EngineChoice.isPowerChoice(powerEntryIds: Set<String>): Boolean =
        entries.isNotEmpty() && entries.all { it.entryId in powerEntryIds }

    private val PowerPoolLabels = Regex("class-attack-(at-will|encounter|daily)(?:-\\d+)?")
    private val UtilityPoolLabel = Regex("class-utility(?:-\\d+)?")
    private val PossessiveWords = mapOf("hunters" to "Hunter's", "vindicators" to "Vindicator's")

    /**
     * Readable name for an engine choice id such as `modern4e.choice.fighter-reactivity`.
     *
     * @param choiceId the slot's choice id.
     * @param className the character's class title, whose leading id word is dropped.
     * @return a title-case label; power pools read "At-Will attack power" or "Utility power", and trailing level numbers are omitted.
     */
    fun choiceLabel(choiceId: String, className: String? = null): String {
        val name = choiceId.removePrefix("modern4e.choice.")
        PowerPoolLabels.matchEntire(name)?.let { match ->
            return match.groupValues[1].split('-').joinToString("-") { it.replaceFirstChar { c -> c.titlecase() } } + " attack power"
        }
        if (UtilityPoolLabel.matches(name)) {
            return "Utility power"
        }
        var words = name.split('-', '.').filter { it.isNotEmpty() }
        if (words.size > 1 && words.last().all { it.isDigit() }) {
            words = words.dropLast(1)
        }
        if (words.size > 1 && words.first() == className?.lowercase()) {
            words = words.drop(1)
        }
        val label = StringBuilder()
        words.forEach { word ->
            if (word == "s" && label.isNotEmpty()) {
                label.append("'s")
            } else {
                if (label.isNotEmpty()) {
                    label.append(' ')
                }
                label.append(PossessiveWords[word] ?: word.replaceFirstChar { it.titlecase() })
            }
        }
        return label.toString()
    }

    /** Label a value choice by its grant source and what the player selects. */
    fun valueChoiceLabel(kind: FactKind, ordinal: Int, sourceTitle: String, sourceCategory: EntryCategory?): String {
        if (kind == FactKind.LANGUAGE && sourceCategory == EntryCategory.ANCESTRY) {
            return "Ancestry Language"
        }
        val label = when (kind) {
            FactKind.LANGUAGE -> "language ${ordinal + 1}"
            FactKind.EQUIPMENT_PROFICIENCY -> "weapon proficiency"
            FactKind.DAMAGE_TYPE -> "damage type"
            FactKind.ANCESTRY_QUALIFICATION -> "Past Life ancestry"
            FactKind.SKILL_BONUS -> "bonus skill"
        }
        return "$sourceTitle: $label"
    }

    /** Attack-power pools have an authored attack query. */
    fun isAttackPowerChoice(state: BuilderState, choice: EngineChoice): Boolean =
        powerQuery(state, choice)?.powerKind == "ATTACK"

    /** Advancement power pools are identified by their query, independent of the types of other choice results. */
    internal fun isPowerPool(state: BuilderState, choice: EngineChoice): Boolean =
        powerQuery(state, choice)?.category == EntryCategory.POWER

    internal fun powerQuery(state: BuilderState, choice: EngineChoice): PowerQuery? = state.powerQuery(choice)

    /** Feature choices may be owned by the class itself or by one of the features it grants. */
    internal fun isClassFeatureChoice(state: BuilderState, choice: EngineChoice): Boolean {
        val entriesByInstance = state.rules.entries.associateBy { it.instanceId }
        val visited = mutableSetOf<String>()
        var source = entriesByInstance[choice.slot.sourceInstanceId]
        while (source != null && visited.add(source.instanceId)) {
            when (source.definition.entry.category) {
                EntryCategory.CLASS -> return true
                EntryCategory.FEATURE -> source = entriesByInstance[source.slot.sourceInstanceId]
                else -> return false
            }
        }
        return false
    }

    fun background(document: CharacterDocument, kind: String): String =
        (if (kind == "environment") document.identity.environment else document.identity.upbringing).ifBlank {
            document.levels.filter { it.level <= document.level }.flatMap { it.proficiencies }.firstOrNull {
                it.slot.sourceInstanceId.startsWith("background.$kind.")
            }?.slot?.sourceInstanceId?.removePrefix("background.$kind.").orEmpty()
        }

    /** The main ability is fixed and does not spend the five-point allocation budget. */
    fun remainingPoints(allocation: AbilityAllocation): Int =
        5 - Ability.entries.filter { it != allocation.mainAbility }.sumOf { allocation.points[it] ?: 0 }

    /** Move the four main points and preserve the distribution of non-main points. */
    fun changeMainAbility(allocation: AbilityAllocation, ability: Ability): AbilityAllocation {
        if (ability == allocation.mainAbility) {
            return allocation
        }
        return allocation.copy(
            mainAbility = ability,
            points = allocation.points + mapOf(
                ability to 4,
                allocation.mainAbility to (allocation.points[ability] ?: 0),
            ),
        )
    }

    /** Compact labels for the skill picker; proficiency is already conveyed by selection/status. */
    fun skillContributorLabel(label: String): String? = when {
        label == "Proficiency" -> null
        Ability.entries.any { label == "${it.name} points" } -> label.removeSuffix(" points").readable()
        else -> label
    }

    /** Whether a stepper can move this ability by one point. */
    fun canAdjustAbility(allocation: AbilityAllocation, ability: Ability, delta: Int): Boolean {
        if (ability == allocation.mainAbility || delta !in listOf(-1, 1)) {
            return false
        }
        val next = (allocation.points[ability] ?: 0) + delta
        if (next !in -1..3) {
            return false
        }
        val points = allocation.points + (ability to next)
        val values = Ability.entries.filter { it != allocation.mainAbility }.map { points[it] ?: 0 }
        val negatives = values.count { it < 0 }
        val boosted = values.count { it > 2 }
        return negatives <= 1 && boosted <= 1 && (boosted == 0 || negatives == 1)
    }

    /** Uses the same point rules as the shared engine. */
    fun validAllocation(allocation: AbilityAllocation): Boolean = allocation.hasValidPoints()

    /** Rules failures for saved selections and engine-defined slots, including unresolved content. */
    fun invalidChoiceSlots(rules: EngineResult): Set<ChoiceSlotId> = buildSet {
        rules.diagnostics.filter { diagnostic ->
            // Remaining picks describe the whole set, reported against ordinal zero, not an illegal saved pick.
            diagnostic.code != "engine.selectionRemaining" &&
                (diagnostic.kind in setOf(DiagnosticKind.INVALID_SELECTION, DiagnosticKind.UNRESOLVED_CONTENT) ||
                    diagnostic.code == "engine.duplicateProficiency")
        }.mapNotNullTo(this) { it.slot }
        rules.entries.filter { entry ->
            rules.entryEligibility[entry.instanceId]?.status in setOf(Eligibility.INELIGIBLE, Eligibility.UNRESOLVED)
        }.mapTo(this) { it.slot }
    }

    /** Future slots and empty optional slots are allowed. An illegal saved choice still needs attention. */
    fun choiceNeedsAttention(reached: Boolean, optional: Boolean, filled: Boolean, invalid: Boolean): Boolean =
        reached && (if (filled) invalid else !optional)

    /**
     * What a Levels heading reports.
     *
     * @param reached whether the character has reached the level; upcoming levels never count choices.
     * @param needs how many of the level's choices still need attention.
     */
    fun levelTally(reached: Boolean, needs: Int): LevelTally = when {
        !reached -> LevelTally.Upcoming
        needs > 0 -> LevelTally.Needs(needs)
        else -> LevelTally.Complete
    }

    /** Groups slots that share a label, keeping the order in which each label first appears. */
    fun <T> groupByLabel(items: List<T>, label: (T) -> String): List<Pair<String, List<T>>> = items.groupBy(label).toList()

    /** Lays one power group's slots out in rows of at most two: a pair sits side by side, a lone slot takes the full width. */
    fun <T> powerRows(group: List<T>): List<List<T>> = group.chunked(2)

    /**
     * Decisions the character still needs: the engine's required slot offers that are unfilled, plus the two
     * background origins and an invalid allocation, which are not slots.
     */
    fun unfinished(state: BuilderState): Int {
        val doc = state.document
        return state.rules.choices.count { it.missing } +
            listOf("environment", "upbringing").count { background(doc, it).isEmpty() } +
            if (validAllocation(doc.abilities)) 0 else 1
    }
}

/** A Levels heading's status: not reached yet, finished, or this many required choices still open. */
sealed interface LevelTally {
    data object Upcoming : LevelTally
    data object Complete : LevelTally
    data class Needs(val count: Int) : LevelTally
}

internal fun ChoiceDefinition.choiceId(): String = when (this) {
    is ChoiceDefinition.Entries -> id
    is ChoiceDefinition.Proficiencies -> id
    is ChoiceDefinition.MainAbility -> id
    is ChoiceDefinition.Values -> id
}

/** Modern background prose; proficiency options remain owned by ModernCreation. */
internal val BackgroundDescriptions = mapOf(
    "nomadic" to "Your adventurer grew up traveling from place to place, never staying in one location for too long. They might have been part of a caravan, or a tribe that roamed the land. Those who grow up in a nomadic environment learn to navigate the wilderness and work together to survive.",
    "rural" to "Your adventurer grew up in a small town or village, surrounded by farmland and open fields. Life in a rural environment is often simple and hard-working, with a strong sense of community. Those who grow up in rural areas learn to get along with eachother, and everyone has to contribute to the community in some way through a trade.",
    "wilderness" to "Your adventurer grew up in the wilds, far from civilization. They might have lived in a forest, a desert, or a mountainous region. Life in the wilderness is often harsh and unforgiving, requiring resourcefulness and adaptability to survive. Those who grow up in the wilderness learn to be self-reliant and attuned to nature.",
    "urban" to "Your adventurer grew up in a bustling city or town, surrounded by people and activity. Life in an urban environment is often fast-paced and diverse, with a wide range of cultures and experiences. Those who grow up in urban areas learn to navigate social situations and political movements as part of the city life.",
    "secluded" to "Your adventurer grew up in a secluded environment, such as a monastery, a fortress, or a hidden village. Life in a secluded environment is often disciplined and focused, with a strong emphasis on tradition and values. Those who grow up in secluded areas have enough time to study and self-discipline.",
    "academic" to "Your adventurer was raised in an environment that valued knowledge and learning. They might have attended a prestigious academy, or been part of a scholarly community. Those who grow up with an academic upbringing learn to think critically and value education.",
    "militaristic" to "Your adventurer was raised in a disciplined and structured environment, such as a military academy or a warrior clan. Those who grow up with a militaristic upbringing learn the value of order, strategy, and physical fitness.",
    "lawless" to "Your adventurer was raised in a chaotic and unpredictable environment, such as a gang, a thieves' guild, or a rough neighborhood. Those who grow up with a lawless upbringing learn to be resourceful and adaptable, often relying on their wits to get by.",
    "labor" to "Your adventurer was raised in a working-class environment that valued hard work and practical skills. They might have grown up in a family of laborers, craftsmen, or farmers. Those who grow up with a labor upbringing learn the value of perseverance and dedication.",
    "spiritual" to "Your adventurer was raised in a religious or spiritual environment, such as a temple, a monastery, or a faith-based community. Those who grow up with a spiritual upbringing learn to value faith, compassion, and inner strength.",
    "creative" to "Your adventurer was raised in an environment that valued artistic expression and creativity. They might have grown up in a family of artists, performers, or musicians. Those who grow up with a creative upbringing learn to think outside the box and value individuality.",
)
