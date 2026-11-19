package dev.modern4e.builder

import org.junit.Assert.assertEquals
import org.junit.Test

class EquipmentNavigationTest {
    @Test
    fun equipmentIsVisibleAndValidationRemainsTheLastPagerPage() {
        assertEquals(listOf("character", "progression", "stats", "equipment"), CharacterNavigationTabs)
        assertEquals(CharacterNavigationTabs + "validation", CharacterTabs)
    }
}
