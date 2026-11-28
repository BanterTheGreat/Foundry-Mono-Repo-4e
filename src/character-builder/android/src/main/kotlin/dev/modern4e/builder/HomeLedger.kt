package dev.modern4e.builder

/** What tapping a Home ledger row does. */
internal enum class HomeAction { Continue, Characters }

/**
 * One row of the Home ledger.
 *
 * @param numeral Roman position among the rows currently shown.
 * @param characterId the character a [HomeAction.Continue] row opens; null for every other row.
 */
internal data class HomeRow(
    val action: HomeAction,
    val numeral: String,
    val title: String,
    val detail: String,
    val characterId: String? = null,
)

private val Numerals = listOf("I", "II")

/**
 * Builds the Home ledger: Continue (only when a character is saved, opening the most recently saved one)
 * and Characters, numbered in the order shown.
 */
internal fun List<CharacterSummary>.homeRows(): List<HomeRow> {
    val latest = forLibrary("", LibrarySort.Recent).firstOrNull()
    val rows = listOfNotNull(
        latest?.let { Triple(HomeAction.Continue, "Continue", "${it.name} · ${it.levelDescription}") },
        Triple(HomeAction.Characters, "Characters", if (isEmpty()) "None yet" else "$size saved"),
    )
    return rows.mapIndexed { index, (action, title, detail) ->
        HomeRow(action, Numerals[index], title, detail, latest?.id.takeIf { action == HomeAction.Continue })
    }
}
