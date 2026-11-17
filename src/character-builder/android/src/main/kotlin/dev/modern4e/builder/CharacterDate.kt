package dev.modern4e.builder

import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

private val CharacterDateFormat = DateTimeFormatter.ofPattern("d MMMM uuuu", Locale.UK)

/** Show the save's calendar date in European order, without time or raw wire-format text. */
internal fun formatCharacterDate(savedAt: String): String = try {
    OffsetDateTime.parse(savedAt).format(CharacterDateFormat)
} catch (_: DateTimeParseException) {
    "Unknown date"
}
