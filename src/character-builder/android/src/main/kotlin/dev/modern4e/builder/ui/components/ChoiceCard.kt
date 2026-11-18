package dev.modern4e.builder.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.ui.theme.*

/**
 * A choice card: tapping selects it, ticks and frames it, and expands its content, so no radio buttons are needed.
 * Shared by the Progression pickers and the new-character class list.
 */
@Composable
internal fun ChoiceCard(title: String, chosen: Boolean, expanded: Boolean, enabled: Boolean, level: Int?, click: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = click), color = if (chosen) Wash else Paper,
        border = BorderStroke(if (chosen) 2.dp else 1.dp, if (chosen) Accent else Line)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text((if (chosen) "✓ " else "") + title, Modifier.weight(1f), fontFamily = FontFamily.Serif, fontSize = 18.sp, color = if (enabled) Ink else Dim)
                level?.let { Surface(color = Ink) { Text(it.toString(), Modifier.padding(7.dp), color = Paper) } }
            }
            if (expanded || !enabled) { content() }
        }
    }
}
