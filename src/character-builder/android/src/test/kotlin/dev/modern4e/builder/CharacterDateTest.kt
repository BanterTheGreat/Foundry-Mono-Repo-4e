package dev.modern4e.builder

import org.junit.Assert.assertEquals
import org.junit.Test

class CharacterDateTest {
    @Test fun formatsEuropeanDateWithoutTime() {
        assertEquals("17 November 2026", formatCharacterDate("2026-11-17T19:42:38.123456789Z"))
    }

    @Test fun preservesCalendarDateAtOffsetBoundary() {
        assertEquals("1 January 2026", formatCharacterDate("2026-01-01T00:15:00+14:00"))
        assertEquals("31 December 2026", formatCharacterDate("2026-12-31T23:55:00-12:00"))
    }

    @Test fun supportsSingleDigitDaysAndLeapDays() {
        assertEquals("3 April 2026", formatCharacterDate("2026-04-03T00:00:00Z"))
        assertEquals("29 February 2024", formatCharacterDate("2024-02-29T12:00:00Z"))
    }

    @Test fun invalidDatesNeverExposeRawInput() {
        assertEquals("Unknown date", formatCharacterDate(""))
        assertEquals("Unknown date", formatCharacterDate("invalid"))
    }
}
