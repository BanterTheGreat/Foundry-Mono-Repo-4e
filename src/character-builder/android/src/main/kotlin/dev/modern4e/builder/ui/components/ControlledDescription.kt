package dev.modern4e.builder.ui.components

import android.text.Html
import android.text.SpannableStringBuilder
import android.text.style.URLSpan
import android.widget.TextView
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView

import dev.modern4e.builder.ui.theme.*

/** No browser, JavaScript, network or external navigation. Internal references have native buttons. */
@Composable
internal fun ControlledDescription(html: String) {
    AndroidView(factory = { context -> TextView(context).apply { setTextColor(Ink.toArgb()); textSize = 16f } }, update = { view ->
        val safe = SpannableStringBuilder(Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT))
        safe.getSpans(0, safe.length, URLSpan::class.java).forEach { safe.removeSpan(it) }
        view.text = safe
        view.contentDescription = safe.toString()
    }, modifier = Modifier.fillMaxWidth())
}
