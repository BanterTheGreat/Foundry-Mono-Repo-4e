package dev.modern4e.builder

import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.Instant

/** Latest saved state for each character on each of its ten most recent editing days. */
internal fun dailyRecoveryCopies(copies: List<RecoverySummary>): List<RecoverySummary> =
    copies.groupBy { it.character.id }.values.flatMap { characterCopies ->
        characterCopies.groupBy { recoveryDay(it) }.values
            .map { day -> day.maxBy { recoveryInstant(it) } }
            .sortedByDescending { recoveryInstant(it) }.take(10)
    }.sortedByDescending { recoveryInstant(it) }

/** Preserve today's intermediate states; completed editing days need only their latest state. */
internal fun retainedRecoveryCopies(copies: List<RecoverySummary>, today: LocalDate): List<RecoverySummary> {
    val daily = dailyRecoveryCopies(copies)
    val days = daily.map { it.character.id to recoveryDay(it) }.toSet()
    val latest = daily.map { it.recoveryId }.toSet()
    return copies.filter {
        (it.character.id to recoveryDay(it)) in days &&
            (recoveryDay(it) == today.toString() || it.recoveryId in latest)
    }
}

/** Use the same calendar date shown beside the copy; unknown legacy dates remain recoverable. */
private fun recoveryDay(copy: RecoverySummary): String = try {
    OffsetDateTime.parse(copy.character.savedAt).toLocalDate().toString()
} catch (_: java.time.format.DateTimeParseException) {
    copy.character.savedAt
}

private fun recoveryInstant(copy: RecoverySummary): Instant = try {
    OffsetDateTime.parse(copy.character.savedAt).toInstant()
} catch (_: java.time.format.DateTimeParseException) {
    Instant.MIN
}
