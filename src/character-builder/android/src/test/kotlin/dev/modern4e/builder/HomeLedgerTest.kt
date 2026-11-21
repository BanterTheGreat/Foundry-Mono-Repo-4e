package dev.modern4e.builder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeLedgerTest {
    private fun hero(id: String, name: String, level: Int, savedAt: String, ancestry: String = "", characterClass: String = "") =
        CharacterSummary(id, name, savedAt, level, ancestry, characterClass)

    private val mara = hero("1", "Mara Vey", 5, "2026-11-20T21:10:00Z", "Dwarf", "Fighter")
    private val sera = hero("3", "Sera Dawn", 1, "2026-11-12T09:00:00Z")

    @Test
    fun emptyLibraryOmitsContinueAndRenumbers() {
        val rows = emptyList<CharacterSummary>().homeRows()
        assertEquals(listOf(HomeAction.Characters, HomeAction.New, HomeAction.Import), rows.map { it.action })
        assertEquals(listOf("I", "II", "III"), rows.map { it.numeral })
        assertEquals("None yet", rows.first().detail)
    }

    @Test
    fun continueOpensTheMostRecentlySavedCharacter() {
        val rows = listOf(sera, mara).homeRows()
        val cont = rows.first()
        assertEquals(HomeAction.Continue, cont.action)
        assertEquals("1", cont.characterId)
        assertEquals("Mara Vey · Level 5 Dwarf Fighter", cont.detail)
        assertEquals(listOf("I", "II", "III", "IV"), rows.map { it.numeral })
    }

    @Test
    fun charactersRowCountsEveryCharacter() {
        assertEquals("2 saved", listOf(sera, mara).homeRows()[1].detail)
    }

    @Test
    fun onlyContinueCarriesACharacterId() {
        assertEquals(listOf("1", null, null, null), listOf(mara).homeRows().map { it.characterId })
        assertNull(emptyList<CharacterSummary>().homeRows().firstNotNullOfOrNull { it.characterId })
    }

    @Test
    fun continueDetailOmitsUnchosenAncestryAndClass() {
        assertEquals("Sera Dawn · Level 1", listOf(sera).homeRows().first().detail)
    }
}
