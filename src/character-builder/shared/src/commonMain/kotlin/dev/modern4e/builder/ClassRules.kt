package dev.modern4e.builder

import kotlinx.serialization.Serializable

/** Local class facts; no vanilla scores or class-name dispatch. */
@Serializable
data class ClassProfile(
    val role: String,
    val powerSources: List<String>,
    val mainAbilities: List<Ability>,
    val secondaryAbilities: List<Ability>,
    val proficiencies: Map<String, List<String>>,
    val statistics: Map<Statistic, ClassFormula>,
) {
    init {
        require(role in listOf("DEFENDER", "STRIKER", "LEADER", "CONTROLLER"))
        require(powerSources.isNotEmpty() && powerSources.distinct().size == powerSources.size)
        require(powerSources.all { it in listOf("ARCANE", "DIVINE", "MARTIAL", "PRIMAL", "PSIONIC", "SHADOW") })
        require(mainAbilities.isNotEmpty() && mainAbilities.distinct().size == mainAbilities.size)
        require(secondaryAbilities.distinct().size == secondaryAbilities.size)
        require(proficiencies.keys == setOf("armor", "shields", "weapons", "implements"))
        require(proficiencies.values.all { values -> values.distinct().size == values.size && values.none { it.isBlank() } })
        require(statistics.keys == setOf(Statistic.FORTITUDE, Statistic.REFLEX, Statistic.WILL, Statistic.HIT_POINTS, Statistic.HEALING_SURGES))
    }
}

/** Closed linear formula over character level and independently validated direct abilities. */
@Serializable
data class ClassFormula(val base: Int, val perLevel: Int = 0, val abilities: Map<Ability, Int> = emptyMap()) {
    init {
        require(base >= 0 && perLevel >= 0 && abilities.values.all { it >= 0 })
    }
}

/** Conditions describe attack context, never entry eligibility or unconditional totals. */
@Serializable
enum class CombatCondition { ONE_HANDED_WEAPON, TWO_HANDED_WEAPON }

@Serializable
data class ConditionalModifier(val condition: CombatCondition, val modifier: TypedModifier) {
    init {
        require(modifier.target == ModifierTarget(Statistic.ATTACK))
        require(modifier.operation == ModifierOperation.ADD && modifier.bonusType == BonusType.UNTYPED && modifier.value > 0)
    }
}

@Serializable
enum class WeaponGroup { AXE, FLAIL, HAMMER, HEAVY_BLADE, LIGHT_BLADE, MACE, PICK, POLEARM, SPEAR, STAFF }

@kotlinx.serialization.Serializable
data class ConditionalContribution(val instanceId: String, val source: ChoiceSlotId, val benefit: ConditionalModifier)

/** Shared tree traversal used by loading and independent prerequisite analysis. */
internal fun Prerequisite.leaves(): List<Prerequisite> = when (this) {
    is Prerequisite.AllOf -> conditions.flatMap { it.leaves() }
    is Prerequisite.AnyOf -> conditions.flatMap { it.leaves() }
    else -> listOf(this)
}
