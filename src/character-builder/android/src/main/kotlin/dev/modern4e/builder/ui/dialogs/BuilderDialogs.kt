package dev.modern4e.builder.ui.dialogs

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.R
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.screens.PowerBlock
import dev.modern4e.builder.ui.screens.RecoveryCopyList
import dev.modern4e.builder.ui.screens.chooseImportFile
import dev.modern4e.builder.ui.screens.pickerSheetHeight

/** Artwork and a hazard stripe across the top of the blocking error dialog. */
@Composable
private fun ErrorBanner() {
    Image(painterResource(R.drawable.error_banner), contentDescription = null, contentScale = ContentScale.Crop,
        modifier = Modifier.fillMaxWidth().height(170.dp))
    Canvas(Modifier.fillMaxWidth().height(10.dp)) {
        drawRect(Paper)
        val slant = size.height
        val pitch = 24.dp.toPx()
        val band = 12.dp.toPx()
        var x = -slant
        while (x < size.width) {
            drawPath(Path().apply {
                moveTo(x + slant, 0f)
                lineTo(x + slant + band, 0f)
                lineTo(x + band, slant)
                lineTo(x, slant)
                close()
            }, Accent)
            x += pitch
        }
    }
}

/**
 * Presents workflow modals, prioritizing blocking operational errors.
 *
 * The blocking error dialog never shows the error itself: its one call to action shares the report with Banter.
 */
@Composable
internal fun BuilderDialogs(
    model: BuilderSession,
    task: (suspend BuilderSession.() -> Unit) -> Unit,
    exports: ExportTargets? = null,
    errorSharer: AndroidErrorReportSharer? = null,
    exchange: FileExchange? = null,
) {
    if (model.errors.isNotEmpty()) {
        FolioDialog("Something went wrong", {}, dismissible = false, banner = { ErrorBanner() }) {
            Text("Return to the main menu before continuing. Unsaved changes in this session will be discarded.")
            FolioAlertButton("Send this to Banter", "Tap to share the error report", enabled = errorSharer != null) {
                errorSharer?.share(errorReportText(errorSharer.environment, model.errors, model.errorTrace))
            }
            FolioButton("Return to main menu", !model.busy) { model.returnHomeAfterError() }
        }
    } else {
        Editor(model, task)
        model.levelTarget?.let { target -> LevelDialog(model, target, task) }
        model.copyName?.let { name -> CopyDialog(model, name, task) }
        model.notice?.let { message ->
            FolioDialog("Portrait not changed", { model.notice = null }) {
                Text(message)
                FolioActions {
                    FolioButton("OK", true, compact = true, fillWidth = false) { model.notice = null }
                }
            }
        }
        if (model.exportChoice && exports != null) {
            FolioDialog("Export character", { model.exportChoice = false }) {
                Text("Save a copy of this character as a JSON file, or share it with a friend.", color = Dim)
                FolioButton("Save to device", model.canExport) {
                    model.exportChoice = false
                    task { export(exports.save) }
                }
                FolioButton("Share", model.canExport, outlined = true) {
                    model.exportChoice = false
                    task { export(exports.share) }
                }
                FolioActions {
                    FolioTextButton("Cancel") { model.exportChoice = false }
                }
            }
        }
        model.exportFailure?.let { reason ->
            FolioDialog("Export failed", { model.exportFailure = null }) {
                Text("The character was not exported, and no file was kept.")
                Text(reason, color = Accent, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                FolioActions {
                    FolioButton("OK", true, compact = true, fillWidth = false) { model.exportFailure = null }
                }
            }
        }
        model.importFailure?.let { failure ->
            FolioDialog("Couldn't import that file", { model.dismissImportFailure() }) {
                Text(failure.fileName, color = Dim)
                Text(failure.reason)
                FolioActions {
                    FolioTextButton("Cancel") { model.dismissImportFailure() }
                    FolioButton("Choose another file", !model.busy && exchange != null, compact = true, fillWidth = false) {
                        model.dismissImportFailure()
                        exchange?.let { task { chooseImportFile(it) } }
                    }
                }
            }
        }
        model.classMenu?.let { classes -> ClassMenu(model, classes, task) }
        model.deleting?.let { character ->
            FolioDialog("Delete character?", { if (!model.busy) model.cancelDeletion() }) {
                Text("Delete ${character.name} from your character list?")
                FolioActions {
                    FolioTextButton("Cancel", !model.busy) { model.cancelDeletion() }
                    FolioButton("Delete", !model.busy, compact = true, destructive = true, fillWidth = false) { task { confirmDeletion() } }
                }
            }
        }
        model.recoveries?.takeIf { model.page != "recovery" }?.let { copies ->
            FolioDialog("Recovery copies", { model.recoveries = null }) {
                if (copies.isEmpty()) { Text("No retained recovery copies.") }
                RecoveryCopyList(copies, !model.busy) { task { recover(it) } }
                FolioActions {
                    FolioTextButton("Close") { model.recoveries = null }
                }
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
                preview.actions.filter { it != ImportAction.CANCEL }.forEachIndexed { index, action ->
                    FolioButton(when (action) { ImportAction.REPLACE -> "Replace existing"; ImportAction.COPY -> "Import as copy"; ImportAction.IMPORT -> "Import"; ImportAction.CANCEL -> "Cancel" },
                        !model.busy, outlined = index > 0) { task { import(action) } }
                }
                if (ImportAction.CANCEL in preview.actions) {
                    FolioActions {
                        FolioTextButton("Cancel", !model.busy) { task { import(ImportAction.CANCEL) } }
                    }
                }
            }
        }
        model.description?.let { entry ->
            FolioDialog(entry.entry.presentation.title, { model.description = null }) {
                if (entry.entry.category == EntryCategory.POWER) {
                    PowerBlock(entry.entry, showTitle = false)
                } else {
                    ControlledDescription(entry.entry.presentation.description)
                }
                Text("${entry.entry.coverage.status.name.readable()} automation", color = Dim)
                entry.entry.coverage.limitations.forEach { Text(it, color = Dim) }
                entry.entry.presentation.references.forEach { id -> FolioTextButton("Open reference: $id", !model.busy) { task { reference(id) } } }
                FolioActions {
                    FolioTextButton("Close") { model.description = null }
                }
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
            FolioActions {
                FolioTextButton("Cancel", !model.busy) { model.cancelCreate() }
                FolioButton("Create", !model.busy && selected != null, compact = true, fillWidth = false) { selected?.let { id -> task { create(id) } } }
            }
        }
    }
}

/** Focuses the editable identity field when its dialog opens. */
@Composable
private fun Editor(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    val field = model.dialog ?: return
    FolioDialog(field, { if (!model.busy) model.cancelEdit() }) {
        val focus = remember { FocusRequester() }
        OutlinedTextField(
            model.draft,
            { model.draft = it; model.pending = null },
            enabled = !model.busy,
            label = { Text(field) },
            minLines = if (field == "Notes") 4 else 1,
            modifier = Modifier.fillMaxWidth().focusRequester(focus),
        )
        LaunchedEffect(field) { focus.requestFocus() }
        FolioActions {
            FolioTextButton("Cancel", !model.busy) { model.cancelEdit() }
            FolioButton("Save", !model.busy && (field != "Name" || model.draft.isNotBlank()), compact = true, fillWidth = false) {
                task {
                    saveIdentityDraft()
                }
            }
        }
    }
}

/** Name a copy of the open character; saving stores the copy and opens it. */
@Composable
private fun CopyDialog(model: BuilderSession, name: String, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    FolioDialog("Copy character", { if (!model.busy) model.cancelCopy() }) {
        val focus = remember { FocusRequester() }
        OutlinedTextField(
            name,
            { model.copyName = it },
            enabled = !model.busy,
            label = { Text("Name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().focusRequester(focus),
        )
        LaunchedEffect(Unit) { focus.requestFocus() }
        FolioActions {
            FolioTextButton("Cancel", !model.busy) { model.cancelCopy() }
            FolioButton("Save", !model.busy && name.isNotBlank(), compact = true, fillWidth = false) { task { confirmCopy() } }
        }
    }
}

/** Change the character level and explain what lowering it does before confirmation. */
@Composable
private fun LevelDialog(model: BuilderSession, target: Int, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    val level = model.current?.document?.level ?: return
    FolioDialog("Change level", { if (!model.busy) model.cancelLevelChange() }) {
        Text("Current level $level.", color = Dim)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            FolioStepper("−", "Lower target level", !model.busy && target > 1) { model.adjustLevelTarget(target - 1) }
            Text("Level $target", fontFamily = FontFamily.Serif, fontSize = 38.sp, color = Accent,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            FolioStepper("+", "Raise target level", !model.busy && target < BuilderSession.MAX_LEVEL) { model.adjustLevelTarget(target + 1) }
        }
        if (target < level) {
            Text("Choices above level $target stay saved and take effect when you reach their level.", color = Dim)
        }
        FolioActions {
            FolioTextButton("Cancel", !model.busy) { model.cancelLevelChange() }
            FolioButton("Confirm", !model.busy && target != level, compact = true, fillWidth = false,
                modifier = Modifier.semantics { contentDescription = "Confirm level $target" }) { task { confirmLevelChange() } }
        }
    }
}
