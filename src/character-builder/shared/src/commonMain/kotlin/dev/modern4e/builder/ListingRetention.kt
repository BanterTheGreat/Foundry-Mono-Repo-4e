package dev.modern4e.builder

/** Whether a listing computed before an edit is still correct afterwards. */
sealed class RetentionVerdict {
    /** The listing belongs to another character: build it again. */
    data object Drop : RetentionVerdict()

    /** Every row keeps its result as is, including rows still unchecked. */
    data object Keep : RetentionVerdict()

    /**
     * List the slot again for the new character, keeping every loaded definition, and evaluate again the rows whose
     * candidate [recheck] selects. The rest keep their checked result.
     */
    class Rebase(val recheck: (ContentEntry) -> Boolean) : RetentionVerdict()
}

/**
 * Decides whether a listing survives an edit, from the character before and after it. A listing is checked against
 * its own slot with that slot replaced by each candidate, so it stays correct while the slot's occurrence, its
 * candidate pool and every other rules input at or below its level are unchanged. Selections proven independent of
 * the listing ([EffectProfile]) do not count as changed inputs. Content is assumed unchanged: a catalog change
 * discards every listing before this is asked.
 */
object ListingRetention {
    fun verdict(before: BuilderState, after: BuilderState, listing: BuilderOptionListing): RetentionVerdict {
        if (before.document.id != after.document.id) {
            return RetentionVerdict.Drop
        }
        val level = listing.level
        val slot = listing.slot
        if (stillValid(before, after, listing)) {
            return RetentionVerdict.Keep
        }
        val changes = selectionChanges(before, after, level)
        val samePool = sameChoicePool(before, after, slot)
        fun BuilderState.occurrence() = document.levels.flatMap { it.entries }
            .firstOrNull { it.slot == slot }?.instanceId ?: listing.newInstanceId
        val sameOccurrence = before.occurrence() == after.occurrence()
        if (!samePool || !sameOccurrence || changes == null) {
            return RetentionVerdict.Rebase { true }
        }
        val categories = listing.categories()
        return RetentionVerdict.Rebase { candidate -> !ChoiceCacheDependencies.canRetain(candidate, changes, categories) }
    }

    /** The Class and Ancestry pickers list the whole catalog and never depend on the rest of the character. */
    fun isRootList(level: Int, slot: ChoiceSlotId): Boolean =
        AdvancementRules.rootCategory(level, slot).let { it == EntryCategory.CLASS || it == EntryCategory.ANCESTRY }

    /**
     * The candidate check replaces its own slot before evaluating rules. Saving a candidate there can
     * reuse the listing when the same occurrence and candidate pool are still in use and other inputs
     * at or below the slot level are unchanged.
     */
    private fun stillValid(before: BuilderState, after: BuilderState, listing: BuilderOptionListing): Boolean {
        val level = listing.level
        val slot = listing.slot
        if (slot.choiceId == "feat" &&
            (before.featClasses() != after.featClasses() || before.featAncestries() != after.featAncestries())) {
            return false
        }
        if (isRootList(level, slot) || firstChangedLevel(before.document, after.document) > level) {
            return true
        }
        val ignores = independentSelections(before, after, listing)
        if (firstChangedLevel(before.document, after.document, ignoreEntry = ignores) > level) {
            return sameChoicePool(before, after, slot)
        }
        val previous = before.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
        val selected = after.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }
        if ((previous?.instanceId ?: listing.newInstanceId) != (selected?.instanceId ?: listing.newInstanceId) ||
            firstChangedLevel(before.document, after.document, level to slot, ignores) <= level) {
            return false
        }
        // Root Theme and Feat listings use the installed category, independent of the effective choice.
        val rootCategory = AdvancementRules.rootCategory(level, slot)
        val catalogRoot = (level == 1 && (rootCategory == EntryCategory.THEME || rootCategory == EntryCategory.FEAT)) ||
            (level == 2 && rootCategory == EntryCategory.FEAT)
        if (catalogRoot) {
            return true
        }
        return sameChoicePool(before, after, slot)
    }

    /**
     * Pool changes always discard results, even when the triggering edit belongs to another family. Only inline offers
     * carry a pool; a root offer's deferred listing comes from its fixed catalog category.
     */
    private fun sameChoicePool(before: BuilderState, after: BuilderState, slot: ChoiceSlotId): Boolean {
        fun EngineChoice.membership() = Triple(optional, acquisitionLevel, entries.map { it.entryId })
        fun BuilderState.pool() = rules.choices.singleOrNull { it.slot == slot && it.listing == SlotListing.INLINE }
        return before.pool()?.membership() == after.pool()?.membership()
    }

    /** Utility is one family; attack powers are separate families for each usage. */
    private fun powerFamily(kind: String?, usage: String?): String? = when (kind) {
        "UTILITY" -> "UTILITY"
        "ATTACK" -> usage?.let { "ATTACK:$it" }
        else -> null
    }

    /** Unknown or non-selection input changes require fresh eligibility, while definitions remain reusable. */
    private fun selectionChanges(before: BuilderState, after: BuilderState, level: Int): List<ContentEntry>? {
        if (firstChangedLevel(before.document, after.document, ignoreEntry = { true }) <= level ||
            poolRules(before) != poolRules(after)) {
            return null
        }
        fun CharacterDocument.selections() = levels.filter { it.level <= level }.flatMap {
            it.entries + it.replacements.map { replacement -> replacement.replacement }
        }.toSet()
        val old = before.document.selections()
        val new = after.document.selections()
        val changed = ((old - new) + (new - old)).map { it.selection.entryId }.toMutableSet()
        val replacements = (before.document.levels + after.document.levels).filter { it.level <= level }
            .flatMap { it.replacements }.map { it.replaces }.toSet()
        changed += (old + new).filter { it.slot in replacements }.map { it.selection.entryId }
        val definitions = (before.rules.entries + after.rules.entries).associate { it.definition.entry.id to it.definition.entry }
        return changed.map { definitions[it] ?: return null }
    }

    /** Active pool overrides and granted powers can change eligibility without changing offered entry IDs. */
    private fun poolRules(state: BuilderState) = state.rules.entries.filter {
        val mechanics = it.definition.entry.mechanics
        mechanics.selectionModifiers.isNotEmpty() || mechanics.collections.isNotEmpty() ||
            it.definition.entry.category == EntryCategory.CLASS ||
            it.granted && it.definition.entry.category == EntryCategory.POWER
    }.map { Triple(it.instanceId, it.slot, it.definition.entry) }

    /**
     * Ignore only selections proven independent of this completed listing. Unknown definitions and
     * mechanics that grant facts or change power pools retain the conservative level-based rule.
     */
    private fun independentSelections(before: BuilderState, after: BuilderState,
        listing: BuilderOptionListing): (EntryChoice) -> Boolean {
        fun CharacterDocument.selections() = levels.flatMap { it.entries + it.replacements.map { change -> change.replacement } }.toSet()
        val old = before.document.selections()
        val new = after.document.selections()
        val changedIds = ((old - new) + (new - old)).mapTo(mutableSetOf()) { it.selection.entryId }
        val oldReplacements = before.document.levels.flatMap { it.replacements }.toSet()
        val newReplacements = after.document.levels.flatMap { it.replacements }.toSet()
        val replacedSlots = ((oldReplacements - newReplacements) + (newReplacements - oldReplacements)).map { it.replaces }.toSet()
        changedIds += (old + new).filter { it.slot in replacedSlots }.map { it.selection.entryId }
        if (changedIds.isEmpty()) {
            return { false }
        }
        val choice = before.rules.choices.singleOrNull { it.slot == listing.slot }
        val query = choice?.let { before.powerQuery(it) }
        val family = query?.let { powerFamily(it.powerKind, it.usage) }
        val samePowerRules = family != null && poolRules(before) == poolRules(after)
        val definitions = (before.rules.entries + after.rules.entries).map { it.definition.entry }
            .filter { it.id in changedIds }.associateBy { it.id }
        val ignored = definitions.values.filter { entry ->
            when (entry.category) {
                EntryCategory.POWER -> {
                    val profile = entry.mechanics.powerProfile
                    EffectProfile.of(entry).kind == EffectKind.PLAIN_POWER &&
                        (family == null || family != powerFamily(profile?.powerKind, profile?.usage)) &&
                        canIgnorePowerChange(listing, entry)
                }
                EntryCategory.FEAT -> samePowerRules && entry.mechanics.version == 2 && canIgnoreFeatChange(listing, entry)
                else -> false
            }
        }.mapTo(mutableSetOf()) { it.id }
        return { it.selection.entryId in ignored }
    }

    /** Check the authored dependencies of powers with extra requirements, such as skill utilities. */
    internal fun canIgnoreFeatChange(listing: BuilderOptionListing, feat: ContentEntry): Boolean {
        val entries = listing.checkedEntries() ?: return false
        val profile = EffectProfile.of(feat)
        val categories = listing.categories()
        return entries.all { entry ->
            entry.category == EntryCategory.POWER && EffectProfile.of(entry).kind == EffectKind.PLAIN_POWER &&
                (entry.mechanics.prerequisites + listOfNotNull(entry.mechanics.access)).flatMap { it.leaves() }.none { leaf ->
                    // The pool already restricts a power list to the character's classes.
                    !(leaf is Prerequisite.Entry && categories[leaf.entryId] == EntryCategory.CLASS) && profile.canAffect(leaf)
                }
        }
    }

    /** A passive power still matters to lists that name it or ask for selected powers. */
    internal fun canIgnorePowerChange(listing: BuilderOptionListing, power: ContentEntry): Boolean {
        val entries = listing.checkedEntries() ?: return false
        val profile = EffectProfile.of(power)
        return entries.all { entry ->
            entry.mechanics.version == 2 && entry.id != power.id &&
                (entry.mechanics.prerequisites + listOfNotNull(entry.mechanics.access)).flatMap { it.leaves() }.none {
                    profile.canAffect(it)
                }
        }
    }

    /** Lowest level whose rules inputs differ between two documents; 1 for non-level inputs, Int.MAX_VALUE if none. */
    private fun firstChangedLevel(old: CharacterDocument, new: CharacterDocument, ignored: Pair<Int, ChoiceSlotId>? = null,
        ignoreEntry: (EntryChoice) -> Boolean = { false }): Int {
        fun CharacterDocument.nonLevelInputs() = copy(savedAt = "", level = 1, levels = emptyList(),
            identity = CharacterIdentity("-", environment = identity.environment, upbringing = identity.upbringing))
        if (old.nonLevelInputs() != new.nonLevelInputs()) {
            return 1
        }
        val top = maxOf(old.level, new.level, old.levels.maxOfOrNull { it.level } ?: 0, new.levels.maxOfOrNull { it.level } ?: 0)
        val replacementInputs = (old.levels + new.levels).flatMap { decisions ->
            decisions.entries + decisions.replacements.map { it.replacement }
        }.groupBy { it.slot }
        fun CharacterDocument.decisions(level: Int): LevelDecisions? {
            val decisions = levels.firstOrNull { it.level == level }
            return decisions?.copy(entries = decisions.entries.filterNot {
                ignored?.first == level && it.slot == ignored.second || ignoreEntry(it)
            }, replacements = decisions.replacements.filterNot { replacement ->
                // A replacement also removes its predecessor; both sides must be independent.
                val displaced = replacementInputs[replacement.replaces].orEmpty()
                displaced.isNotEmpty() && displaced.all(ignoreEntry) && ignoreEntry(replacement.replacement)
            })
        }
        for (level in 1..top) {
            if (old.decisions(level) != new.decisions(level)) {
                return level
            }
        }
        return if (old.level != new.level) minOf(old.level, new.level) + 1 else Int.MAX_VALUE
    }
}

/** Feat access can come from a class entry or a multiclass feat. Include qualification facts conservatively. */
fun BuilderState.featClasses(): Set<String> = buildSet {
    addAll(document.classEntryIds())
    for (occurrence in rules.entries) {
        val entry = occurrence.definition.entry
        if (entry.category == EntryCategory.CLASS) {
            add(entry.id)
        }
        if (entry.category == EntryCategory.FEAT) {
            entry.mechanics.multiclassFor?.let { add(it) }
        }
    }
    rules.facts.filter { it.kind == FactKind.ANCESTRY_QUALIFICATION }.forEach { add(it.value) }
}

/** Past Life can qualify a character for another ancestry's feats. */
fun BuilderState.featAncestries(): Set<String> = buildSet {
    addAll(document.ancestryEntryIds())
    rules.facts.filter { it.kind == FactKind.ANCESTRY_QUALIFICATION }.forEach { add(it.value) }
}

/** The power query behind an entry choice its source offers, or null for other choices. */
fun BuilderState.powerQuery(choice: EngineChoice): PowerQuery? {
    if (choice.optional || choice.abilities.isNotEmpty() || choice.entries.isEmpty()) {
        return null
    }
    val source = rules.entries.firstOrNull { it.instanceId == choice.slot.sourceInstanceId } ?: return null
    val mechanics = source.definition.entry.mechanics
    return (mechanics.choices + mechanics.progression.flatMap { it.choices })
        .filterIsInstance<ChoiceDefinition.Entries>().firstOrNull { it.id == choice.slot.choiceId }?.query
}
