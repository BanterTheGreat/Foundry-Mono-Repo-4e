package dev.modern4e.builder.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
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

@Composable
internal fun FolioButton(text: String, enabled: Boolean, outlined: Boolean = false, action: () -> Unit) {
    if (outlined) {
        OutlinedButton(action, enabled = enabled, shape = RoundedCornerShape(3.dp), border = BorderStroke(1.dp, Accent), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(text, fontSize = 17.sp) }
    } else {
        Button(action, enabled = enabled, shape = RoundedCornerShape(3.dp), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text(text, fontSize = 17.sp) }
    }
}
