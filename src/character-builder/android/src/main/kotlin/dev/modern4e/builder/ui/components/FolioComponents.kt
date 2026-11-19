package dev.modern4e.builder.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.ui.theme.*

@Composable
internal fun Heading(text: String) {
    Text(text, fontFamily = FontFamily.Serif, fontSize = 23.sp, modifier = Modifier.padding(top = 12.dp).semantics { heading() })
}

/** Renders an editable folio field, with a compact layout for the Levels screen. */
@Composable
internal fun Field(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    compact: Boolean = false,
    accent: Color? = null,
    valueIsHint: Boolean = false,
    invalid: Boolean = false,
    action: () -> Unit,
) {
    val errorColor = MaterialTheme.colorScheme.error
    val fieldAccent = if (invalid) errorColor else accent
    Surface(
        modifier.fillMaxWidth().clickable(enabled = enabled, onClick = action).semantics {
            contentDescription = "Edit $label"
            if (invalid) {
                stateDescription = "Needs attention"
            }
        },
        color = if (invalid) errorColor.copy(alpha = 0.10f).compositeOver(Paper) else Paper,
        border = BorderStroke(1.dp, fieldAccent ?: Line),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = if (compact) 6.dp else 12.dp)) {
            Text(label.uppercase(), color = fieldAccent ?: Dim, fontSize = if (compact) 9.sp else 10.sp,
                lineHeight = if (compact) 12.sp else TextUnit.Unspecified, letterSpacing = 1.sp)
            if (valueIsHint) {
                Box(Modifier.heightIn(min = 20.dp), contentAlignment = Alignment.CenterStart) {
                    Text(value, color = if (invalid) errorColor else Dim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            } else {
                Text(value, color = if (invalid) errorColor else LocalContentColor.current,
                    fontFamily = FontFamily.Serif, fontSize = if (compact) 16.sp else 18.sp,
                    lineHeight = if (compact) 20.sp else TextUnit.Unspecified)
            }
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
