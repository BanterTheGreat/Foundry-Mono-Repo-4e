package dev.modern4e.builder

/** The skill groups of the 2.0 list, in printed order; the matrix separates them with a rule. */
internal val SkillGroups: List<List<Skill>> = listOf(
    listOf(Skill.ATHLETICS, Skill.ACROBATICS, Skill.ENDURANCE),
    listOf(Skill.STEALTH, Skill.FINESSE),
    listOf(Skill.ARCANA, Skill.OCCULTISM, Skill.CRAFTING, Skill.MEDICINE, Skill.NATURE, Skill.CULTURE, Skill.RELIGION),
    listOf(Skill.INSIGHT, Skill.STREETWISE, Skill.DECEPTION, Skill.COMMAND),
)

/** The ranks that have a matrix column. */
internal val SkillMatrixRanks: List<SkillRank> = SkillRank.entries.filter { it != SkillRank.UNTRAINED }

/** What one skill-and-rank cell stands for at the edited milestone. */
internal enum class SkillCellKind {
    /** Held before this milestone. */
    HELD,
    /** Bought here, below the rank the purchase reaches. */
    BOUGHT,
    /** The rank this milestone's purchase reaches. */
    REACHED,
    /** A saved increase the character already has, which only needs removing. */
    STALE,
    /** Affordable now. */
    BUY,
    /** Not affordable here, but a later milestone already plans it. */
    PLANNED,
    /** Above this tier's cap. */
    LOCKED,
    /** Within the cap but costs more than the points left. */
    UNAFFORDABLE,
}

/**
 * @property price the points to reach this rank from the row's current rank, for [SkillCellKind.BUY] and
 *   [SkillCellKind.UNAFFORDABLE].
 * @property plannedLevel the later milestone that plans this rank.
 * @property locked whether the rank is above the cap, which a planned cell can also be.
 */
internal data class SkillCell(
    val skill: Skill,
    val rank: SkillRank,
    val kind: SkillCellKind,
    val price: Int = 0,
    val plannedLevel: Int? = null,
    val locked: Boolean = false,
)

/** One skill's cells, with the rank held after this milestone's draft. */
internal data class SkillMatrixRow(val skill: Skill, val rank: SkillRank, val bought: Boolean, val cells: List<SkillCell>)

/**
 * One milestone's editor: [step] prices the draft, and [steps] replays every milestone with that draft in place.
 */
internal data class SkillMatrix(
    val step: SkillIncreaseStep,
    val steps: List<SkillIncreaseStep>,
    val rows: List<SkillMatrixRow>,
)

/** The saved increases of the milestone at [level], whether or not the character has reached it. */
internal fun CharacterDocument.skillIncreasesAt(level: Int): List<SkillIncrease> =
    skillIncreaseDecisions()[level].orEmpty()

/**
 * The grants to price milestones with. [state] is exact up to its own level; a longer [preview], which can be one edit
 * behind, only adds the grants above it.
 */
internal fun skillGrantsFor(state: BuilderState, preview: BuilderState?): List<SkillGrant> = state.rules.skillGrants +
    preview?.rules?.skillGrants.orEmpty().filter { it.level > state.document.level }

/** Every milestone replayed from the saved decisions, with [draft] replacing the one at [level]. */
internal fun skillSteps(grants: List<SkillGrant>, document: CharacterDocument, level: Int? = null,
    draft: List<SkillIncrease> = emptyList()): List<SkillIncreaseStep> {
    val saved = document.skillIncreaseDecisions()
    return SkillAdvancement.replay(grants, if (level == null) saved else saved + (level to draft))
}

/** Lay out the editor for the milestone at [level] with its unsaved [draft]. */
internal fun skillMatrix(grants: List<SkillGrant>, document: CharacterDocument, level: Int,
    draft: List<SkillIncrease>): SkillMatrix {
    val steps = skillSteps(grants, document, level, draft)
    val step = steps.single { it.level == level }
    val later = steps.filter { it.level > level }
    val rows = SkillGroups.flatten().map { skill ->
        val before = step.rankBefore(skill)
        val after = step.rankAfter(skill)
        val stale = draft.firstOrNull { it.skill.current == skill && it.rank <= before }?.rank
        val cells = SkillMatrixRanks.map { rank ->
            val locked = rank > step.cap
            val price = if (rank > after) SkillAdvancement.cost(after, rank) else 0
            val planned = later.firstOrNull { other ->
                other.purchases.any { it.skill == skill && it.cost > 0 && it.to >= rank }
            }?.level
            when {
                rank == stale -> SkillCell(skill, rank, SkillCellKind.STALE)
                rank <= before -> SkillCell(skill, rank, SkillCellKind.HELD)
                rank < after -> SkillCell(skill, rank, SkillCellKind.BOUGHT)
                rank == after -> SkillCell(skill, rank, SkillCellKind.REACHED)
                !locked && price <= step.left -> SkillCell(skill, rank, SkillCellKind.BUY, price)
                planned != null -> SkillCell(skill, rank, SkillCellKind.PLANNED, plannedLevel = planned, locked = locked)
                locked -> SkillCell(skill, rank, SkillCellKind.LOCKED, locked = true)
                else -> SkillCell(skill, rank, SkillCellKind.UNAFFORDABLE, price)
            }
        }
        SkillMatrixRow(skill, after, after > before, cells)
    }
    return SkillMatrix(step, steps, rows)
}

/**
 * The draft after pressing [cell]: an affordable rank buys straight up to it, the reached rank removes the skill's
 * purchase, a rank inside the purchase shortens it and a stale increase is removed.
 *
 * @return the new draft, or null when the cell only explains itself.
 */
internal fun pressSkillCell(draft: List<SkillIncrease>, cell: SkillCell): List<SkillIncrease>? {
    val others = draft.filter { it.skill.current != cell.skill }
    return when (cell.kind) {
        SkillCellKind.REACHED, SkillCellKind.STALE -> others
        SkillCellKind.BUY, SkillCellKind.BOUGHT -> {
            val next = SkillIncrease(cell.skill, cell.rank)
            if (others.size == draft.size) {
                draft + next
            } else {
                draft.map { if (it.skill.current == cell.skill) next else it }
            }
        }
        else -> null
    }
}

/** The level at which a rank above [cap] opens. */
private fun capOpensAt(rank: SkillRank): Int =
    AdvancementRules.schedule.first { row -> row.skillPoints?.let { it.cap >= rank } == true }.level

/** The column heading's note for a rank this milestone cannot reach, or null. */
internal fun SkillIncreaseStep.lockedLabel(rank: SkillRank): String? = if (rank > cap) "Lv ${capOpensAt(rank)}" else null

private fun points(count: Int): String = if (count == 1) "1 point" else "$count points"

/** Why pressing [cell] changes nothing, naming the level responsible where there is one. */
internal fun SkillMatrix.explain(cell: SkillCell): String {
    val skill = cell.skill.title
    return when (cell.kind) {
        SkillCellKind.HELD -> {
            val reached = steps.firstOrNull { it.level < step.level && it.rankAfter(cell.skill) >= cell.rank &&
                it.rankBefore(cell.skill) < cell.rank }
            if (reached != null) {
                "$skill reached ${cell.rank.title} at level ${reached.level}."
            } else {
                "$skill is already ${step.rankBefore(cell.skill).title} before this increase."
            }
        }
        SkillCellKind.PLANNED -> "You planned $skill to ${cell.rank.title} at level ${cell.plannedLevel}."
        SkillCellKind.LOCKED -> "${cell.rank.title} opens at level ${capOpensAt(cell.rank)}."
        else -> "$skill to ${cell.rank.title} costs ${points(cell.price)}. You have ${maxOf(0, step.left)} left."
    }
}

/** Why a milestone's saved increases are not legal, as one line, or null when they are. */
internal fun SkillIncreaseStep.problem(): String? = when (val issue = issues.firstOrNull()) {
    null -> null
    is SkillIncreaseIssue.AlreadyHeld ->
        "${issue.skill.title} is already ${issue.held.title}. Remove this increase."
    is SkillIncreaseIssue.OverBudget -> "${issue.spent - issue.pool} over budget: " +
        purchases.filter { it.cost > 0 }.joinToString { "${it.skill.title} costs ${it.cost}" } + "."
    is SkillIncreaseIssue.AboveCap -> "${issue.skill.title} cannot reach ${issue.rank.title} before level " +
        "${capOpensAt(issue.rank)}."
    is SkillIncreaseIssue.RemovedSkill -> "${issue.skill.title} is not a 2.0 skill."
}

/** The line under the matrix when no cell is being explained. [error] marks a problem the player should fix. */
internal data class SkillNote(val text: String, val error: Boolean = false)

/**
 * The most urgent thing to know about the draft: its own problem, then a later milestone it would newly break, then
 * how to use the matrix.
 *
 * @param saved the milestones replayed from the saved decisions alone.
 */
internal fun SkillMatrix.note(saved: List<SkillIncreaseStep>): SkillNote {
    step.problem()?.let { return SkillNote(it, error = true) }
    val broken = steps.firstOrNull { later ->
        later.level > step.level && later.issues.isNotEmpty() && saved.none { it.level == later.level && it.issues.isNotEmpty() }
    }
    if (broken != null) {
        return SkillNote("Saving breaks level ${broken.level}: ${broken.problem()}", error = true)
    }
    return SkillNote(when {
        step.purchases.isEmpty() -> "Press the rank you want a skill to reach. The box shows what it costs."
        step.left > 0 -> "Unspent points expire when you advance. Press a ✓ again to undo it."
        else -> "All points spent. Press a ✓ again to undo it."
    })
}

/** The matrix header: the milestone's tier and cap, and its pool in points. */
internal fun SkillIncreaseStep.tally(planned: Boolean): PickTally {
    val tier = when {
        level < 11 -> "Heroic"
        level < 21 -> "Paragon"
        else -> "Epic"
    }
    return PickTally("Level $level skill points", "$tier · up to ${cap.title}${if (planned) " · planned" else ""}",
        total = pool, used = spent)
}

/** The right-hand summary of a Levels card with saved increases. */
internal fun SkillIncreaseStep.spendingSummary(): String = when {
    issues.isNotEmpty() -> "$spent of $pool spent"
    left == 0 -> "$spent of $pool points spent"
    !canAfford -> "$spent of $pool spent · $left cannot be used"
    else -> "$spent of $pool spent · $left left"
}
