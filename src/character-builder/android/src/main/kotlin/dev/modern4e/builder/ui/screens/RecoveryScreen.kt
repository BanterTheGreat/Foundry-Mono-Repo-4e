package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.theme.Dim
import dev.modern4e.builder.ui.theme.Line
import dev.modern4e.builder.ui.theme.Wash

/** Lists the recoverable saves of each character, one collapsible section per character. */
@Composable
internal fun RecoveryScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Choose a copy to review before recovering it. Each character shows one copy per day, for up to 10 days of edits.", color = Dim)
        val copies = model.recoveries.orEmpty()
        // Back clears the copies before the slide-out finishes, so the empty notice only belongs to this page.
        if (copies.isEmpty() && !model.busy && model.page == "recovery") {
            Text("No recovery copies yet.", color = Dim)
        }
        RecoveryCopyList(copies, !model.busy) { task { recover(it) } }
    }
}

/** Collapsible sections of recovery copies, one per character; a lone character starts expanded. */
@Composable
internal fun RecoveryCopyList(copies: List<RecoverySummary>, enabled: Boolean, recover: (String) -> Unit) {
    val groups = remember(copies) { recoveryGroups(copies) }
    var open by remember(groups) { mutableStateOf(if (groups.size == 1) setOf(groups.single().characterId) else emptySet()) }
    groups.forEach { group ->
        val expanded = group.characterId in open
        Surface(
            Modifier.fillMaxWidth().clickable(role = Role.Button) {
                open = if (expanded) open - group.characterId else open + group.characterId
            }.semantics { stateDescription = if (expanded) "Expanded" else "Collapsed" },
            color = Wash,
            border = BorderStroke(1.dp, Line),
        ) {
            FolioFieldContent(if (group.copies.size == 1) "1 copy" else "${group.copies.size} copies", group.name, compact = false) {
                Text(if (expanded) "▴" else "▾", color = Dim, fontSize = 14.sp)
            }
        }
        if (expanded) {
            Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                group.copies.forEach { copy ->
                    FolioButton("Level ${copy.character.level}\n${formatCharacterDate(copy.character.savedAt)}", enabled, outlined = true) {
                        recover(copy.recoveryId)
                    }
                }
            }
        }
    }
}
