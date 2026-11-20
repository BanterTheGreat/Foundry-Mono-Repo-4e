package dev.modern4e.builder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Offers an error report to the Android share sheet as plain text.
 *
 * @param context used to describe the build and, when it is not an activity, to start the chooser in a new task.
 * @param startChooser receives the finished chooser intent; defaults to starting it from [context].
 */
class AndroidErrorReportSharer(
    private val context: Context,
    private val startChooser: (Intent) -> Unit = { context.startActivity(it) },
) {
    /** One line naming the app version, build time and device, so a report says what produced it. */
    val environment: String by lazy {
        val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "unknown"
        "App $version · ${context.getString(R.string.app_build_time)} · ${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
    }

    /** Opens the system chooser for [report]. */
    fun share(report: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Modern 4e Character Builder error report")
            putExtra(Intent.EXTRA_TEXT, report)
        }
        val chooser = Intent.createChooser(send, "Send this to Banter").apply {
            if (context !is Activity) {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
        startChooser(chooser)
    }
}
