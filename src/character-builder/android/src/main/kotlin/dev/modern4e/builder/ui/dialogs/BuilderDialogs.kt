package dev.modern4e.builder.ui.dialogs

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.screens.pickerSheetHeight

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
        model.levelTarget?.let { target -> LevelDialog(model, target, task) }
        model.notice?.let { message ->
            FolioDialog("Portrait not changed", { model.notice = null }) {
                Text(message)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { model.notice = null }) { Text("OK") }
                }
            }
        }
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

/**
 * Choose the starting class from the same card list and bottom sheet the Progression pickers use; the
 * character is only created once the choice is confirmed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ClassMenu(model: BuilderSession, classes: List<BuilderOptionRow>, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    var selected by remember(classes) { mutableStateOf<String?>(null) }
    var expanded by remember(classes) { mutableStateOf<String?>(null) }
    val options = remember(classes) { PickerOptions.Ready(classes, emptyList()) }
    ModalBottomSheet(onDismissRequest = { if (!model.busy) model.cancelCreate() }, containerColor = Paper,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().height(pickerSheetHeight(LocalConfiguration.current.screenHeightDp)).padding(horizontal = 20.dp)) {
            ClassPicker(options, selected, expanded, Modifier.weight(1f)) { option ->
                if (model.busy) {
                    return@ClassPicker
                }
                val id = option.entry.entry.id
                expanded = choiceExpansionOnTap(id, selected, expanded)
                selected = id
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(enabled = !model.busy, onClick = { model.cancelCreate() }) { Text("Cancel") }
                TextButton(enabled = !model.busy && selected != null, onClick = { selected?.let { id -> task { create(id) } } }) { Text("Create") }
            }
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

/** Raise the character's level: forward only, from the current level up to the cap, applied on Confirm. */
@Composable
private fun LevelDialog(model: BuilderSession, target: Int, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    val level = model.current?.document?.level ?: return
    FolioDialog("Change level", { if (!model.busy) model.cancelLevelChange() }) {
        Text("Current level $level. Levels can only be raised, never lowered.", color = Dim)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            OutlinedButton({ model.adjustLevelTarget(target - 1) }, enabled = !model.busy && target > level, shape = RoundedCornerShape(3.dp),
                border = BorderStroke(1.dp, Accent), modifier = Modifier.size(56.dp).semantics { contentDescription = "Lower target level" },
                contentPadding = PaddingValues(0.dp)) { Text("−", fontSize = 24.sp) }
            Text("Level $target", fontFamily = FontFamily.Serif, fontSize = 38.sp, color = Accent,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            OutlinedButton({ model.adjustLevelTarget(target + 1) }, enabled = !model.busy && target < BuilderSession.MAX_LEVEL, shape = RoundedCornerShape(3.dp),
                border = BorderStroke(1.dp, Accent), modifier = Modifier.size(56.dp).semantics { contentDescription = "Raise target level" },
                contentPadding = PaddingValues(0.dp)) { Text("+", fontSize = 24.sp) }
        }
        if (level >= BuilderSession.MAX_LEVEL) {
            Text("This character is already at the maximum level.", color = Dim)
        }
        if (target > 2) {
            Text("Incomplete automation: progression above level 2 is not evaluated. Calculated totals are unavailable.", color = Accent)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(enabled = !model.busy, onClick = { model.cancelLevelChange() }) { Text("Cancel") }
            TextButton(enabled = !model.busy && target > level, onClick = { task { confirmLevelChange() } },
                modifier = Modifier.semantics { contentDescription = "Confirm level $target" }) { Text("Confirm") }
        }
    }
}
