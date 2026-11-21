package dev.modern4e.builder

import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test

class RecoveryCopiesTest {
    private fun copy(id: String, date: String, character: String = "hero") =
        RecoverySummary(id, CharacterSummary(character, "Hero", date, 1))

    @Test fun dailyListUsesLatestStatePerCharacterAndDay() {
        val copies = listOf(
            copy("early", "2026-11-20T10:00:00Z"),
            copy("late", "2026-11-20T11:00:00Z"),
            copy("other", "2026-11-20T09:00:00Z", "other"),
            copy("yesterday", "2026-11-19T23:00:00Z"),
        )
        assertEquals(listOf("late", "other", "yesterday"), dailyRecoveryCopies(copies).map { it.recoveryId })
        assertEquals(copies.toSet(), retainedRecoveryCopies(copies, LocalDate.parse("2026-11-20")).toSet())
        assertEquals(setOf("late", "other", "yesterday"), retainedRecoveryCopies(copies, LocalDate.parse("2026-11-21")).map { it.recoveryId }.toSet())
    }

    @Test fun keepsTenEditingDaysDespiteGapsAndIndependentlyForEachCharacter() {
        val copies = (1..12).map { day -> copy("day-$day", "2026-10-${day.toString().padStart(2, '0')}T12:00:00Z") } +
            copy("other", "2020-01-01T12:00:00Z", "other")
        val retained = retainedRecoveryCopies(copies, LocalDate.parse("2026-11-20"))
        assertEquals(11, retained.size)
        assertFalse(retained.any { it.recoveryId in setOf("day-1", "day-2") })
        assertTrue(retained.any { it.recoveryId == "other" })
    }

    @Test fun comparesInstantsAndUsesDisplayedCalendarDay() {
        val copies = listOf(copy("whole", "2026-11-20T10:00:00Z"), copy("fraction", "2026-11-20T10:00:00.100Z"))
        assertEquals("fraction", dailyRecoveryCopies(copies).single().recoveryId)
        val midnight = copy("local-midnight", "2026-11-21T00:30:00+02:00")
        assertEquals(2, dailyRecoveryCopies(copies + midnight).size)
    }

    @Test fun groupsCopiesPerCharacterNewestFirstNamedAfterTheNewestCopy() {
        val copies = listOf(
            RecoverySummary("old", CharacterSummary("hero", "Old name", "2026-11-18T10:00:00Z", 1)),
            RecoverySummary("other", CharacterSummary("other", "Other", "2026-11-20T09:00:00Z", 3)),
            RecoverySummary("new", CharacterSummary("hero", "New name", "2026-11-19T10:00:00Z", 2)),
        )
        val groups = recoveryGroups(copies)
        assertEquals(listOf("other", "hero"), groups.map { it.characterId })
        assertEquals(listOf("Other", "New name"), groups.map { it.name })
        assertEquals(listOf("new", "old"), groups.last().copies.map { it.recoveryId })
        assertTrue(recoveryGroups(emptyList()).isEmpty())
    }

    @Test fun legacyUnknownDateRemainsRecoverable() {
        val unknown = copy("legacy", "unknown")
        assertEquals(listOf(unknown), retainedRecoveryCopies(listOf(unknown), LocalDate.now()))
        assertTrue(dailyRecoveryCopies(emptyList()).isEmpty())
    }
}
