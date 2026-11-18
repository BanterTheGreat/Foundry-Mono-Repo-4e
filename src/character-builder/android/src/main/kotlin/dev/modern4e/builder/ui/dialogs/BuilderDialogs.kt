package dev.modern4e.builder.ui.dialogs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** Presents workflow modals, prioritizing blocking operational errors. */
@Composable
internal fun BuilderDialogs(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    if (model.errors.isNotEmpty()) {
        FolioDialog("Something went wrong", {}, dismissible = false) {
            Text("Return to the main menu before continuing. Unsaved changes in this session will be discarded.")
            model.errors.forEach {
                Text(it.message, color = Accent, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            }
            FolioButton("Return to main menu", !model.busy) { model.returnHomeAfterError() }
        }
    } else {
        Editor(model, task)
        model.classMenu?.let { classes -> ClassMenu(model, classes, task) }
        model.deleting?.let { character ->
            FolioDialog("Delete character?", { if (!model.busy) model.cancelDeletion() }) {
                Text("Delete ${character.name} from your character list?")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(enabled = !model.busy, onClick = { model.cancelDeletion() }) { Text("Cancel") }
                    TextButton(enabled = !model.busy, onClick = { task { confirmDeletion() } }) { Text("Delete") }
                }
            }
        }
        model.recoveries?.let { copies ->
            FolioDialog("Recovery copies", { model.recoveries = null }) {
                if (copies.isEmpty()) { Text("No retained recovery copies.") }
                copies.forEach { copy -> TextButton(enabled = !model.busy, onClick = { task { recover(copy.recoveryId) } }) {
                    Text("${copy.character.name} · Level ${copy.character.level}\n${copy.character.savedAt}")
                } }
                TextButton(onClick = { model.recoveries = null }) { Text("Close") }
            }
        }
        model.preview?.let { preview ->
            FolioDialog("Review character import", { if (!model.busy) task { import(ImportAction.CANCEL) } }) {
                Text("Incoming: ${preview.incomingDetails.name} · Level ${preview.incomingDetails.level}\nSaved ${preview.incomingDetails.savedAt}")
                Text("ID: ${preview.incomingDetails.id}", fontSize = 12.sp, color = Dim)
                preview.existingDetails?.let { existing ->
                    Text("On this device: ${existing.name} · Level ${existing.level}\nSaved ${existing.savedAt}")
                    Text("Replacement retains a recovery copy. No choices are merged.", color = Dim)
                }
                preview.actions.forEach { action -> TextButton(enabled = !model.busy, onClick = { task { import(action) } }) {
                    Text(when (action) { ImportAction.REPLACE -> "Replace existing"; ImportAction.COPY -> "Import as copy"; ImportAction.IMPORT -> "Import"; ImportAction.CANCEL -> "Cancel" })
                } }
            }
        }
        model.description?.let { entry ->
            FolioDialog(entry.entry.presentation.title, { model.description = null }) {
                ControlledDescription(entry.entry.presentation.description)
                Text("${entry.entry.coverage.status.name.readable()} automation", color = Dim)
                entry.entry.coverage.limitations.forEach { Text(it, color = Dim) }
                entry.entry.presentation.references.forEach { id -> TextButton(enabled = !model.busy, onClick = { task { reference(id) } }) { Text("Open reference: $id") } }
                TextButton(onClick = { model.description = null }) { Text("Close") }
            }
        }
    }
}

/** Choose the starting class; the character is only created once the choice is confirmed. */
@Composable
private fun ClassMenu(model: BuilderSession, classes: List<CatalogEntry>, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    var selected by remember(classes) { mutableStateOf<String?>(null) }
    FolioDialog("Choose a class", { if (!model.busy) model.cancelCreate() }) {
        classes.forEach { entry ->
            val id = entry.metadata.id
            Row(Modifier.fillMaxWidth().selectable(selected == id, enabled = !model.busy, role = Role.RadioButton) { selected = id },
                verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected == id, onClick = null, enabled = !model.busy)
                Text(entry.metadata.title, modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 12.dp))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(enabled = !model.busy, onClick = { model.cancelCreate() }) { Text("Cancel") }
            TextButton(enabled = !model.busy && selected != null, onClick = { selected?.let { id -> task { create(id) } } }) { Text("Create") }
        }
    }
}

@Composable
private fun Editor(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    val field = model.dialog ?: return
    FolioDialog(field, { if (!model.busy) model.cancelEdit() }) {
        OutlinedTextField(model.draft, { model.draft = it; model.pending = null }, enabled = !model.busy,
            label = { Text(field) }, minLines = if (field == "Notes") 4 else 1, modifier = Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(enabled = !model.busy, onClick = { model.cancelEdit() }) { Text("Cancel") }
            TextButton(enabled = !model.busy && (field != "Name" || model.draft.isNotBlank()), onClick = {
                task {
                    saveIdentityDraft()
                }
            }) { Text("Save") }
        }
    }
}
