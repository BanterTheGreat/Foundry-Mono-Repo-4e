package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class ImportFailureTest {
    private fun diagnostic(code: String, kind: DiagnosticKind = DiagnosticKind.INCOMPATIBLE_FORMAT) = Diagnostic(code, kind, "message")

    @Test fun unreadableContentsGetTheGenericReason() {
        for (code in listOf("character.malformed", "character.type", "character.duplicateField", "character.unknownField")) {
            val failure = ImportFailure.from("a.txt", listOf(diagnostic(code)))!!
            assertTrue(code, failure.reason.startsWith("The file is not a Modern 4e character"))
        }
    }

    @Test fun aVersionMismatchSuggestsUpdatingTheApp() {
        val failure = ImportFailure.from("Mira.json", listOf(diagnostic("character.required"), diagnostic("character.format")))!!
        assertTrue(failure.reason.contains("update the app"))
    }

    @Test fun fileNameDropsItsFolderAndFallsBackWhenMissing() {
        val diagnostics = listOf(diagnostic("character.malformed"))
        assertEquals("notes.txt", ImportFailure.from("primary:Download/notes.txt", diagnostics)!!.fileName)
        assertEquals("notes.txt", ImportFailure.from("primary:notes.txt", diagnostics)!!.fileName)
        assertEquals("That file", ImportFailure.from(null, diagnostics)!!.fileName)
        assertEquals("That file", ImportFailure.from("  ", diagnostics)!!.fileName)
    }

    @Test fun anyOperationalDiagnosticKeepsTheBlockingFlow() {
        assertNull(ImportFailure.from("a.json", listOf(diagnostic("store.list", DiagnosticKind.IO_FAILURE))))
        assertNull(ImportFailure.from("a.json", listOf(diagnostic("character.format"), diagnostic("x", DiagnosticKind.UNRESOLVED_CONTENT))))
        assertNull(ImportFailure.from("a.json", emptyList()))
    }
}
