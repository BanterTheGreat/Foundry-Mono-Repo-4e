package dev.modern4e.builder

import org.robolectric.RuntimeEnvironment
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Checks the actual generated resource bundled with the app. */
@RunWith(RobolectricTestRunner::class)
class BuildInfoTest {
    @Test fun packagedTimestampHasDayMonthYearMinuteAndTimezone() {
        val context = RuntimeEnvironment.getApplication()
        val label = context.getString(R.string.app_build_time)
        assertTrue(label.startsWith("Built "))
        val built = ZonedDateTime.parse(label.removePrefix("Built "),
            DateTimeFormatter.ofPattern("d MMMM yyyy, HH:mm z", Locale.ENGLISH))
        assertFalse(built.toInstant().isAfter(java.time.Instant.now()))
        assertTrue(built.year >= 2026)
    }
}
