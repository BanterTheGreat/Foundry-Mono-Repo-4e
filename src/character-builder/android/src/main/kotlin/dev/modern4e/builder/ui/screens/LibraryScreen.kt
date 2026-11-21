package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/**
 * Renders the library destination using the retained session: a search and sort above a ledger whose rows lead
 * with the character's level.
 */
@Composable
internal fun LibraryScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var sort by rememberSaveable { mutableStateOf(LibrarySort.Recent) }
    val shown = model.characters.forLibrary(query, sort)
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        if (model.characters.isNotEmpty()) {
            FolioSearchField(query, "Search ${model.characters.size} characters", Modifier.fillMaxWidth()) { query = it }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LibrarySort.entries.forEach { option ->
                    Box(Modifier.weight(1f)) {
                        FolioButton(option.label, true, outlined = sort != option, compact = true) { sort = option }
                    }
                }
            }
        }
        Column(Modifier.weight(1f).folioScroll(rememberScrollState())) {
            if (model.characters.isEmpty() && !model.busy) {
                Heading("No characters yet")
                Text("Create a new character or import a character file to start your collection.", color = Dim)
            } else if (model.characters.isNotEmpty() && shown.isEmpty()) {
                Text("No characters match your search.", color = Dim, modifier = Modifier.padding(vertical = 12.dp))
            }
            shown.forEach { character ->
                HorizontalDivider(color = Line)
                LibraryRow(character, !model.busy, open = { task { load(character.id) } }, delete = { model.requestDeletion(character) })
            }
            if (shown.isNotEmpty()) {
                HorizontalDivider(color = Line)
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

/** One ledger row: a large level numeral, the name over its ancestry and class, the save date and the delete action. */
@Composable
private fun LibraryRow(character: CharacterSummary, enabled: Boolean, open: () -> Unit, delete: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = open).padding(start = 4.dp, end = 2.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(character.level.toString(), color = Accent, fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 32.sp, maxLines = 1)
            Text("LEVEL", color = Dim, fontSize = 9.sp, lineHeight = 11.sp, letterSpacing = 1.sp)
        }
        Column(Modifier.weight(1f).padding(start = 8.dp)) {
            Text(character.name, color = Ink, fontFamily = FontFamily.Serif, fontSize = 18.sp,
                lineHeight = 22.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val origin = listOf(character.ancestry, character.characterClass).filter(String::isNotBlank).joinToString(" ")
            if (origin.isNotEmpty()) {
                Text(origin, color = Dim, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Text(formatCharacterDate(character.savedAt), color = Dim, fontSize = 11.sp,
            lineHeight = 14.sp, textAlign = TextAlign.End,
            modifier = Modifier.widthIn(max = 96.dp).padding(start = 8.dp))
        FolioIconButton("Delete ${character.name}", enabled, action = delete) {
            TrashIcon()
        }
    }
}
