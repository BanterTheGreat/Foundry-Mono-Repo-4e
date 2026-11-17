package dev.modern4e.builder

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.dp

internal data class ScrollbarThumb(val top: Float, val height: Float)

/** Proportional thumb with a minimum visible length; short content has no scrollbar. */
internal fun scrollbarThumb(viewport: Float, maxScroll: Int, scroll: Int, track: Float, minimum: Float): ScrollbarThumb? {
    if (viewport <= 0f || track <= 0f || maxScroll <= 0 || maxScroll == Int.MAX_VALUE) {
        return null
    }
    val height = (track * viewport / (viewport + maxScroll.toFloat()))
        .coerceIn(minimum.coerceIn(0f, track), track)
    val top = (track - height) * scroll.coerceIn(0, maxScroll).toFloat() / maxScroll
    return ScrollbarThumb(top, height)
}

/** A quiet parchment rule and oxblood thumb, kept visible whenever content overflows.
 * Drawing wraps the scroll viewport, while a small trailing gutter keeps text clear.
 * Native verticalScroll retains touch, fling and accessibility scroll behavior.
 */
@Composable
internal fun Modifier.folioScroll(state: ScrollState): Modifier {
    val thumbColor = MaterialTheme.colorScheme.primary.copy(alpha = .8f)
    val trackColor = MaterialTheme.colorScheme.outline.copy(alpha = .55f)
    return drawWithContent {
        drawContent()
        val inset = 4.dp.toPx()
        val trackHeight = size.height - inset * 2
        val thumb = scrollbarThumb(state.viewportSize.toFloat(), state.maxValue, state.value, trackHeight, 28.dp.toPx())
            ?: return@drawWithContent
        val width = 3.dp.toPx()
        val x = size.width - width - 2.dp.toPx()
        drawRoundRect(trackColor, Offset(x + width / 3, inset), Size(width / 3, trackHeight), CornerRadius(width))
        drawRoundRect(thumbColor, Offset(x, inset + thumb.top), Size(width, thumb.height), CornerRadius(width))
    }.padding(end = 8.dp).verticalScroll(state)
}
