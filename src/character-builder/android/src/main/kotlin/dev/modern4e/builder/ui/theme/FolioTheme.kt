package dev.modern4e.builder.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color

internal val Paper = Color(0xFFF3EDDF)
internal val Ink = Color(0xFF322B25)
internal val Dim = Color(0xFF71675C)
internal val Line = Color(0xFFC9BDA7)
internal val Accent = Color(0xFF863F36)
internal val Wash = Color(0xFFE8DDCB)

/** Applies the printed-rulebook palette to every screen and modal. */
@Composable
internal fun FolioTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = lightColorScheme(primary = Accent, background = Paper, surface = Paper,
        onSurface = Ink, onBackground = Ink, outline = Line, secondaryContainer = Wash), content = content)
}
