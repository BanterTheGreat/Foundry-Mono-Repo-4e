package dev.modern4e.builder.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
internal fun classPickerSections(options: PickerOptions.Ready): List<ListSection<BuilderOptionRow>> {
    val visible = options.visible
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
    taken: Set<String> = emptySet(),
    choose: (BuilderOption) -> Unit,
) {
    val sections = remember(options) { classPickerSections(options) }
    val blocked = remember(options.ineligible) { options.ineligible.map { it.metadata.metadata.id }.toSet() }
    SectionedChoiceList(
        sections,
        rowKey = { it.metadata.metadata.id },
        modifier = modifier,
        footer = {
            if (sections.isEmpty()) {
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
            row.metadata.metadata.title, selected == id, expanded == id,
            option != null, badge, { option?.let(choose) },
            compact = true, titleColor = if (ineligible) MaterialTheme.colorScheme.error else Ink,
            badgeWidth = 64.dp, badgeColor = Ink,
        ) {
            if (option != null) {
                ControlledDescription(option.entry.entry.presentation.description, compact = true)
            }
        }
    }
}
