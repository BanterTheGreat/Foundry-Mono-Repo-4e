package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import dev.modern4e.builder.folioScroll
import dev.modern4e.builder.ui.theme.Paper

/** Uses the same sheet bounds and insets for Levels and Equipment choices. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ChoicePickerSheet(busy: Boolean, dismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(
        onDismissRequest = { if (!busy) { dismiss() } },
        containerColor = Paper,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier.fillMaxWidth().height(pickerSheetHeight(LocalConfiguration.current.screenHeightDp)).padding(horizontal = 20.dp),
            content = content,
        )
    }
}

/** Scrolls compact, expandable choice rows within the picker sheet. */
@Composable
internal fun CollapsibleChoiceList(modifier: Modifier, content: LazyListScope.() -> Unit) {
    val scroll = rememberLazyListState()
    LazyColumn(
        modifier.fillMaxWidth().folioScroll(scroll),
        state = scroll,
        verticalArrangement = Arrangement.spacedBy(4.dp),
        content = content,
    )
}

/** Places picker actions below the scrolling choices. Clear stages removal when supplied. */
@Composable
internal fun ChoicePickerActions(busy: Boolean, valid: Boolean, dismiss: () -> Unit, clear: (() -> Unit)?, save: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        TextButton(enabled = !busy, onClick = dismiss) { Text("Cancel") }
        if (clear != null) {
            TextButton(enabled = !busy, onClick = clear) { Text("Clear") }
        }
        TextButton(enabled = valid && !busy, onClick = save) { Text("Save") }
    }
}
