package dev.modern4e.builder

import org.junit.Assert.assertEquals
import org.junit.Test

class LibraryListingTest {
    private fun hero(id: String, name: String, level: Int, savedAt: String, ancestry: String = "", characterClass: String = "") =
        CharacterSummary(id, name, savedAt, level, ancestry, characterClass)

    private val mara = hero("1", "Mara Vey", 5, "2026-11-20T21:10:00Z", "Dwarf", "Fighter")
    private val aldren = hero("2", "aldren Ash", 3, "2026-11-18T18:30:00Z", "Eladrin", "Wizard")
    private val sera = hero("3", "Sera Dawn", 1, "2026-11-12T09:00:00Z", "Human", "Cleric")
    private val brannoc = hero("4", "Brannoc", 5, "2026-08-01T10:00:00Z", "Half-Elf", "Fighter")
    private val all = listOf(sera, brannoc, mara, aldren)

    private fun ids(list: List<CharacterSummary>) = list.map { it.id }

    @Test
    fun recentOrdersNewestSaveFirst() {
        assertEquals(listOf("1", "2", "3", "4"), ids(all.forLibrary("", LibrarySort.Recent)))
    }

    @Test
    fun recentComparesInstantsAcrossOffsets() {
        val earlierInUtc = hero("a", "Early", 1, "2026-01-01T00:15:00+14:00")
        val laterInUtc = hero("b", "Late", 1, "2026-01-01T00:00:00Z")
        assertEquals(listOf("b", "a"), ids(listOf(earlierInUtc, laterInUtc).forLibrary("", LibrarySort.Recent)))
    }

    @Test
    fun unreadableSaveTimesSortLast() {
        val broken = hero("x", "Broken", 9, "not a date")
        assertEquals(listOf("1", "x"), ids(listOf(broken, mara).forLibrary("", LibrarySort.Recent)))
    }

    @Test
    fun nameSortIgnoresCaseAndBreaksTiesById() {
        val twin = hero("0", "mara vey", 2, "2026-01-01T00:00:00Z")
        assertEquals(listOf("2", "4", "0", "1", "3"), ids((all + twin).forLibrary("", LibrarySort.Name)))
    }

    @Test
    fun levelSortPutsHighestFirstAndBreaksTiesByName() {
        assertEquals(listOf("4", "1", "2", "3"), ids(all.forLibrary("", LibrarySort.Level)))
    }

    @Test
    fun searchMatchesNameAncestryAndClassCaseInsensitively() {
        assertEquals(listOf("1"), ids(all.forLibrary("MARA", LibrarySort.Recent)))
        assertEquals(listOf("2"), ids(all.forLibrary("eladrin", LibrarySort.Recent)))
        assertEquals(listOf("1", "4"), ids(all.forLibrary("fighter", LibrarySort.Recent)))
    }

    @Test
    fun searchIsTrimmedAndBlankKeepsEveryone() {
        assertEquals(listOf("1"), ids(all.forLibrary("  mara ", LibrarySort.Recent)))
        assertEquals(4, all.forLibrary("   ", LibrarySort.Recent).size)
    }

    @Test
    fun searchWithoutAMatchOrAnEmptyLibraryYieldsNothing() {
        assertEquals(emptyList<CharacterSummary>(), all.forLibrary("zzz", LibrarySort.Name))
        assertEquals(emptyList<CharacterSummary>(), emptyList<CharacterSummary>().forLibrary("", LibrarySort.Level))
    }

    @Test
    fun unchosenAncestryAndClassDoNotMatchBlankFields() {
        val bare = hero("9", "Bare", 1, "2026-01-01T00:00:00Z")
        assertEquals(emptyList<CharacterSummary>(), listOf(bare).forLibrary("fighter", LibrarySort.Recent))
        assertEquals(listOf("9"), ids(listOf(bare).forLibrary("bare", LibrarySort.Recent)))
    }

    @Test
    fun searchAndSortCompose() {
        assertEquals(listOf("4", "1"), ids(all.forLibrary("fighter", LibrarySort.Name)))
        assertEquals(listOf("4", "1"), ids(all.forLibrary("fighter", LibrarySort.Level)))
    }
}
