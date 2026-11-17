package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** Renders the library destination using the retained session. */
@Composable
internal fun LibraryScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Column(Modifier.weight(1f).folioScroll(rememberScrollState())) {
            if (model.characters.isEmpty() && !model.busy) {
                Heading("No characters yet")
                Text("Create a proof character or import a character file to start your collection.", color = Dim)
            }
            model.characters.forEach { character ->
                Surface(color = Paper, shape = RoundedCornerShape(3.dp), border = BorderStroke(1.dp, Line),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                    Row(Modifier.fillMaxWidth().clickable(enabled = !model.busy) { task { load(character.id) } }
                        .padding(horizontal = 16.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(character.name, color = Ink, fontFamily = FontFamily.Serif, fontSize = 25.sp)
                            Text("Level ${character.level} · ${formatCharacterDate(character.savedAt)}", color = Dim, fontSize = 12.sp)
                        }
                        IconButton(enabled = !model.busy, onClick = { model.requestDeletion(character) },
                            modifier = Modifier.size(48.dp).semantics { contentDescription = "Delete ${character.name}" }) {
                            TrashIcon()
                        }
                    }
                }
            }
        }
        FolioButton("Create a proof character", !model.busy) { task { create() } }
        Spacer(Modifier.height(12.dp))
        FolioButton("Import a character", !model.busy, outlined = true) { model.page = "import" }
    }
}
