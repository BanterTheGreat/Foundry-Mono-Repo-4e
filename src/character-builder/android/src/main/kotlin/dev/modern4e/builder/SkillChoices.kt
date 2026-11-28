package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.ChoosePlaceholder

/** One of the level 1 skill tiles on Levels: the class skill, the free skills or the theme's Novice skill. */
internal data class SkillTile(
    val title: String,
    /** The sheet the tile opens. */
    val kind: String,
    /** The single slot the sheet edits; null for the free skills, which share one sheet. */
    val slot: ChoiceSlotId?,
    val value: String,
    val chosen: Boolean,
    val enabled: Boolean,
    /** Whether [value] explains what is missing instead of naming a selection. */
    val hint: Boolean = false,
)

/** A skill picker row, showing the rank the character would hold with the draft picks. */
internal data class SkillPickRow(val skill: Skill, val rank: SkillRank, val chosen: Boolean, val blocked: Boolean)

/** What a picker's header counts: [used] of [total] picks or points. [left] is negative when overspent. */
internal data class PickTally(val title: String, val subtitle: String, val total: Int, val used: Int) {
    val left: Int get() = total - used

    /** The header read as one sentence. */
    val description: String get() = "$title, $left of $total left"
}

/** The free skill picker's header for [picked] draft picks. */
internal fun freeSkillTally(picked: Int): PickTally = PickTally("Free skills",
    "Choose ${ModernCreation.FREE_SKILL_COUNT} to start Trained", total = ModernCreation.FREE_SKILL_COUNT, used = picked)

/** The free Trained skill slots, in order. */
internal val freeSkillSlots: List<ChoiceSlotId>
    get() = (0 until ModernCreation.FREE_SKILL_COUNT).map(ModernCreation::freeSkillSlot)

private val tileSkillChoices = setOf(ModernCreation.CLASS_SKILL_CHOICE, ModernCreation.THEME_SKILL_CHOICE)

/** Whether a slot has its own skill tile and so no ordinary Levels row. */
internal fun ChoiceSlotId.hasSkillTile(): Boolean = choiceId in tileSkillChoices

/** The saved picks of [slots] that [offered] still contains, so every pick shown in a picker can be cleared. */
internal fun savedSkillPicks(document: CharacterDocument, slots: List<ChoiceSlotId>, offered: List<Skill>): List<Skill> {
    val saved = document.levels.flatMap { it.proficiencies }.associate { it.slot to it.skill.current }
    return slots.mapNotNull { saved[it] }.filter { it in offered }.distinct()
}

/** Replace every pick of [slots] as one edit, filling the slots in pick order. */
internal fun skillPickEdit(level: Int, slots: List<ChoiceSlotId>, picks: List<Skill>): BuilderEdit =
    BuilderEdit.Batch(listOf(BuilderEdit.RemoveProficiency(slots.toSet())) + picks.mapIndexed { index, pick ->
        BuilderEdit.Proficiency(level, ProficiencyChoice(slots[index], pick))
    })

/** Toggle [skill] in the draft. A single slot swaps its pick; several slots stop accepting picks once full. */
internal fun toggleSkillPick(picks: List<Skill>, skill: Skill, slotCount: Int): List<Skill> = when {
    skill in picks -> picks - skill
    slotCount == 1 -> listOf(skill)
    picks.size < slotCount -> picks + skill
    else -> picks
}

/**
 * Picker rows for [offered] skills.
 *
 * Free picks and added training cannot repeat a skill another source already trains. The class skill comes first,
 * so it is never blocked, and the Novice pick is already limited to what the engine offers. A chosen row is never
 * blocked, which lets a pick that became a duplicate be cleared.
 *
 * @param slots the slots this picker fills; their saved picks are replaced by [picks].
 * @param granted the rank these slots grant.
 */
internal fun EngineResult.skillPickRows(offered: List<Skill>, slots: List<ChoiceSlotId>, picks: List<Skill>,
    granted: SkillRank): List<SkillPickRow> {
    val classSlot = slots.any { it.choiceId == ModernCreation.CLASS_SKILL_CHOICE }
    // Training bought with Skill Points comes after creation, so it neither blocks nor raises a creation pick.
    fun heldElsewhere(source: ChoiceSlotId) = source !in slots && SkillAdvancement.levelOf(source) == null
    return offered.map { skill ->
        val chosen = skill in picks
        val trained = proficiencies[skill].orEmpty().any(::heldElsewhere)
        val held = when {
            trained -> SkillRank.TRAINED
            noviceSkills[skill].orEmpty().any(::heldElsewhere) -> SkillRank.NOVICE
            else -> SkillRank.UNTRAINED
        }
        SkillPickRow(skill, if (chosen) maxOf(held, granted) else held, chosen,
            blocked = !chosen && !classSlot && granted == SkillRank.TRAINED && trained)
    }
}

/**
 * The level 1 skill tiles.
 *
 * @param needsAttention whether a slot is still empty or holds a pick the rules reject.
 */
internal fun startingSkillTiles(state: BuilderState, needsAttention: (ChoiceSlotId) -> Boolean): List<SkillTile> {
    val saved = state.document.levels.flatMap { it.proficiencies }.associate { it.slot to it.skill.current }
    fun entry(category: EntryCategory) = state.rules.entries.firstOrNull { it.definition.entry.category == category }
    fun offer(choiceId: String) = state.rules.choices.firstOrNull { it.slot.choiceId == choiceId }

    /** A tile whose single pick is open to the player. */
    fun pick(title: String, slot: ChoiceSlotId): SkillTile {
        val skill = saved[slot]
        return SkillTile(title, "skill", slot, skill?.title ?: ChoosePlaceholder,
            chosen = skill != null && !needsAttention(slot), enabled = true)
    }

    fun waiting(title: String, hint: String) = SkillTile(title, "skill", null, hint, chosen = false, enabled = false, hint = true)

    val classOffer = offer(ModernCreation.CLASS_SKILL_CHOICE)
    val classTile = when {
        entry(EntryCategory.CLASS) == null -> waiting("Class skill", "Choose Class first")
        classOffer != null -> pick("Class skill", classOffer.slot)
        else -> {
            val granted = state.rules.proficiencies.entries.firstOrNull { (_, sources) ->
                sources.any { it.choiceId == ModernCreation.CLASS_SKILL_CHOICE }
            }?.key
            SkillTile("Class skill", "skill", null, granted?.title ?: "None", chosen = true, enabled = false)
        }
    }

    val filled = freeSkillSlots.count { saved[it] != null }
    val freeChosen = freeSkillSlots.none(needsAttention) && filled == ModernCreation.FREE_SKILL_COUNT
    val open = ModernCreation.FREE_SKILL_COUNT - filled
    val freeTile = SkillTile("Free skills", "free", null,
        when {
            freeChosen -> "✓"
            open > 0 -> "$open LEFT"
            else -> ChoosePlaceholder
        }, freeChosen, enabled = true, hint = !freeChosen && open > 0)

    val themeOffer = offer(ModernCreation.THEME_SKILL_CHOICE)
    val themeTile = when {
        entry(EntryCategory.THEME) == null -> waiting("Theme skill", "Choose Theme first")
        themeOffer == null -> SkillTile("Theme skill", "skill", null, "None", chosen = true, enabled = false)
        themeOffer.skills.isEmpty() -> waiting("Theme skill", "Choose Trained skills first")
        else -> pick("Theme skill", themeOffer.slot)
    }
    return listOf(classTile, freeTile, themeTile)
}
