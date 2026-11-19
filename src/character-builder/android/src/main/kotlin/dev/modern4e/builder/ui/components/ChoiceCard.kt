package dev.modern4e.builder.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.ui.theme.*

/** Shows a checked class row using the compact Progression card and its already-loaded description. */
@Composable
internal fun ClassChoiceCard(entry: ContentEntry, title: String, chosen: Boolean, expanded: Boolean, enabled: Boolean,
    choose: () -> Unit) {
    ChoiceCard(title, chosen, expanded, enabled, null, choose, compact = true) {
        ControlledDescription(entry.presentation.description, compact = true)
    }
}

/**
 * A choice card: tapping selects it, ticks and frames it, and expands its content, so no radio buttons are needed.
 * Shared by the Levels pickers and the new-character class list.
 */
@Composable
internal fun ChoiceCard(
    title: String, chosen: Boolean, expanded: Boolean, enabled: Boolean, level: Int?, click: () -> Unit,
    compact: Boolean = false, titleColor: Color = Ink, viewed: Boolean = false, content: @Composable ColumnScope.() -> Unit
) {
    Surface(Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = click), color = if (chosen || viewed) Wash else Paper,
        border = BorderStroke(if (chosen) 2.dp else 1.dp, if (chosen || viewed) Accent else Line)) {
        Column(Modifier.padding(horizontal = if (compact) 13.dp else 14.dp, vertical = if (compact) 7.dp else 14.dp),
            verticalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val color = if (enabled) titleColor else MaterialTheme.colorScheme.error
                Text((if (chosen) "✓ " else "") + title, Modifier.weight(1f), fontFamily = FontFamily.Serif,
                    fontSize = if (compact) 15.sp else 18.sp, lineHeight = if (compact) 18.sp else TextUnit.Unspecified, color = color)
                level?.let {
                    Surface(color = color) {
                        Text(it.toString(), Modifier.padding(horizontal = if (compact) 5.dp else 7.dp, vertical = if (compact) 1.dp else 7.dp),
                            fontSize = if (compact) 11.sp else TextUnit.Unspecified,
                            lineHeight = if (compact) 14.sp else TextUnit.Unspecified, color = Paper)
                    }
                }
            }
            if (expanded || !enabled) { content() }
        }
    }
}
