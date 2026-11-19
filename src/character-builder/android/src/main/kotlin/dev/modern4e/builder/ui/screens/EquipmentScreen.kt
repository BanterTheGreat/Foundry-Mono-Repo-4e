package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.theme.*
import kotlinx.coroutines.launch

/** Shows the four optional equipped selections and opens a picker for each slot. */
@Composable
internal fun EquipmentScreen(state: BuilderState, model: BuilderSession) {
    var editing by remember(state.document.id) { mutableStateOf<EquipmentSlot?>(null) }
    var options by remember(state.document) { mutableStateOf<Map<EquipmentSlot, EquipmentOptions>>(emptyMap()) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(state.document, state.rules) {
        options = EquipmentSlot.entries.associateWith { model.equipmentOptions(it) }
    }

    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (options.isEmpty()) {
            LinearProgressIndicator(Modifier.fillMaxWidth())
        }
        options.values.flatMap { it.diagnostics }.map { it.message }.distinct().forEach {
            Text(it, color = Dim)
        }
        EquipmentSlot.entries.forEach { slot ->
            val slotOptions = options[slot]
            val selected = slotOptions?.selected
            val entry = slotOptions?.selectedEntry?.entry
            val ineligible = entry != null && !entry.meetsEquipmentProficiencyRequirement(state.rules.equipmentProficiencies.keys)
            var expanded by remember(slot, selected) { mutableStateOf(false) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field(
                    slot.title,
                    entry?.presentation?.title ?: selected?.selection?.savedTitle ?: "Choose…",
                    Modifier.weight(1f),
                    enabled = !model.busy && slotOptions != null,
                    compact = true,
                    valueIsHint = selected == null,
                    invalid = ineligible,
                ) { editing = slot }
                if (selected != null) {
                    TextButton(
                        onClick = { expanded = !expanded },
                        contentPadding = PaddingValues(horizontal = 6.dp),
                    ) {
                        Text(if (expanded) "Hide stats" else "Stats", fontSize = 12.sp)
                    }
                }
            }
            if (ineligible) {
                Text("Requires proficiency", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
            }
            if (expanded) {
                PlainChoiceDescription(entry?.presentation?.description ?: "Equipment details unavailable.")
            }
        }
    }

    val slot = editing
    val slotOptions = options[slot]
    if (slot != null && slotOptions != null) {
        key(slot) {
            EquipmentPicker(slot, slotOptions, model.busy, dismiss = { editing = null }) { entry ->
                scope.launch {
                    model.run {
                        selectEquipment(slot, entry)
                        editing = null
                    }
                }
            }
        }
    }
}

internal data class EquipmentPickerRow(val option: ResolvedEntry, val eligible: Boolean)

/** Groups all options by their authored category, with eligible and ineligible items in the same section. */
internal fun equipmentPickerSections(slot: EquipmentSlot, options: EquipmentOptions): List<ListSection<EquipmentPickerRow>> {
    val headings = when (slot) {
        EquipmentSlot.WEAPON_ONE, EquipmentSlot.WEAPON_TWO -> listOf(
            "SIMPLE" to "Simple", "MARTIAL" to "Martial", "MILITARY" to "Military",
            "SUPERIOR" to "Superior", "IMPROVISED" to "Improvised", "OTHER" to "Other Weapons",
        )
        EquipmentSlot.ARMOR -> listOf("LIGHT" to "Light Armor", "HEAVY" to "Heavy Armor", "OTHER" to "Other Armor")
        EquipmentSlot.SHIELD -> listOf("SHIELD" to "Shields")
    }
    val rows = options.eligible.map { EquipmentPickerRow(it, eligible = true) } +
        options.ineligible.map { EquipmentPickerRow(it, eligible = false) }
    val sectionKeys = headings.mapTo(mutableSetOf()) { it.first }
    val sections = rows.groupBy { row ->
        val profile = row.option.entry.equipmentProfile
        val key = when (slot) {
            EquipmentSlot.WEAPON_ONE, EquipmentSlot.WEAPON_TWO -> profile?.equipmentString("proficiencyCategory")
            EquipmentSlot.ARMOR -> profile?.equipmentString("armorCategory")
            EquipmentSlot.SHIELD -> "SHIELD"
        }
        if (key != null && key in sectionKeys) key else "OTHER"
    }
    return headings.mapNotNull { (key, title) ->
        sections[key]?.let { ListSection(key, title, it.sortedBy { row -> row.option.entry.presentation.title.lowercase() }) }
    }
}

/** Uses the sectioned collapsible picker to inspect and stage equipment changes. */
@Composable
private fun EquipmentPicker(
    slot: EquipmentSlot,
    options: EquipmentOptions,
    busy: Boolean,
    dismiss: () -> Unit,
    save: (ResolvedEntry?) -> Unit,
) {
    val saved = options.selectedEntry
    var draft by remember { mutableStateOf(saved) }
    var expanded by remember { mutableStateOf(saved?.entry?.id) }
    var clearing by remember { mutableStateOf(false) }
    val sections = remember(slot, options) { equipmentPickerSections(slot, options) }
    ChoicePickerSheet(busy, dismiss) {
        SectionedChoiceList(
            sections,
            rowKey = { it.option.entry.id },
            modifier = Modifier.weight(1f),
            footer = if (sections.isEmpty()) {
                { Text("No available options in the installed content.", color = Dim) }
            } else {
                null
            },
        ) { row ->
            val entry = row.option.entry
            ChoiceCard(
                entry.presentation.title, chosen = draft?.entry?.id == entry.id, expanded = expanded == entry.id,
                enabled = !busy, badge = null, compact = true,
                titleColor = if (row.eligible) Ink else MaterialTheme.colorScheme.error,
                click = {
                    if (row.eligible) {
                        expanded = choiceExpansionOnTap(entry.id, draft?.entry?.id, expanded)
                        draft = row.option
                        clearing = false
                    } else {
                        expanded = if (expanded == entry.id) null else entry.id
                    }
                },
            ) {
                if (!row.eligible) {
                    Text("Requires proficiency", fontSize = 12.sp, color = Dim)
                }
                PlainChoiceDescription(entry.presentation.description)
            }
        }
        val clear: (() -> Unit)? = if (options.selected != null && !clearing) {
            { draft = null; clearing = true; expanded = null }
        } else {
            null
        }
        ChoicePickerActions(busy, clearing || draft?.entry?.id != saved?.entry?.id, dismiss, clear) { save(draft) }
    }
}
