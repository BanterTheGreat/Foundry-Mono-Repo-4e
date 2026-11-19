package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.BuilderSession
import dev.modern4e.builder.BuilderState
import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.SavedSelection
import dev.modern4e.builder.folioScroll
import dev.modern4e.builder.ui.components.Heading
import dev.modern4e.builder.ui.theme.Dim
import dev.modern4e.builder.ui.theme.Ink
import dev.modern4e.builder.ui.theme.Line
import dev.modern4e.builder.ui.theme.Paper

/** Displays the character's powers without opening a choice editor. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CurrentPowersSheet(state: BuilderState, model: BuilderSession, dismiss: () -> Unit) {
    val saved = remember(state.document) { laterPowerSelections(state.document) }
    val resolved by produceState<Map<SavedSelection, ContentEntry>?>(null, model, saved) {
        value = if (saved.isEmpty()) emptyMap() else model.resolveSavedPowerEntries(saved)
    }
    val powers = remember(state, resolved) { currentPowers(state, resolved) }
    var expanded by remember(state.document.id) { mutableStateOf<CurrentPower?>(null) }
    val scroll = rememberLazyListState()
    ModalBottomSheet(onDismissRequest = dismiss, containerColor = Paper,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().height(pickerSheetHeight(LocalConfiguration.current.screenHeightDp))
            .padding(horizontal = 20.dp)) {
            Heading("Current powers")
            LazyColumn(Modifier.weight(1f).folioScroll(scroll).padding(top = 8.dp), state = scroll,
                verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(powers, key = { it.slot.toString() }) { power ->
                    Surface(onClick = { expanded = if (expanded == power) null else power },
                        modifier = Modifier.fillMaxWidth(), enabled = power.entry != null,
                        color = Paper, border = BorderStroke(1.dp, Line)) {
                        Column(Modifier.padding(horizontal = 13.dp, vertical = 7.dp)) {
                            Text(power.title, color = Ink, fontFamily = FontFamily.Serif, fontSize = 15.sp)
                            val details = listOfNotNull(power.entry?.let(::powerChoiceUsage), power.note)
                            if (details.isNotEmpty()) {
                                Text(details.joinToString(" · "), color = Dim, fontSize = 12.sp)
                            }
                            if (expanded == power && power.entry != null) {
                                PowerBlock(power.entry, showTitle = false)
                            }
                        }
                    }
                }
                if (saved.isNotEmpty() && resolved == null) {
                    item { Text("Loading saved powers…", color = Dim) }
                } else if (powers.isEmpty()) {
                    item { Text("No current powers.", color = Dim) }
                }
            }
        }
    }
}
