package dev.modern4e.builder

import org.junit.Assert.assertEquals
import org.junit.Test

class CharacterNavigationTest {
    @Test
    fun characterSummaryOmitsUnchosenAncestryAndClass() {
        val bare = CharacterSummary("id", "Hero", "", 3)
        assertEquals("Level 3", bare.levelDescription)
        assertEquals("Level 3 Fighter", bare.copy(characterClass = "Fighter").levelDescription)
        assertEquals("Level 3 Dwarf", bare.copy(ancestry = "Dwarf").levelDescription)
    }

    @Test
    fun equipmentLivesInsideStatsAndValidationRemainsTheLastPagerPage() {
        assertEquals(listOf("character", "progression", "stats"), CharacterNavigationTabs)
        assertEquals(CharacterNavigationTabs + "validation", CharacterTabs)
    }
}
