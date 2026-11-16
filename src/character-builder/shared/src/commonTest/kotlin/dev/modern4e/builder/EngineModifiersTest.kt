package dev.modern4e.builder

import kotlin.test.*

class EngineModifiersTest {
    private val target = ModifierTarget(Statistic.WILL)
    private fun contribution(value: Int, type: BonusType = BonusType.UNTYPED, source: String = "source-$value", operation: ModifierOperation = ModifierOperation.ADD) =
        ModifierContribution(TypedModifier(target, operation, value, type), source, source)
    private fun calculate(vararg modifiers: ModifierContribution, base: Int = 10) =
        ModifierCalculator.calculate(ContractResult.Available(CalculatedValue(base, listOf(Contributor("Base", base)))), modifiers.toList())
    private fun total(value: StatisticCalculation) = assertIs<ContractResult.Available<CalculatedValue>>(value.value).value.total

    @Test
    fun typedBonusesKeepHighestAndDifferentTypesStack() {
        val result = calculate(contribution(2, BonusType.FEAT), contribution(4, BonusType.FEAT), contribution(3, BonusType.ITEM))
        assertEquals(17, total(result))
        assertEquals(listOf(false, true, true), result.modifiers.map { it.applied })
        val original = listOf(contribution(2, BonusType.FEAT), contribution(4, BonusType.FEAT), contribution(3, BonusType.ITEM))
        assertEquals(total(result), total(ModifierCalculator.calculate(ContractResult.Available(CalculatedValue(10, emptyList())), original.reversed())))
    }

    @Test
    fun untypedBonusesUseNamedElementRatherThanOccurrence() {
        val result = calculate(contribution(2, source = "feat.one"), contribution(4, source = "feat.one"), contribution(3, source = "feat.two"))
        assertEquals(17, total(result))
        assertEquals(listOf(false, true, true), result.modifiers.map { it.applied })
        val identical = contribution(2, source = "same")
        val duplicate = calculate(identical, identical)
        assertEquals(12, total(duplicate))
        assertEquals(1, duplicate.modifiers.count { it.applied })
    }

    @Test
    fun penaltiesStackAcrossElementsRegardlessOfNominalType() {
        val result = calculate(contribution(-2, BonusType.FEAT, "one"), contribution(-3, BonusType.POWER, "one"),
            contribution(-4, BonusType.FEAT, "two"), contribution(5, BonusType.FEAT, "one"))
        assertEquals(8, total(result))
        assertEquals(listOf(false, true, true, true), result.modifiers.map { it.applied })
    }

    @Test
    fun setThenAddThenMinimumIsIndependentOfInputOrderAndConflictsAreUnavailable() {
        val modifiers = listOf(contribution(20, operation = ModifierOperation.SET), contribution(-5), contribution(18, operation = ModifierOperation.MINIMUM))
        assertEquals(18, total(calculate(*modifiers.toTypedArray())))
        assertEquals(18, total(calculate(*modifiers.reversed().toTypedArray())))
        val result = calculate(contribution(20, operation = ModifierOperation.SET), contribution(21, operation = ModifierOperation.SET))
        assertIs<ContractResult.Unavailable>(result.value)
        assertEquals("engine.conflictingSet", (result.value as ContractResult.Unavailable).diagnostics.single().code)
        assertEquals(20, total(calculate(contribution(20, operation = ModifierOperation.SET), contribution(20, operation = ModifierOperation.SET))))
    }

    @Test
    fun addAndMinimumCannotInventBaseAndSetCannotConcealMissingDependency() {
        val unavailable = ContractResult.Unavailable(listOf(Diagnostic("engine.missingBase", DiagnosticKind.INCOMPLETE_AUTOMATION, "No authored base")))
        assertIs<ContractResult.Unavailable>(ModifierCalculator.calculate(unavailable, listOf(contribution(2))).value)
        assertIs<ContractResult.Unavailable>(ModifierCalculator.calculate(unavailable, listOf(contribution(20, operation = ModifierOperation.MINIMUM))).value)
        assertEquals(20, total(ModifierCalculator.calculate(unavailable, listOf(contribution(20, operation = ModifierOperation.SET)))))
        val missing = ContractResult.Unavailable(listOf(Diagnostic("missing", DiagnosticKind.UNRESOLVED_CONTENT, "Missing source")))
        assertIs<ContractResult.Unavailable>(ModifierCalculator.calculate(missing, listOf(contribution(20, operation = ModifierOperation.SET))).value)
    }

    @Test
    fun overflowIsUnavailableAndContributorTotalsExplainAppliedFloor() {
        val overflow = calculate(contribution(Int.MAX_VALUE), base = 10)
        assertIs<ContractResult.Unavailable>(overflow.value)
        val floored = calculate(contribution(-5), contribution(12, operation = ModifierOperation.MINIMUM))
        val value = assertIs<ContractResult.Available<CalculatedValue>>(floored.value).value
        assertEquals(12, value.total)
        assertEquals(value.total, value.contributors.sumOf { it.value })
    }
}
