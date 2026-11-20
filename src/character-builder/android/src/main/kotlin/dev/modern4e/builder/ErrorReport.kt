package dev.modern4e.builder

/** Most characters of a report the share sheet is asked to carry; intent extras cross a size-limited binder call. */
internal const val MAX_REPORT_CHARS = 100_000

/**
 * The text a player sends to Banter when the builder hits a blocking error.
 *
 * @param environment one line naming the app build and the device, from [AndroidErrorReportSharer.environment].
 * @param diagnostics the session's blocking errors.
 * @param trace the stack trace behind them, or null when the failure was a diagnostic rather than an exception.
 * @return the report, cut at [MAX_REPORT_CHARS] with a marker when it is longer.
 */
internal fun errorReportText(environment: String, diagnostics: List<Diagnostic>, trace: String?): String {
    val report = buildString {
        appendLine("Modern 4e Character Builder error report")
        appendLine("Send this to Banter.")
        appendLine(environment)
        appendLine()
        appendLine("Diagnostics:")
        if (diagnostics.isEmpty()) {
            appendLine("- none")
        }
        diagnostics.forEach { appendLine("- ${it.code} (${it.kind}): ${it.message}") }
        appendLine()
        appendLine("Exception:")
        append(trace?.trimEnd() ?: "No exception was thrown; the diagnostics above are the whole report.")
    }
    return if (report.length > MAX_REPORT_CHARS) report.take(MAX_REPORT_CHARS) + "\n[Report truncated]" else report
}
