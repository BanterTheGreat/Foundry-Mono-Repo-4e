package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.BuilderSession
import dev.modern4e.builder.BuilderState
import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.SavedSelection
import dev.modern4e.builder.ui.theme.Accent
import dev.modern4e.builder.ui.theme.Dim
import dev.modern4e.builder.ui.theme.Ink
import dev.modern4e.builder.ui.theme.Line
import dev.modern4e.builder.ui.theme.Paper
import dev.modern4e.builder.ui.theme.Wash

/** Shows current power totals and opens the corresponding usage list from each tile. */
@Composable
internal fun CurrentPowerTally(state: BuilderState, model: BuilderSession, columns: Int) {
    val saved = remember(state.document) { laterPowerSelections(state.document) }
    val resolved by produceState<Map<SavedSelection, ContentEntry>?>(null, model, state.document, saved) {
        value = null
        value = if (saved.isEmpty()) emptyMap() else model.resolveSavedPowerEntries(saved)
    }
    val powers = remember(state, resolved) { currentPowers(state, resolved).byUsage() }
    val loading = saved.isNotEmpty() && resolved == null
    var selected by remember(state.document.id) { mutableStateOf<CurrentPowerUsage?>(null) }
    CurrentPowerUsage.entries.filter { it != CurrentPowerUsage.UNSPECIFIED || it in powers }.chunked(columns).forEach { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            row.forEach { usage ->
                val color = powerChoiceColor(usage.label)
                val total = powers[usage].orEmpty().size
                Surface(onClick = { selected = usage }, modifier = Modifier.weight(1f),
                    color = Wash, border = BorderStroke(1.dp, color ?: Line)) {
                    Column(Modifier.padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(total.toString(), fontFamily = FontFamily.Serif, fontSize = 22.sp,
                            lineHeight = 24.sp, color = color ?: Accent)
                        Text(usage.label, fontSize = 10.sp, lineHeight = 13.sp, color = color ?: Dim)
                    }
                }
            }
        }
    }
    selected?.let { usage ->
        CurrentPowersSheet(usage, powers[usage].orEmpty(), loading, dismiss = { selected = null })
    }
}

/** Displays and expands the powers in one usage group. */
@Composable
private fun CurrentPowersSheet(usage: CurrentPowerUsage, powers: List<CurrentPower>, loading: Boolean, dismiss: () -> Unit) {
    var expanded by remember(usage) { mutableStateOf<CurrentPower?>(null) }
    ChoicePickerSheet(busy = false, dismiss = dismiss) {
        CollapsibleChoiceList(Modifier.weight(1f)) {
            items(powers, key = { it.slot.toString() }) { power ->
                Surface(onClick = { expanded = if (expanded == power) null else power },
                    modifier = Modifier.fillMaxWidth(), enabled = power.entry != null,
                    color = Paper, border = BorderStroke(1.dp, Line)) {
                    Column(Modifier.padding(horizontal = 13.dp, vertical = 7.dp)) {
                        Text(power.title, color = Ink, fontFamily = FontFamily.Serif, fontSize = 15.sp)
                        val utility = "Utility".takeIf { power.entry?.mechanics?.powerProfile?.powerKind == "UTILITY" }
                        val details = listOfNotNull(utility, power.note)
                        if (details.isNotEmpty()) {
                            Text(details.joinToString(" · "), color = Dim, fontSize = 12.sp)
                        }
                        if (expanded == power && power.entry != null) {
                            PowerBlock(power.entry, showTitle = false)
                        }
                    }
                }
            }
            if (loading) {
                item { Text("Loading saved powers…", color = Dim) }
            } else if (powers.isEmpty()) {
                item { Text("No current powers in this group.", color = Dim) }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = dismiss) { Text("Close") }
        }
    }
}
