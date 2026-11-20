package dev.modern4e.builder.ui.components

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.ui.theme.*

@Composable
internal fun Heading(text: String) {
    Text(text, fontFamily = FontFamily.Serif, fontSize = 23.sp, modifier = Modifier.padding(top = 12.dp).semantics { heading() })
}

/** Marks a section in a densely spaced character tab. */
@Composable
internal fun CompactHeading(text: String) {
    Text(
        text,
        fontFamily = FontFamily.Serif,
        fontSize = 16.sp,
        lineHeight = 20.sp,
        modifier = Modifier.padding(top = 6.dp).semantics { heading() },
    )
}

/** How much of a field's text shows while its edit is being saved. */
private const val SavingContentAlpha = 0.55f

/** The small spinner shown at a field's right edge while its edit is being saved. */
@Composable
internal fun SavingSpinner(modifier: Modifier = Modifier, size: Dp = 16.dp) {
    CircularProgressIndicator(modifier.size(size), color = Dim, strokeWidth = 2.dp)
}

/**
 * Renders an editable folio field, with a compact layout for the Levels screen.
 *
 * @param saving whether an edit for this field is being stored; it grays the field, shows a spinner at its right edge and
 *   replaces the needs-attention styling, which only the stored result can justify.
 */
@Composable
internal fun Field(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    compact: Boolean = false,
    leftAccent: Color? = null,
    valueIsHint: Boolean = false,
    invalid: Boolean = false,
    saving: Boolean = false,
    action: () -> Unit,
) {
    val errorColor = MaterialTheme.colorScheme.error
    val flagged = invalid && !saving
    Surface(
        modifier.fillMaxWidth().clickable(enabled = enabled, onClick = action).semantics {
            contentDescription = "Edit $label"
            if (saving) {
                stateDescription = "Saving"
            } else if (invalid) {
                stateDescription = "Needs attention"
            }
        },
        color = if (flagged) errorColor.copy(alpha = 0.10f).compositeOver(Paper) else if (saving) Wash else Paper,
        border = BorderStroke(1.dp, if (flagged) errorColor else Line),
    ) {
        Box(Modifier.leftEdgeAccent(leftAccent.takeUnless { flagged })) {
            Box(Modifier.alpha(if (saving) SavingContentAlpha else 1f)) {
                FolioFieldContent(label, value, compact, labelColor = if (flagged) errorColor else Dim,
                    valueColor = if (flagged) errorColor else LocalContentColor.current,
                    hintColor = if (flagged) errorColor else Dim, valueIsHint = valueIsHint)
            }
            if (saving) {
                SavingSpinner(Modifier.align(Alignment.CenterEnd).padding(end = 12.dp))
            }
        }
    }
}

/** Draws a narrow accent along the left edge of a choice. */
internal fun Modifier.leftEdgeAccent(color: Color?): Modifier = drawBehind {
    if (color != null) {
        drawRect(color, size = Size(3.dp.toPx().coerceAtMost(size.width), size.height))
    }
}

/** Draws a dashed outline that marks a slot still waiting to be filled. */
internal fun Modifier.dashedBorder(color: Color): Modifier = drawBehind {
    val stroke = 1.dp.toPx()
    drawRect(
        color,
        topLeft = Offset(stroke / 2, stroke / 2),
        size = Size(size.width - stroke, size.height - stroke),
        style = Stroke(stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 3.dp.toPx()))),
    )
}

/** Shares the label and value layout between editable fields and collapsible grants. */
@Composable
internal fun FolioFieldContent(
    label: String,
    value: String,
    compact: Boolean,
    labelColor: Color = Dim,
    valueColor: Color = LocalContentColor.current,
    hintColor: Color = Dim,
    valueIsHint: Boolean = false,
    trailing: @Composable (() -> Unit)? = null,
) {
    Column(Modifier.padding(horizontal = 12.dp, vertical = if (compact) 6.dp else 12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label.uppercase(), Modifier.weight(1f), color = labelColor, fontSize = if (compact) 9.sp else 10.sp,
                lineHeight = if (compact) 12.sp else TextUnit.Unspecified, letterSpacing = 1.sp)
            trailing?.invoke()
        }
        if (valueIsHint) {
            Box(Modifier.heightIn(min = 20.dp), contentAlignment = Alignment.CenterStart) {
                Text(value, color = hintColor, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        } else {
            Text(value, color = valueColor, fontFamily = FontFamily.Serif, fontSize = if (compact) 16.sp else 18.sp,
                lineHeight = if (compact) 20.sp else TextUnit.Unspecified)
        }
    }
}

/** The corner radius shared by every folio button and stepper. */
private val ButtonShape = RoundedCornerShape(3.dp)

/** The size every folio icon button and stepper is tapped at. */
private val TouchTarget = 48.dp

/**
 * The one themed button: filled for a primary action, outlined for an alternative.
 *
 * @param compact a 40dp, 14sp button for dialogs, sheets and cards; the default is the 56dp, 17sp screen action.
 * @param destructive colors the button as an error, for actions that delete data.
 * @param fillWidth stretches the button across its parent; turn off in a row, where [modifier] sets the width.
 */
@Composable
internal fun FolioButton(
    text: String,
    enabled: Boolean,
    outlined: Boolean = false,
    compact: Boolean = false,
    destructive: Boolean = false,
    fillWidth: Boolean = true,
    modifier: Modifier = Modifier,
    action: () -> Unit,
) {
    val tone = if (destructive) MaterialTheme.colorScheme.error else Accent
    val size = modifier.then(if (fillWidth) Modifier.fillMaxWidth() else Modifier).heightIn(min = if (compact) 40.dp else 56.dp)
    val fontSize = if (compact) 14.sp else 17.sp
    val padding = if (compact) PaddingValues(horizontal = 16.dp, vertical = 6.dp) else ButtonDefaults.ContentPadding
    if (outlined) {
        OutlinedButton(action, enabled = enabled, shape = ButtonShape, border = BorderStroke(1.dp, tone),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = tone), contentPadding = padding, modifier = size) { Text(text, fontSize = fontSize) }
    } else {
        Button(action, enabled = enabled, shape = ButtonShape, colors = ButtonDefaults.buttonColors(containerColor = tone),
            contentPadding = padding, modifier = size) { Text(text, fontSize = fontSize) }
    }
}

/**
 * A large, raised call to action for the one thing a player must not skip (sending an error report).
 * Deliberately heavier than [FolioButton]: warning glyph, upper-case serif title, and a share glyph that pulses.
 */
@Composable
internal fun FolioAlertButton(title: String, subtitle: String, enabled: Boolean = true, action: () -> Unit) {
    val pulse by rememberInfiniteTransition(label = "share pulse").animateFloat(
        initialValue = 1f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(keyframes {
            durationMillis = 1800
            1f at 1260
            1.12f at 1530
            1f at 1800
        }),
        label = "share scale",
    )
    Surface(
        onClick = action,
        enabled = enabled,
        shape = ButtonShape,
        color = Accent,
        contentColor = Paper,
        shadowElevation = 6.dp,
        modifier = Modifier.fillMaxWidth().alpha(if (enabled) 1f else .38f).semantics {
            role = Role.Button
            contentDescription = "$title: $subtitle"
        },
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            WarningIcon()
            Column(Modifier.weight(1f)) {
                Text(title.uppercase(), fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 24.sp)
                Text(subtitle, fontSize = 14.sp)
            }
            Box(Modifier.size(TouchTarget).scale(pulse).background(Paper, CircleShape), contentAlignment = Alignment.Center) {
                ShareIcon()
            }
        }
    }
}

/** A quiet text-only button for dismissing or backing out (Cancel, Close) and for inline links. */
@Composable
internal fun FolioTextButton(text: String, enabled: Boolean = true, modifier: Modifier = Modifier, action: () -> Unit) {
    TextButton(action, enabled = enabled, shape = ButtonShape, modifier = modifier) { Text(text, fontSize = 14.sp) }
}

/**
 * Lays out the buttons that end a dialog or sheet, right-aligned with the primary action last.
 *
 * @param leading an optional button kept at the left edge, such as Clear.
 */
@Composable
internal fun FolioActions(leading: (@Composable () -> Unit)? = null, content: @Composable RowScope.() -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        leading?.invoke()
        Spacer(Modifier.weight(1f))
        content()
    }
}

/** A square outlined +/− control; the symbol is decorative, so [description] names the action. */
@Composable
internal fun FolioStepper(symbol: String, description: String, enabled: Boolean, action: () -> Unit) {
    OutlinedButton(action, enabled = enabled, shape = ButtonShape, border = BorderStroke(1.dp, Accent),
        modifier = Modifier.size(TouchTarget).semantics { contentDescription = description }, contentPadding = PaddingValues(0.dp)) {
        Text(symbol, fontSize = 24.sp)
    }
}

/** An icon-only button with the shared touch target; [description] is what a screen reader announces. */
@Composable
internal fun FolioIconButton(description: String, enabled: Boolean = true, modifier: Modifier = Modifier, action: () -> Unit, icon: @Composable () -> Unit) {
    IconButton(action, enabled = enabled, modifier = modifier.size(TouchTarget).semantics { contentDescription = description }, content = icon)
}

/**
 * A tab in a row of equal tabs: [content] receives the selected/unselected color and the selected tab is underlined.
 */
@Composable
internal fun FolioTab(selected: Boolean, enabled: Boolean, modifier: Modifier = Modifier, action: () -> Unit, content: @Composable (Color) -> Unit) {
    val color = if (selected) Accent else Dim
    TextButton(action, enabled = enabled, shape = ButtonShape, contentPadding = PaddingValues(horizontal = 4.dp),
        modifier = modifier.drawBehind {
            if (selected) {
                drawRect(Accent, topLeft = androidx.compose.ui.geometry.Offset(0f, size.height - 2.dp.toPx()), size = Size(size.width, 2.dp.toPx()))
            }
        }.semantics { this.selected = selected; role = Role.Tab }) { content(color) }
}
