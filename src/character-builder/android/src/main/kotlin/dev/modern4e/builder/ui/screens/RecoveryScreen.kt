package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.theme.Dim

/** Lists one recoverable save per character and edit day, newest first. */
@Composable
internal fun RecoveryScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Choose a copy to review before recovering it. Each character shows one copy per day, for up to 10 days of edits.", color = Dim)
        val copies = model.recoveries.orEmpty()
        if (copies.isEmpty() && !model.busy) {
            Text("No recovery copies yet.", color = Dim)
        }
        copies.forEach { copy ->
            FolioButton("${copy.character.name} · Level ${copy.character.level}\n${formatCharacterDate(copy.character.savedAt)}",
                enabled = !model.busy, outlined = true) {
                task { recover(copy.recoveryId) }
            }
        }
    }
}
