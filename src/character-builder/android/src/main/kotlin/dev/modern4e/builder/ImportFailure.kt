package dev.modern4e.builder

/**
 * A chosen file that could not be imported because of what it contains, such as a text file or a character saved by a
 * different version. Nothing in the session is at risk, so it is shown in a dismissible dialog instead of the blocking error.
 *
 * @property fileName the chosen file's name without its folder, or a generic label when the picker gave none.
 * @property reason a plain-language explanation for the player; diagnostics and parser messages never reach it.
 */
data class ImportFailure(val fileName: String, val reason: String) {
    companion object {
        private const val FORMAT_REASON = "This character was saved in a format this version of the Builder cannot read. " +
            "If it came from a newer Builder, update the app and import it again."
        private const val UNREADABLE_REASON = "The file is not a Modern 4e character, or it is damaged. " +
            "Character files end in .json and come from Export in the Builder."

        /**
         * Classifies [diagnostics] from inspecting [fileName]. Returns null unless every diagnostic is an incompatible
         * format, so a storage or other operational fault keeps the blocking error flow.
         */
        fun from(fileName: String?, diagnostics: List<Diagnostic>): ImportFailure? {
            if (diagnostics.isEmpty() || diagnostics.any { it.kind != DiagnosticKind.INCOMPATIBLE_FORMAT }) {
                return null
            }
            val name = fileName.orEmpty().substringAfterLast('/').substringAfterLast(':').trim().ifEmpty { "That file" }
            val reason = if (diagnostics.any { it.code == "character.format" }) FORMAT_REASON else UNREADABLE_REASON
            return ImportFailure(name, reason)
        }
    }
}
