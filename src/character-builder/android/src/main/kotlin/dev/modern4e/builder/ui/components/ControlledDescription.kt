package dev.modern4e.builder.ui.components

import android.text.Html
import android.text.SpannableStringBuilder
import android.text.TextUtils
import android.text.style.AbsoluteSizeSpan
import android.text.style.RelativeSizeSpan
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
internal fun ControlledDescription(html: String, compact: Boolean = false) {
    AndroidView(factory = { context -> TextView(context).apply { setTextColor(Ink.toArgb()) } }, update = { view ->
        val safe = SpannableStringBuilder(Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT))
        safe.getSpans(0, safe.length, URLSpan::class.java).forEach { safe.removeSpan(it) }
        if (compact) {
            // Keep source emphasis without letting HTML headings exceed the choice title.
            safe.getSpans(0, safe.length, AbsoluteSizeSpan::class.java).forEach { safe.removeSpan(it) }
            safe.getSpans(0, safe.length, RelativeSizeSpan::class.java).forEach { safe.removeSpan(it) }
        }
        view.textSize = if (compact) 12f else 16f
        view.text = safe
        view.contentDescription = safe.toString()
    }, modifier = Modifier.fillMaxWidth())
}

/** Plain authored text in the same compact style as catalog descriptions. */
@Composable
internal fun PlainChoiceDescription(text: String) {
    val html = remember(text) { TextUtils.htmlEncode(text).replace("\n", "<br>") }
    ControlledDescription(html, compact = true)
}
