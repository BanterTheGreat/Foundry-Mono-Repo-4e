package dev.modern4e.builder

/** A source key is a named game element, not an occurrence or display label. */
@kotlinx.serialization.Serializable
data class ModifierContribution(
    val modifier: TypedModifier,
    val label: String,
    val sourceKey: String,
    val source: ChoiceSlotId? = null,
)

/** Includes suppressed contributions so explanations can account for every modifier. */
@kotlinx.serialization.Serializable
data class ModifierExplanation(val contribution: ModifierContribution, val applied: Boolean)

data class StatisticCalculation(
    val value: ContractResult<CalculatedValue>,
    val modifiers: List<ModifierExplanation>,
)

/**
 * Pure, order-independent integer calculation: SET base, stacked ADD, then MINIMUM floor.
 * Rules Compendium pp. 27–28/309/314 (glossary536, glossary549) and PHB3 p. 223
 * (glossary508): typed positives keep the greatest; untyped positives and penalties
 * stack across named elements, keeping respectively the greatest/least within one.
 */
object ModifierCalculator {
    fun calculate(
        base: ContractResult<CalculatedValue>,
        contributions: List<ModifierContribution>,
    ): StatisticCalculation {
        val indexed = contributions.withIndex().toList()
        val sets = indexed.filter { it.value.modifier.operation == ModifierOperation.SET }
        val explanations = mutableSetOf<Int>()
        val setValues = sets.map { it.value.modifier.value }.distinct()
        if (setValues.size > 1) {
            return StatisticCalculation(ContractResult.Unavailable(listOf(Diagnostic("engine.conflictingSet",
                DiagnosticKind.INCOMPLETE_AUTOMATION, "Conflicting SET values require an authored resolution."))),
                contributions.map { ModifierExplanation(it, false) })
        }
        // An unavailable dependency cannot be concealed by a manual or content SET.
        if (base is ContractResult.Unavailable && base.diagnostics.any { it.code != "engine.missingBase" }) {
            return StatisticCalculation(base, contributions.map { ModifierExplanation(it, false) })
        }
        var starting = (base as? ContractResult.Available)?.value
        if (sets.isNotEmpty()) {
            val selected = sets.first()
            explanations += selected.index
            starting = CalculatedValue(selected.value.modifier.value,
                listOf(Contributor(selected.value.label, selected.value.modifier.value, selected.value.source)))
        }
        if (starting == null) {
            return StatisticCalculation(base, contributions.map { ModifierExplanation(it, false) })
        }
        val applied = mutableListOf<ModifierContribution>()
        val adds = indexed.filter { it.value.modifier.operation == ModifierOperation.ADD }
        val groups = adds.groupBy {
            when {
                it.value.modifier.value < 0 -> "penalty:${it.value.sourceKey}"
                it.value.modifier.bonusType == BonusType.UNTYPED -> "untyped:${it.value.sourceKey}"
                else -> "typed:${it.value.modifier.bonusType}"
            }
        }
        for (group in groups.values) {
            val chosen = if (group.first().value.modifier.value < 0) {
                group.minBy { it.value.modifier.value }
            } else {
                group.maxBy { it.value.modifier.value }
            }
            applied += chosen.value
            explanations += chosen.index
        }
        var total = starting.total.toLong() + applied.sumOf { it.modifier.value.toLong() }
        val contributors = starting.contributors + applied.map { Contributor(it.label, it.modifier.value, it.source) }
        val floor = indexed.filter { it.value.modifier.operation == ModifierOperation.MINIMUM }.maxByOrNull { it.value.modifier.value }
        val breakdown = contributors.toMutableList()
        if (floor != null && total < floor.value.modifier.value) {
            val increase = floor.value.modifier.value.toLong() - total
            if (increase > Int.MAX_VALUE) {
                return overflow(contributions)
            }
            breakdown += Contributor(floor.value.label, increase.toInt(), floor.value.source)
            total = floor.value.modifier.value.toLong()
            explanations += floor.index
        }
        if (total !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) {
            return overflow(contributions)
        }
        return StatisticCalculation(ContractResult.Available(CalculatedValue(total.toInt(), breakdown),
            (base as? ContractResult.Available)?.diagnostics.orEmpty()),
            contributions.mapIndexed { index, value -> ModifierExplanation(value, index in explanations) })
    }

    private fun overflow(contributions: List<ModifierContribution>) = StatisticCalculation(
        ContractResult.Unavailable(listOf(Diagnostic("engine.overflow", DiagnosticKind.INCOMPLETE_AUTOMATION,
            "Statistic exceeds the supported integer range."))), contributions.map { ModifierExplanation(it, false) })
}
