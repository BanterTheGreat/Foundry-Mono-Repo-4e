package dev.modern4e.builder

import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/** How the character library orders its rows. */
internal enum class LibrarySort(val label: String) {
    Recent("Recent"),
    Name("A–Z"),
    Level("Level"),
}

/** Reads a save time for ordering; an unreadable one counts as the oldest. */
private fun savedInstant(savedAt: String): Instant = try {
    OffsetDateTime.parse(savedAt).toInstant()
} catch (_: DateTimeParseException) {
    Instant.MIN
}

/**
 * Filters the library by a search and orders what remains.
 *
 * @param query matched case-insensitively against name, ancestry and class; blank keeps every character.
 * @param sort Recent is newest save first, Name is A–Z and Level is highest first. Ties fall back to name, then id, so
 *   the order never shuffles between recompositions.
 */
internal fun List<CharacterSummary>.forLibrary(query: String, sort: LibrarySort): List<CharacterSummary> {
    val needle = query.trim()
    val byName = compareBy<CharacterSummary, String>(String.CASE_INSENSITIVE_ORDER) { it.name }.thenBy { it.id }
    val order = when (sort) {
        LibrarySort.Recent -> compareByDescending<CharacterSummary> { savedInstant(it.savedAt) }.then(byName)
        LibrarySort.Name -> byName
        LibrarySort.Level -> compareByDescending<CharacterSummary> { it.level }.then(byName)
    }
    return filter { needle.isEmpty() || listOf(it.name, it.ancestry, it.characterClass).any { field -> field.contains(needle, ignoreCase = true) } }
        .sortedWith(order)
}
