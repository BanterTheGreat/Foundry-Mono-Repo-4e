package dev.modern4e.builder

import android.app.Activity
import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** The text sent to Banter and the share sheet it travels through. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ErrorReportTest {
    private val environment = "App 0.1.0 · Built 1 January 2026 · Pixel 8 · Android 14"
    private val diagnostic = Diagnostic("android.workflow", DiagnosticKind.IO_FAILURE, "Disk full")

    @Test fun reportNamesTheRecipientEnvironmentDiagnosticsAndTrace() {
        val report = errorReportText(environment, listOf(diagnostic), "java.io.IOException: Disk full\n\tat Store.save(Store.kt:9)\n")
        assertTrue(report.startsWith("Modern 4e Character Builder error report\nSend this to Banter.\n$environment\n"))
        assertTrue(report.contains("- android.workflow (IO_FAILURE): Disk full"))
        assertTrue(report.endsWith("Exception:\njava.io.IOException: Disk full\n\tat Store.save(Store.kt:9)"))
    }

    @Test fun reportListsEveryDiagnosticAndSaysSoWhenNoExceptionWasThrown() {
        val second = Diagnostic("content.missing", DiagnosticKind.UNRESOLVED_CONTENT, "Class fighter is unavailable.")
        val report = errorReportText(environment, listOf(diagnostic, second), null)
        assertTrue(report.contains("- android.workflow (IO_FAILURE): Disk full\n- content.missing (UNRESOLVED_CONTENT): Class fighter is unavailable."))
        assertTrue(report.endsWith("No exception was thrown; the diagnostics above are the whole report."))
    }

    @Test fun reportWithoutDiagnosticsStillReadsAsAReport() {
        assertTrue(errorReportText(environment, emptyList(), "trace").contains("Diagnostics:\n- none\n"))
    }

    @Test fun anOverlongReportIsCutAndMarkedSoTheShareIntentStaysSmall() {
        val report = errorReportText(environment, listOf(diagnostic), "x".repeat(MAX_REPORT_CHARS * 2))
        assertTrue(report.endsWith("\n[Report truncated]"))
        assertEquals(MAX_REPORT_CHARS + "\n[Report truncated]".length, report.length)
        assertFalse(errorReportText(environment, listOf(diagnostic), "x".repeat(1000)).contains("truncated"))
    }

    @Test fun sharingOpensAChooserForPlainTextWithTheWholeReport() {
        val shared = mutableListOf<Intent>()
        AndroidErrorReportSharer(RuntimeEnvironment.getApplication(), { shared += it }).share("the report")
        val chooser = shared.single()
        assertEquals(Intent.ACTION_CHOOSER, chooser.action)
        assertEquals("Send this to Banter", chooser.getCharSequenceExtra(Intent.EXTRA_TITLE).toString())
        assertTrue(chooser.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        @Suppress("DEPRECATION")
        val send = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertEquals(Intent.ACTION_SEND, send.action)
        assertEquals("text/plain", send.type)
        assertEquals("the report", send.getStringExtra(Intent.EXTRA_TEXT))
        assertEquals("Modern 4e Character Builder error report", send.getStringExtra(Intent.EXTRA_SUBJECT))
    }

    @Test fun sharingFromAnActivityDoesNotForceANewTask() {
        val activity = Robolectric.buildActivity(Activity::class.java).create().get()
        val shared = mutableListOf<Intent>()
        AndroidErrorReportSharer(activity, { shared += it }).share("the report")
        assertEquals(0, shared.single().flags and Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    @Test fun environmentNamesTheBuildAndTheDevice() {
        val line = AndroidErrorReportSharer(RuntimeEnvironment.getApplication(), { }).environment
        assertTrue(line.startsWith("App "))
        assertTrue(line.contains("Built "))
        assertTrue(line.contains("Android "))
        assertFalse(line.contains("\n"))
    }
}
