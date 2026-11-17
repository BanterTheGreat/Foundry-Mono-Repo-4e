package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class ProgressionTest {
    @Test fun scheduleMatchesPrintedMilestones() {
        assertEquals(mapOf("At-will" to 2, "Encounter" to 1, "Daily" to 2), Progression.tally(1))
        assertEquals(mapOf("At-will" to 2, "Encounter" to 6, "Daily" to 4, "Utility" to 5), Progression.tally(20))
        assertEquals(mapOf("At-will" to 2, "Encounter" to 7, "Daily" to 4, "Utility" to 7), Progression.tally(30))
        assertEquals(19, (1..30).count { Progression.level(it).feat })
        assertEquals(listOf(9, 15, 19, 23, 25, 29), (1..30).filter { Progression.level(it).replacement != null })
    }

    @Test fun allocationRequiresBudgetAndSingleTradeoff() {
        val base = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.WISDOM to 1))
        assertTrue(Progression.validAllocation(base))
        assertTrue(Progression.validAllocation(base.copy(points = base.points + (Ability.CHARISMA to -1) + (Ability.DEXTERITY to 3))))
        assertFalse(Progression.validAllocation(base.copy(points = base.points + (Ability.DEXTERITY to 3))))
        assertFalse(Progression.validAllocation(base.copy(points = base.points + (Ability.STRENGTH to 3))))
    }
}
