package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.theme.*
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/** Shows the optional equipped selections and opens a picker for each slot. */
@Composable
internal fun EquippedItems(state: BuilderState, model: BuilderSession) {
    var editing by remember(state.document.id) { mutableStateOf<EquipmentSlot?>(null) }
    // The last options stay up while the next are read, so an edit never blanks every slot; only another character clears them.
    var options by remember(state.document.id) { mutableStateOf<Map<EquipmentSlot, EquipmentOptions>>(emptyMap()) }
    var optionsFor by remember(state.document.id) { mutableStateOf<CharacterDocument?>(null) }
    val shownValues = remember(state.document.id) { mutableMapOf<EquipmentSlot, String?>() }
    val configuration = LocalConfiguration.current
    val slotsPerRow = if (configuration.screenWidthDp < 320 || configuration.fontScale > 1.2f) 1 else 2
    LaunchedEffect(state.document, state.rules) {
        val document = state.document
        options = EquipmentSlot.entries.associateWith { model.equipmentOptions(it) }
        optionsFor = document
    }
    val fresh = optionsFor == state.document

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (options.isEmpty()) {
            LinearProgressIndicator(Modifier.fillMaxWidth())
        }
        options.values.flatMap { it.diagnostics }.map { it.message }.distinct().forEach {
            Text(it, color = Dim)
        }
        EquipmentSlot.entries.chunked(slotsPerRow).forEach { slots ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                slots.forEach { slot ->
                    val slotOptions = options[slot]
                    val selected = slotOptions?.selected
                    val entry = slotOptions?.selectedEntry?.entry
                    val linked = slotOptions?.linkedWeapons?.firstOrNull { it.selection.instanceId == selected?.instanceId }
                    val ineligible = linked?.let { !it.eligible }
                        ?: (entry?.meetsEquipmentProficiencyRequirement(state.rules.equipmentProficiencies.keys) == false)
                    val title = entry?.presentation?.title ?: selected?.selection?.savedTitle
                    val saved = if (linked == null) title else "$title (${linked.slot.title})"
                    // A submitted change shows ahead of its commit, as it does on Levels.
                    val pending = model.pendingSelection(slot.pendingSlot)
                    val saving = model.isSaving(slot)
                    val computed = if (pending != null) pending.title else saved
                    // Between a commit and the re-read options, keep showing what the pending change showed.
                    val value = if ((fresh || pending != null || !shownValues.containsKey(slot))) {
                        computed.also { shownValues[slot] = it }
                    } else {
                        shownValues[slot]
                    }
                    LevelChoice(slot.title, value ?: ChoosePlaceholder, Modifier.weight(1f).fillMaxHeight(),
                        enabled = !model.busy && slotOptions != null, invalid = ineligible, saving = saving) { editing = slot }
                }
            }
        }
    }

    val slot = editing
    val slotOptions = options[slot]
    if (slot != null && slotOptions != null) {
        key(slot) {
            EquipmentPicker(slot, slotOptions, model.busy, dismiss = { editing = null }) { row ->
                // The session stores it in the background, so the sheet closes at once like every other choice.
                model.submitEquipment(slot, row?.option, row?.weapon?.selection?.instanceId,
                    acceptIneligible = row?.eligible == false)
                editing = null
            }
        }
    }
}

internal data class EquipmentPickerRow(
    val option: ResolvedEntry,
    val eligible: Boolean,
    val weapon: EquippedImplementWeapon? = null,
) {
    val key get() = weapon?.selection?.instanceId ?: option.entry.id
    val title get() = weapon?.let { "${option.entry.presentation.title} (${it.slot.title})" } ?: option.entry.presentation.title
}

/** Group authored categories, ordering armor by AC contribution and other equipment by name. */
internal fun equipmentPickerSections(slot: EquipmentSlot, options: EquipmentOptions): List<ListSection<EquipmentPickerRow>> {
    val headings = when (slot) {
        EquipmentSlot.WEAPON_ONE, EquipmentSlot.WEAPON_TWO -> listOf(
            "SIMPLE" to "Simple", "MARTIAL" to "Martial", "MILITARY" to "Military",
            "SUPERIOR" to "Superior", "IMPROVISED" to "Improvised", "OTHER" to "Other Weapons",
        )
        EquipmentSlot.ARMOR -> listOf("LIGHT" to "Light Armor", "HEAVY" to "Heavy Armor", "OTHER" to "Other Armor")
        EquipmentSlot.SHIELD -> listOf("SHIELD" to "Shields")
        EquipmentSlot.IMPLEMENT -> listOf("LINKED" to "Equipped Weapons", "IMPLEMENT" to "Implements")
    }
    val rows = options.eligible.map { EquipmentPickerRow(it, eligible = true) } +
        options.ineligible.map { EquipmentPickerRow(it, eligible = false) } +
        options.linkedWeapons.map { EquipmentPickerRow(it.definition, it.eligible, weapon = it) }
    val sectionKeys = headings.mapTo(mutableSetOf()) { it.first }
    val sections = rows.groupBy { row ->
        val profile = row.option.entry.equipmentProfile
        val key = when (slot) {
            EquipmentSlot.WEAPON_ONE, EquipmentSlot.WEAPON_TWO -> profile?.equipmentString("proficiencyCategory")
            EquipmentSlot.ARMOR -> profile?.equipmentString("armorCategory")
            EquipmentSlot.SHIELD -> "SHIELD"
            EquipmentSlot.IMPLEMENT -> if (row.weapon != null) "LINKED" else "IMPLEMENT"
        }
        if (key != null && key in sectionKeys) key else "OTHER"
    }
    val order = if (slot == EquipmentSlot.ARMOR) {
        compareBy<EquipmentPickerRow> { it.armorBonus() == null }
            .thenBy { it.armorBonus() ?: 0 }
            .thenBy { it.option.entry.presentation.title.lowercase() }
            .thenBy { it.option.entry.id }
    } else {
        compareBy { row: EquipmentPickerRow -> row.option.entry.presentation.title.lowercase() }
    }
    return headings.mapNotNull { (key, title) ->
        sections[key]?.let { ListSection(key, title, it.sortedWith(order)) }
    }
}

/** Missing armor data stays at the end of its authored category. */
private fun EquipmentPickerRow.armorBonus(): Int? =
    (option.entry.equipmentProfile?.get("armorBonus") as? JsonPrimitive)?.intOrNull

/** Uses the sectioned collapsible picker to inspect and stage equipment changes. */
@Composable
private fun EquipmentPicker(
    slot: EquipmentSlot,
    options: EquipmentOptions,
    busy: Boolean,
    dismiss: () -> Unit,
    save: (EquipmentPickerRow?) -> Unit,
) {
    val sections = remember(slot, options) { equipmentPickerSections(slot, options) }
    val savedKey = options.selected?.takeIf { slot == EquipmentSlot.IMPLEMENT && it.isLinkedImplement }?.instanceId
        ?: options.selectedEntry?.entry?.id
    val saved = sections.asSequence().flatMap { it.rows.asSequence() }.firstOrNull { it.key == savedKey }
    var draft by remember { mutableStateOf(saved) }
    var expanded by remember { mutableStateOf(saved?.key) }
    var clearing by remember { mutableStateOf(false) }
    ChoicePickerSheet(busy, dismiss) {
        SectionedChoiceList(
            sections,
            rowKey = { it.key },
            modifier = Modifier.weight(1f),
            footer = if (sections.isEmpty()) {
                { Text("No available options in the installed content.", color = Dim) }
            } else {
                null
            },
        ) { row ->
            val entry = row.option.entry
            ChoiceCard(
                row.title, chosen = draft?.key == row.key, expanded = expanded == row.key,
                enabled = !busy, badge = null, compact = true,
                titleColor = if (row.eligible) Ink else MaterialTheme.colorScheme.error,
                click = {
                    expanded = choiceExpansionOnTap(row.key, draft?.key, expanded)
                    draft = row
                    clearing = false
                },
            ) {
                PlainChoiceDescription(entry.presentation.description)
            }
        }
        val clear: (() -> Unit)? = if (options.selected != null && !clearing) {
            { draft = null; clearing = true; expanded = null }
        } else {
            null
        }
        ChoicePickerActions(busy, clearing || draft?.key != saved?.key, dismiss, clear) { save(draft) }
    }
}
