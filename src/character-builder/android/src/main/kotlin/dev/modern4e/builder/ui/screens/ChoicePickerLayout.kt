package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import dev.modern4e.builder.folioScroll
import dev.modern4e.builder.ui.components.FolioActions
import dev.modern4e.builder.ui.components.FolioButton
import dev.modern4e.builder.ui.components.FolioTextButton
import dev.modern4e.builder.ui.theme.Paper

/** Keeps unused list and reader motion from reaching the sheet at a scroll boundary. */
private object PickerBodyScroll : NestedScrollConnection {
    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset =
        Offset(0f, available.y)

    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity =
        Velocity(0f, available.y)
}

/**
 * Uses the same sheet bounds and insets for Levels and Equipment choices.
 *
 * @param sidePadding the space beside the content; only the skill matrix narrows it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ChoicePickerSheet(busy: Boolean, dismiss: () -> Unit, sidePadding: Dp = 20.dp,
    content: @Composable ColumnScope.() -> Unit) {
    val isBusy by rememberUpdatedState(busy)
    ModalBottomSheet(
        onDismissRequest = { if (!busy) { dismiss() } },
        containerColor = Paper,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = remember {
            { value -> !isBusy || value != SheetValue.Hidden }
        }),
    ) {
        Column(
            Modifier.fillMaxWidth().height(pickerSheetHeight(LocalConfiguration.current.screenHeightDp))
                .nestedScroll(PickerBodyScroll)
                // Descendants handle their own scrolls first. Dragging blank space in this body also stays in place.
                .pointerInput(Unit) { detectVerticalDragGestures { change, _ -> change.consume() } }
                .padding(horizontal = sidePadding),
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
    FolioActions(leading = clear?.let { { FolioTextButton("Clear", !busy, action = it) } }) {
        FolioTextButton("Cancel", !busy, action = dismiss)
        FolioButton("Save", valid && !busy, compact = true, fillWidth = false, action = save)
    }
}
