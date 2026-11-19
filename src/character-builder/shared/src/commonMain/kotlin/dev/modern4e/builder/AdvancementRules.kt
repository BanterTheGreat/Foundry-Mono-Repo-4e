package dev.modern4e.builder

/** The local Modern 4e advancement table through level 19. */
object AdvancementRules {
    val featLevels = setOf(2, 4, 6, 8, 10, 11, 12, 14, 16, 17, 18)
    val nonMainLevels = setOf(4, 12)
    val dailyReplacementLevels = setOf(9, 15, 19)

    fun abilitySlot(level: Int) = ChoiceSlotId("advancement.$level", "ability", 0)

    fun rootCategory(level: Int, slot: ChoiceSlotId): EntryCategory? {
        if (slot.ordinal != 0) {
            return null
        }
        if (level in featLevels && slot == ChoiceSlotId("advancement.$level", "feat", 0)) {
            return EntryCategory.FEAT
        }
        if (level == 11 && slot == ChoiceSlotId("advancement.11", "paragon-path", 0)) {
            return EntryCategory.PARAGON_PATH
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

    /** Non-main increases are player choices; main and all-ability increases are automatic. */
    fun validAdvancement(level: Int, value: AbilityAdvancement, main: Ability): Boolean =
        level in nonMainLevels && value.slot == abilitySlot(level) &&
            value.increases.size == 1 && value.increases.values.single() == 1 && main !in value.increases
}
