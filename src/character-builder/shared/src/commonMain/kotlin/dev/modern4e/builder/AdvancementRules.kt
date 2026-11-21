package dev.modern4e.builder

/** The kind of power a level offers; the class's authored pools decide which powers fill it. */
enum class ScheduledPowerKind { AT_WILL, ENCOUNTER, DAILY, UTILITY }

/** One power a level offers. [source] is the class unless a paragon path or epic destiny supplies it. */
data class ScheduledPower(val kind: ScheduledPowerKind, val source: EntryCategory = EntryCategory.CLASS)

/** Which abilities an earned increase raises by 1: one chosen non-main ability, the main ability, or all six. */
enum class AbilityIncreaseKind { NON_MAIN, MAIN, ALL }

/** The usage of the earlier class attack power a progression replacement swaps. */
enum class ReplacementUsage { DAILY, ENCOUNTER }

/** Path or destiny features a level grants automatically; [several] marks a paragon path's starting features. */
data class ScheduledFeatures(val source: EntryCategory, val several: Boolean = false)

/**
 * What one character level opens in the local Modern 4e advancement schedule. Levels after
 * [AdvancementRules.LAST_ENFORCED_LEVEL] are [previewOnly]: shown for planning, never enforced, and the engine
 * offers no slots for them.
 */
data class AdvancementLevel(
    val level: Int,
    val powers: List<ScheduledPower> = emptyList(),
    val feat: Boolean = false,
    val abilityIncrease: AbilityIncreaseKind? = null,
    val replacement: ReplacementUsage? = null,
    /** The paragon path or epic destiny this level selects, if any. */
    val pathSelection: EntryCategory? = null,
    val features: ScheduledFeatures? = null,
    val previewOnly: Boolean = level > AdvancementRules.LAST_ENFORCED_LEVEL,
)

/** What a slot offer decides: an entry of one category, a non-main ability increase, or a progression power replacement. */
sealed class SlotCategory {
    data class Entry(val category: EntryCategory) : SlotCategory()
    data object AbilityIncrease : SlotCategory()
    data class Replacement(val usage: ReplacementUsage) : SlotCategory()
}

/** A slot the advancement schedule opens at [level], rather than one an entry opens. */
data class RootSlot(val slot: ChoiceSlotId, val level: Int, val category: SlotCategory)

/**
 * The one local Modern 4e advancement schedule for levels 1-30, and the root slots it opens. Rules, editors and
 * screens read levels, root slot identities and categories from here; only enforced levels open root slots.
 */
object AdvancementRules {
    /** The last level whose schedule the engine enforces; later levels are preview only. */
    const val LAST_ENFORCED_LEVEL = 20

    private val path = EntryCategory.PARAGON_PATH
    private val destiny = EntryCategory.EPIC_DESTINY
    private fun power(kind: ScheduledPowerKind, source: EntryCategory = EntryCategory.CLASS) = ScheduledPower(kind, source)
    private val atWill = power(ScheduledPowerKind.AT_WILL)
    private val encounter = power(ScheduledPowerKind.ENCOUNTER)
    private val daily = power(ScheduledPowerKind.DAILY)
    private val utility = power(ScheduledPowerKind.UTILITY)

    /** Levels 1-30 in order; `schedule[n - 1]` is level n. */
    val schedule: List<AdvancementLevel> = listOf(
        AdvancementLevel(1, listOf(atWill, atWill, encounter, daily, daily), feat = true),
        AdvancementLevel(2, listOf(utility), feat = true),
        AdvancementLevel(3, listOf(encounter)),
        AdvancementLevel(4, feat = true, abilityIncrease = AbilityIncreaseKind.NON_MAIN),
        AdvancementLevel(5, listOf(daily)),
        AdvancementLevel(6, listOf(utility), feat = true),
        AdvancementLevel(7, listOf(encounter)),
        AdvancementLevel(8, feat = true, abilityIncrease = AbilityIncreaseKind.MAIN),
        AdvancementLevel(9, replacement = ReplacementUsage.DAILY),
        AdvancementLevel(10, listOf(utility), feat = true),
        AdvancementLevel(11, listOf(power(ScheduledPowerKind.ENCOUNTER, path)), feat = true, pathSelection = path,
            features = ScheduledFeatures(path, several = true)),
        AdvancementLevel(12, listOf(power(ScheduledPowerKind.UTILITY, path)), feat = true,
            abilityIncrease = AbilityIncreaseKind.NON_MAIN),
        AdvancementLevel(13, listOf(encounter)),
        AdvancementLevel(14, feat = true),
        AdvancementLevel(15, replacement = ReplacementUsage.DAILY),
        AdvancementLevel(16, feat = true, abilityIncrease = AbilityIncreaseKind.ALL, features = ScheduledFeatures(path)),
        AdvancementLevel(17, listOf(utility, encounter), feat = true),
        AdvancementLevel(18, feat = true),
        AdvancementLevel(19, replacement = ReplacementUsage.DAILY),
        AdvancementLevel(20, listOf(power(ScheduledPowerKind.DAILY, path)), feat = true, abilityIncrease = AbilityIncreaseKind.MAIN),
        AdvancementLevel(21, feat = true, pathSelection = destiny, features = ScheduledFeatures(destiny)),
        AdvancementLevel(22, listOf(utility), feat = true),
        AdvancementLevel(23, replacement = ReplacementUsage.ENCOUNTER),
        AdvancementLevel(24, feat = true, abilityIncrease = AbilityIncreaseKind.NON_MAIN, features = ScheduledFeatures(destiny)),
        AdvancementLevel(25, replacement = ReplacementUsage.DAILY),
        AdvancementLevel(26, listOf(power(ScheduledPowerKind.UTILITY, destiny)), feat = true),
        AdvancementLevel(27, listOf(encounter)),
        AdvancementLevel(28, feat = true, abilityIncrease = AbilityIncreaseKind.MAIN),
        AdvancementLevel(29, replacement = ReplacementUsage.DAILY),
        AdvancementLevel(30, feat = true, features = ScheduledFeatures(destiny)),
    )

    /** The levels the engine enforces, 1 through [LAST_ENFORCED_LEVEL]. */
    val enforced: List<AdvancementLevel> = schedule.filterNot { it.previewOnly }

    /** The schedule row for level [n], 1-30. */
    fun level(n: Int): AdvancementLevel {
        require(n in 1..schedule.size)
        return schedule[n - 1]
    }

    private fun enforcedLevel(level: Int): AdvancementLevel? = enforced.getOrNull(level - 1)

    fun abilitySlot(level: Int) = ChoiceSlotId("advancement.$level", "ability", 0)

    /** Creation roots live at level 1; later roots are scoped to their advancement level. */
    private fun entrySlot(level: Int, category: EntryCategory): ChoiceSlotId = when {
        level == 1 -> ChoiceSlotId("creation", category.name.lowercase(), 0)
        category == EntryCategory.PARAGON_PATH -> ChoiceSlotId("advancement.$level", "paragon-path", 0)
        else -> ChoiceSlotId("advancement.$level", category.name.lowercase(), 0)
    }

    /** Root slots of every enforced level, in schedule order: creation entries, then each level's own slots. */
    private val roots: Map<Int, List<RootSlot>> = enforced.associate { row ->
        val level = row.level
        val slots = buildList {
            if (level == 1) {
                for (category in listOf(EntryCategory.CLASS, EntryCategory.ANCESTRY, EntryCategory.THEME)) {
                    add(RootSlot(entrySlot(1, category), 1, SlotCategory.Entry(category)))
                }
            }
            if (row.abilityIncrease == AbilityIncreaseKind.NON_MAIN) {
                add(RootSlot(abilitySlot(level), level, SlotCategory.AbilityIncrease))
            }
            if (row.feat) {
                add(RootSlot(entrySlot(level, EntryCategory.FEAT), level, SlotCategory.Entry(EntryCategory.FEAT)))
            }
            row.pathSelection?.let { add(RootSlot(entrySlot(level, it), level, SlotCategory.Entry(it))) }
            row.replacement?.let {
                add(RootSlot(ChoiceSlotId("advancement.$level", "replacement", 0), level, SlotCategory.Replacement(it)))
            }
        }
        level to slots
    }
    private val rootsBySlot: Map<ChoiceSlotId, RootSlot> = roots.values.flatten().associateBy { it.slot }

    /** The root slots level [level] opens; preview-only levels open none. */
    fun rootSlots(level: Int): List<RootSlot> = roots[level].orEmpty()

    /** The root slot of [category] that level [level] opens, if any. */
    fun rootSlot(level: Int, category: SlotCategory): ChoiceSlotId? = rootSlots(level).firstOrNull { it.category == category }?.slot

    /** The root slot of entry [category] that level [level] opens, if any. */
    fun rootSlot(level: Int, category: EntryCategory): ChoiceSlotId? = rootSlot(level, SlotCategory.Entry(category))

    /** The saved class selection's slot, read by document helpers without evaluating rules. */
    val classSlot: ChoiceSlotId = entrySlot(1, EntryCategory.CLASS)

    /** The saved ancestry selection's slot, read by document helpers without evaluating rules. */
    val ancestrySlot: ChoiceSlotId = entrySlot(1, EntryCategory.ANCESTRY)

    /** The entry category a root [slot] decided at [level] must hold, or null when it is not that level's entry root. */
    fun rootCategory(level: Int, slot: ChoiceSlotId): EntryCategory? =
        rootsBySlot[slot]?.takeIf { it.level == level }?.let { (it.category as? SlotCategory.Entry)?.category }

    /** Whether level [level] lets the player choose one non-main ability to increase. */
    fun choosesNonMainIncrease(level: Int): Boolean = enforcedLevel(level)?.abilityIncrease == AbilityIncreaseKind.NON_MAIN

    /** Whether level [level] replaces one earlier class daily attack power. */
    fun replacesDailyAttack(level: Int): Boolean = enforcedLevel(level)?.replacement == ReplacementUsage.DAILY

    /** Automatic increases earned by [level]: how many main-ability and all-ability increases have arrived. */
    fun automaticIncreases(level: Int, kind: AbilityIncreaseKind): Int =
        enforced.count { it.level <= level && it.abilityIncrease == kind }

    /** Non-main increases are player choices; main and all-ability increases are automatic. */
    fun validAdvancement(level: Int, value: AbilityAdvancement, main: Ability): Boolean =
        choosesNonMainIncrease(level) && value.slot == abilitySlot(level) &&
            value.increases.size == 1 && value.increases.values.single() == 1 && main !in value.increases
}
