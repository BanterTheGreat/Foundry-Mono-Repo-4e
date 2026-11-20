package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.theme.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

/** Known rituals and formulas use compact fields and expandable, folio-style cards. */
@Composable
internal fun CraftKnowledgeSection(state: BuilderState, model: BuilderSession) {
    val access = remember(state) { state.craftKnowledgeAccess() }
    val kinds = CraftKnowledgeKind.entries.filter { kind ->
        access.shows(kind) || state.document.craftKnowledge.any { kind.matches(it.entryId) }
    }
    if (kinds.isEmpty()) {
        return
    }
    val entries by produceState<List<ContentEntry>?>(null, state.document.id, state.document.packages) {
        value = model.craftKnowledgeEntries().sortedBy { it.presentation.title.lowercase() }
    }
    var editing by remember(state.document.id) { mutableStateOf<CraftKnowledgeKind?>(null) }
    val scope = rememberCoroutineScope()
    for (kind in kinds) {
        val saved = state.document.craftKnowledge.filter { kind.matches(it.entryId) }
        val granted = if (kind == CraftKnowledgeKind.RITUAL) access.grantedRituals else emptySet()
        val catalog = entries.orEmpty().filter { kind.matches(it.id) }
        val known = saved.map { it.entryId }.toSet() + granted
        Spacer(Modifier.height(8.dp))
        Field(kind.title, if (known.isEmpty()) "Edit ›" else "${known.size} known · Edit ›", compact = true,
            leftAccent = Accent) {
            editing = kind
        }
        var expanded by remember(state.document.id, kind) { mutableStateOf<String?>(null) }
        catalog.filter { it.id in known }.forEach { entry ->
            val open = expanded == entry.id
            ChoiceCard(entry.presentation.title, false, open, true, entry.craftData("level").takeIf(String::isNotBlank),
                click = { expanded = if (open) null else entry.id }, compact = true) {
                CraftKnowledgeDetails(entry, state.document.level)
                if (entry.id in granted) {
                    Text("Granted", color = Dim, fontSize = 12.sp)
                }
            }
        }
        saved.filter { selection -> entries != null && catalog.none { it.id == selection.entryId } }.forEach {
            PlainChoiceDescription("${it.savedTitle} · Unavailable")
        }
        if (editing == kind) {
            val selected = saved.map { it.entryId }.toSet()
            val eligible = catalog.filter { access.canLearn(kind, it) || it.id in known }
            CraftKnowledgePicker(kind, eligible, selected, granted, entries == null, state.document.level,
                access.hasBardPick && eligible.none { it.craftData("keywords").contains("bard", ignoreCase = true) },
                dismiss = { editing = null },
                save = { draft ->
                    editing = null
                    scope.launch { model.edit(BuilderEdit.CraftKnowledge(kind, draft)) }
                })
        }
    }
}

@Composable
private fun CraftKnowledgePicker(
    kind: CraftKnowledgeKind,
    entries: List<ContentEntry>,
    selected: Set<String>,
    granted: Set<String>,
    loading: Boolean,
    level: Int,
    missingBardRitual: Boolean,
    dismiss: () -> Unit,
    save: (Set<String>) -> Unit,
) {
    var draft by remember(kind, selected) { mutableStateOf(selected) }
    var query by remember(kind) { mutableStateOf("") }
    var inspected by remember(kind) { mutableStateOf<String?>(null) }
    val shown = entries.filter { it.presentation.title.contains(query.trim(), ignoreCase = true) }
    ChoicePickerSheet(busy = false, dismiss = dismiss) {
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(bottom = 6.dp),
            placeholder = { Text("Search ${kind.title.lowercase()}") }, singleLine = true)
        if (kind == CraftKnowledgeKind.RITUAL && missingBardRitual && !loading) {
            PlainChoiceDescription("The Bard still has a choice for a level 1 ritual with the Bard trait.")
        }
        CollapsibleChoiceList(Modifier.weight(1f)) {
            if (loading || shown.isEmpty()) {
                item { Text(if (loading) "Loading…" else "No matching entries", color = Dim) }
            }
            items(shown, key = { it.id }) { entry ->
                val fixed = entry.id in granted
                val checked = entry.id in draft || fixed
                ChoiceCard(entry.presentation.title, checked, inspected == entry.id, true,
                    entry.craftData("level").takeIf(String::isNotBlank),
                    click = { inspected = if (inspected == entry.id) null else entry.id }, compact = true) {
                    CraftKnowledgeDetails(entry, level)
                    if (!fixed) {
                        FolioButton(if (checked) "Remove" else "Learn", true, outlined = true, compact = true) {
                            draft = if (checked) draft - entry.id else draft + entry.id
                        }
                    } else {
                        Text("Granted", color = Dim, fontSize = 12.sp)
                    }
                }
            }
            items(selected.filter { id -> entries.none { it.id == id } }, key = { it }) { id ->
                if (id in draft) {
                    FolioTextButton("Remove unavailable entry") { draft = draft - id }
                }
            }
        }
        ChoicePickerActions(false, !loading && draft != selected, dismiss, null) { save(draft) }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun CraftKnowledgeDetails(entry: ContentEntry, level: Int) {
    val formula = CraftKnowledgeKind.FORMULA.matches(entry.id)
    val category = if (formula) "Alchemical" else entry.craftData("category")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        KnowledgeTag(category, Ink, Paper, emphasized = true)
        KnowledgeTag(entry.craftData("keywords"), Wash, Dim)
    }
    val variants = entry.sharedData?.get("variants") as? JsonArray
    val available = variants.orEmpty().mapNotNull { variant ->
        val data = variant as? JsonObject ?: return@mapNotNull null
        val rank = (data["level"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
        val cost = (data["cost"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        (rank to cost).takeIf { rank <= level }
    }
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            KnowledgeFact("Time", entry.craftData("time"))
            KnowledgeFact("Duration", entry.craftData("duration"))
            KnowledgeFact("Focus", entry.craftData("focus"))
        }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (formula) {
                KnowledgeFact("Formula price", entry.craftData("formulaCost"), TextAlign.End)
                val costs = available.joinToString("\n") { (rank, cost) ->
                    if (available.size == 1) cost else "Level $rank · $cost"
                }
                KnowledgeFact("Reagents", costs, TextAlign.End)
            } else {
                KnowledgeFact("Market price", entry.craftData("marketPrice"), TextAlign.End)
                KnowledgeFact("Cost", entry.craftData("cost"), TextAlign.End)
            }
        }
    }
    val html = entry.craftData("rulesHtml")
    if (html.isBlank()) {
        PlainChoiceDescription(entry.presentation.description)
    } else {
        ControlledDescription(html, compact = true)
    }
}

@Composable
private fun KnowledgeTag(value: String, background: Color, foreground: Color, emphasized: Boolean = false) {
    if (value.isNotBlank()) {
        Surface(color = background) {
            Text(value, Modifier.padding(horizontal = 6.dp, vertical = 2.dp), color = foreground,
                fontSize = if (emphasized) 12.sp else 11.sp,
                fontWeight = if (emphasized) FontWeight.SemiBold else FontWeight.Normal)
        }
    }
}

@Composable
private fun KnowledgeFact(label: String, value: String, alignment: TextAlign = TextAlign.Start) {
    if (value.isNotBlank()) {
        Column(Modifier.fillMaxWidth()) {
            Text(label, Modifier.fillMaxWidth(), color = Dim, fontSize = 10.sp, lineHeight = 12.sp, textAlign = alignment)
            Text(value, Modifier.fillMaxWidth(), color = Ink, fontSize = 12.sp, lineHeight = 15.sp, textAlign = alignment)
        }
    }
}

private fun ContentEntry.craftData(key: String): String = when (val value = sharedData?.get(key)) {
    is JsonArray -> value.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString(", ")
    is JsonPrimitive -> value.contentOrNull.orEmpty()
    else -> ""
}
