package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.ScrollState
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import dev.modern4e.builder.BuilderSession
import kotlin.math.roundToInt

/** Frames a fresh Levels screen is given to lay out its rows before a scroll request gives up. */
private const val LAYOUT_FRAMES = 10

/**
 * The Levels rows that currently need attention, each able to say where it sits on screen. Rows register while
 * flagged and leave when they are filled, saving or gone, so the screen can find the topmost one on request.
 */
internal class OpenChoiceRegistry {
    private val tops = mutableMapOf<Any, () -> Float?>()

    /** Record [top], the row's current top edge in root coordinates (null while it is not laid out). */
    fun register(key: Any, top: () -> Float?) {
        tops[key] = top
    }

    fun unregister(key: Any) {
        tops.remove(key)
    }

    /** Top edge of the highest flagged row, or null when none is flagged or laid out. */
    fun firstTop(): Float? = tops.values.mapNotNull { it() }.minOrNull()
}

internal val LocalOpenChoices = compositionLocalOf<OpenChoiceRegistry?> { null }

/** Where to scroll so a row [rowTop] sits [margin] below the viewport's top edge, kept within the scrollable range. */
internal fun openChoiceScrollTarget(scroll: Int, rowTop: Float, viewportTop: Float, margin: Float, max: Int): Int =
    (scroll + rowTop - viewportTop - margin).roundToInt().coerceIn(0, max)

/** Marks a Levels row as an open choice while [flagged], so Continue in the footer can scroll to the first one. */
@Composable
internal fun Modifier.openChoice(flagged: Boolean): Modifier {
    val registry = LocalOpenChoices.current ?: return this
    val key = remember { Any() }
    DisposableEffect(flagged) {
        onDispose { registry.unregister(key) }
    }
    return if (flagged) {
        onGloballyPositioned { coordinates ->
            registry.register(key) { coordinates.takeIf { it.isAttached }?.positionInRoot()?.y }
        }
    } else {
        this
    }
}

/**
 * Answers the footer's Continue: once the session asks, wait for the rows to lay out, scroll the first open choice
 * to just below the top of the screen and clear the request. [viewportTop] is the scroll area's top in root coordinates.
 */
@Composable
internal fun ScrollToFirstOpenChoice(model: BuilderSession, scroll: ScrollState, choices: OpenChoiceRegistry, viewportTop: () -> Float?) {
    val margin = with(LocalDensity.current) { 12.dp.toPx() }
    LaunchedEffect(model.openChoicePending) {
        if (!model.openChoicePending) {
            return@LaunchedEffect
        }
        try {
            var rowTop: Float? = null
            var top: Float? = null
            for (frame in 0 until LAYOUT_FRAMES) {
                withFrameNanos { }
                rowTop = choices.firstTop()
                top = viewportTop()
                if (rowTop != null && top != null) {
                    break
                }
            }
            if (rowTop != null && top != null) {
                scroll.animateScrollTo(openChoiceScrollTarget(scroll.value, rowTop, top, margin, scroll.maxValue))
            }
        } finally {
            model.finishOpenChoiceRequest()
        }
    }
}
