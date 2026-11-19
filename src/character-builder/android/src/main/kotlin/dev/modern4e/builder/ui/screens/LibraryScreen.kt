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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** Renders the library destination using the retained session. */
@Composable
internal fun LibraryScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Column(Modifier.weight(1f).folioScroll(rememberScrollState())) {
            if (model.characters.isEmpty() && !model.busy) {
                Heading("No characters yet")
                Text("Create a new character or import a character file to start your collection.", color = Dim)
            }
            model.characters.forEach { character ->
                Surface(color = Paper, shape = RoundedCornerShape(3.dp), border = BorderStroke(1.dp, Line),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                    Row(Modifier.fillMaxWidth().clickable(enabled = !model.busy) { task { load(character.id) } }
                        .padding(start = 12.dp, end = 2.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(character.name, color = Ink, fontFamily = FontFamily.Serif, fontSize = 18.sp,
                                lineHeight = 22.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(character.levelDescription, color = Dim, fontSize = 12.sp, lineHeight = 16.sp)
                        }
                        Text(formatCharacterDate(character.savedAt), color = Dim, fontSize = 11.sp,
                            lineHeight = 14.sp, textAlign = TextAlign.End,
                            modifier = Modifier.widthIn(max = 112.dp).padding(start = 8.dp))
                        IconButton(enabled = !model.busy, onClick = { model.requestDeletion(character) },
                            modifier = Modifier.size(48.dp).semantics { contentDescription = "Delete ${character.name}" }) {
                            TrashIcon()
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) {
                FolioButton("New", !model.busy) { task { beginCreate() } }
            }
            Box(Modifier.weight(1f)) {
                FolioButton("Import", !model.busy, outlined = true) { model.page = "import" }
            }
        }
    }
}
