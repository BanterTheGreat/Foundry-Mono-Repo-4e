package dev.modern4e.builder.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.BuilderOption
import dev.modern4e.builder.BuilderOptionRow
import dev.modern4e.builder.PickerOptions
import dev.modern4e.builder.readable
import dev.modern4e.builder.ui.theme.Dim
import dev.modern4e.builder.ui.theme.Ink

private val classRoles = listOf("CONTROLLER", "DEFENDER", "LEADER", "STRIKER", "UNCLASSIFIED")

/** Groups visible choices by role and sorts names within each role. */
internal fun classPickerSections(options: PickerOptions.Ready, showIneligible: Boolean): List<ListSection<BuilderOptionRow>> {
    val visible = if (showIneligible) options.eligible + options.ineligible else options.eligible
    val byRole = visible.groupBy { row ->
        row.option?.entry?.entry?.mechanics?.classProfile?.role ?: "UNCLASSIFIED"
    }
    return classRoles.mapNotNull { role ->
        byRole[role]?.let { rows ->
            ListSection(role, role.readable(), rows.sortedBy { it.metadata.metadata.title.lowercase() })
        }
    }
}

/** A new pick expands its row. Tapping the selected row toggles its details. */
internal fun choiceExpansionOnTap(id: String, selected: String?, expanded: String?): String? =
    id.takeUnless { it == selected && it == expanded }

/** Presents the same class choices in creation and Progression while callers own the draft. */
@Composable
internal fun ClassPicker(
    options: PickerOptions.Ready,
    selected: String?,
    expanded: String?,
    modifier: Modifier = Modifier,
    showIneligible: Boolean = false,
    taken: Set<String> = emptySet(),
    toggleIneligible: () -> Unit = {},
    choose: (BuilderOption) -> Unit,
) {
    val sections = remember(options, showIneligible) { classPickerSections(options, showIneligible) }
    val blocked = remember(options.ineligible) { options.ineligible.map { it.metadata.metadata.id }.toSet() }
    SectionedChoiceList(
        sections,
        rowKey = { it.metadata.metadata.id },
        modifier = modifier,
        footer = {
            if (blocked.isNotEmpty()) {
                TextButton(toggleIneligible) {
                    Text(if (showIneligible) "Hide ineligible" else "Show ${blocked.size} ineligible")
                }
            } else if (sections.isEmpty()) {
                Text("No available classes in the installed content.", color = Dim)
            }
        },
    ) { row ->
        val id = row.metadata.metadata.id
        val option = row.option
        val entry = option?.entry?.entry
        val ineligible = id in blocked
        val badge = entry?.mechanics?.classProfile?.powerSources?.joinToString(" + ") { it.readable() }
        ChoiceCard(
            row.metadata.metadata.title, selected == id, expanded == id || ineligible,
            option != null, badge, { option?.let(choose) },
            compact = true, titleColor = if (ineligible) MaterialTheme.colorScheme.error else Ink,
            badgeWidth = 64.dp, badgeColor = Ink,
        ) {
            when {
                option == null -> Text(
                    row.diagnostics.joinToString { it.message }.ifBlank { "Definition is unavailable." },
                    fontSize = 12.sp, color = Dim,
                )
                ineligible -> Text(
                    if (id in taken) "Already chosen"
                    else option.diagnostics.joinToString { it.message }.ifBlank { "Ineligible" },
                    fontSize = 12.sp, lineHeight = 15.sp, color = Dim,
                )
                else -> ControlledDescription(option.entry.entry.presentation.description, compact = true)
            }
        }
    }
}
