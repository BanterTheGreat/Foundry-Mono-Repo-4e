package dev.modern4e.builder

/** A rank a starting choice, feature or feat gives [skill], from the level it is acquired. */
data class SkillGrant(val skill: Skill, val rank: SkillRank, val level: Int)

/** One saved increase priced against the rank held on arrival. */
data class SkillPurchase(val skill: Skill, val from: SkillRank, val to: SkillRank, val cost: Int)

/** Why a milestone's saved increases are not legal. */
sealed class SkillIncreaseIssue {
    /** The skill already holds [held], so the increase buys nothing. */
    data class AlreadyHeld(val skill: Skill, val held: SkillRank) : SkillIncreaseIssue()
    /** The increases cost more than the milestone's pool. Their ranks still count, so later milestones keep their own picks. */
    data class OverBudget(val spent: Int, val pool: Int) : SkillIncreaseIssue()
    /** The rank is above the milestone's tier cap and is not applied. */
    data class AboveCap(val skill: Skill, val rank: SkillRank, val cap: SkillRank) : SkillIncreaseIssue()
    /** The skill is not part of the 2.0 list. */
    data class RemovedSkill(val skill: Skill) : SkillIncreaseIssue()
}

/**
 * One Skill Increase milestone: the ranks held on arrival and what its saved increases buy.
 *
 * @property entering ranks held on arrival, from grants acquired by this level and earlier milestones; absent skills are Untrained.
 */
data class SkillIncreaseStep(
    val level: Int,
    val pool: Int,
    val cap: SkillRank,
    val entering: Map<Skill, SkillRank>,
    val purchases: List<SkillPurchase>,
    val issues: List<SkillIncreaseIssue>,
) {
    val spent: Int get() = purchases.sumOf { it.cost }

    /** Points still unspent; negative when the saved increases cost more than the pool. */
    val left: Int get() = pool - spent

    fun rankBefore(skill: Skill): SkillRank = entering[skill] ?: SkillRank.UNTRAINED

    fun rankAfter(skill: Skill): SkillRank = maxOf(rankBefore(skill),
        purchases.filter { it.skill == skill }.maxOfOrNull { it.to } ?: SkillRank.UNTRAINED)

    /** Whether the points left can still raise some skill within the cap. */
    val canAfford: Boolean get() = Skill.catalog.any {
        val rank = rankAfter(it)
        rank < cap && SkillAdvancement.cost(rank, SkillRank.entries[rank.ordinal + 1]) <= left
    }

    /** Whether the player still has something to do here: fix an illegal increase or spend affordable points. */
    val needsAttention: Boolean get() = issues.isNotEmpty() || canAfford
}

/**
 * Spending of 2.0 Skill Points. Each milestone has its own pool; nothing carries over. A saved increase names the rank
 * it reaches, so its price follows from the rank held on arrival and changes when an earlier decision changes.
 */
object SkillAdvancement {
    const val CHOICE_ID = "skill-increase"

    /** The levels that grant a pool, in order. */
    val levels: List<Int> = AdvancementRules.schedule.filter { it.skillPoints != null }.map { it.level }

    /** The slot that identifies a milestone's increases in diagnostics and as the source of the training they give. */
    fun slot(level: Int) = ChoiceSlotId("advancement.$level", CHOICE_ID, 0)

    /** The milestone [slot] identifies, or null for any other slot. */
    fun levelOf(slot: ChoiceSlotId): Int? = levels.firstOrNull { slot(it) == slot }

    /** The price of raising a skill from [from] to [to]: 1, 2, 3, 5 and 8 for each promotion in rank order. */
    fun cost(from: SkillRank, to: SkillRank): Int =
        ((from.ordinal + 1)..to.ordinal).sumOf { promotionCosts[it - 1] }

    private val promotionCosts = listOf(1, 2, 3, 5, 8)

    /**
     * Price one milestone's [increases] against the ranks held on arrival.
     *
     * @param level a Skill Increase level.
     * @param entering the ranks held on arrival.
     */
    fun step(level: Int, entering: Map<Skill, SkillRank>, increases: List<SkillIncrease>): SkillIncreaseStep {
        val points = requireNotNull(AdvancementRules.level(level).skillPoints) { "Level $level grants no Skill Points." }
        val held = entering.toMutableMap()
        val purchases = mutableListOf<SkillPurchase>()
        val issues = mutableListOf<SkillIncreaseIssue>()
        for (increase in increases) {
            val skill = increase.skill.current
            if (skill == null) {
                issues += SkillIncreaseIssue.RemovedSkill(increase.skill)
                continue
            }
            val from = held[skill] ?: SkillRank.UNTRAINED
            if (increase.rank <= from) {
                issues += SkillIncreaseIssue.AlreadyHeld(skill, from)
                purchases += SkillPurchase(skill, from, increase.rank, 0)
            } else if (increase.rank > points.cap) {
                issues += SkillIncreaseIssue.AboveCap(skill, increase.rank, points.cap)
            } else {
                purchases += SkillPurchase(skill, from, increase.rank, cost(from, increase.rank))
                held[skill] = increase.rank
            }
        }
        val spent = purchases.sumOf { it.cost }
        if (spent > points.points) {
            issues += SkillIncreaseIssue.OverBudget(spent, points.points)
        }
        return SkillIncreaseStep(level, points.points, points.cap, entering, purchases, issues)
    }

    /**
     * Walk the milestones in order up to [through]. A grant acquired at a milestone's level counts before its increases.
     *
     * @param decisions the saved increases by milestone level.
     * @return one step per milestone reached, whether or not it has saved increases.
     */
    fun replay(grants: List<SkillGrant>, decisions: Map<Int, List<SkillIncrease>>,
        through: Int = AdvancementRules.schedule.size): List<SkillIncreaseStep> {
        val held = mutableMapOf<Skill, SkillRank>()
        return levels.filter { it <= through }.map { level ->
            for (grant in grants.filter { it.level <= level }) {
                held[grant.skill] = maxOf(grant.rank, held[grant.skill] ?: SkillRank.UNTRAINED)
            }
            val step = step(level, held.toMap(), decisions[level].orEmpty())
            for (purchase in step.purchases) {
                held[purchase.skill] = step.rankAfter(purchase.skill)
            }
            step
        }
    }
}

/** Every saved Skill Increase decision by level, including plans above the character's level. */
fun CharacterDocument.skillIncreaseDecisions(): Map<Int, List<SkillIncrease>> =
    levels.filter { it.skillIncreases.isNotEmpty() }.associate { it.level to it.skillIncreases }
