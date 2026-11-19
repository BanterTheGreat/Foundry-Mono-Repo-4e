package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

private fun Int.signed() = if (this >= 0) "+$this" else toString()

/** The About tab shows identity, languages, abilities, proficiencies and notes. */
@Composable
internal fun Overview(state: BuilderState, model: BuilderSession) {
    val document = state.document
    val identity = document.identity
    val canEdit = !model.busy
    val largeText = LocalConfiguration.current.fontScale > 1.2f
    val details = listOf("Gender" to identity.gender, "Age" to identity.age, "Deity" to identity.deity)
    Column(
        Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Surface(Modifier.weight(1f).fillMaxHeight(), color = Wash, border = BorderStroke(1.dp, Line)) {
                Column {
                    Box(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            .clickable(enabled = canEdit) { model.beginLevelChange() }
                            .semantics { contentDescription = "Change level, currently ${document.level}" }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(
                            "Level ${document.level}", color = Accent, fontFamily = FontFamily.Serif,
                            fontSize = 22.sp, lineHeight = 24.sp,
                        )
                    }
                    HorizontalDivider(color = Line)
                    Row(
                        Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(start = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Speed ${state.rules.speedDisplay()}", color = Dim, fontSize = 12.sp, lineHeight = 15.sp,
                            modifier = Modifier.weight(1f),
                        )
                        Box(
                            Modifier.weight(1f).heightIn(min = 48.dp).fillMaxHeight()
                                .clickable(enabled = canEdit) { model.beginEdit("Size") }
                                .semantics { contentDescription = "Edit Size" }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            contentAlignment = Alignment.CenterEnd,
                        ) {
                            Text(state.sizeDisplay(), color = Dim, fontSize = 12.sp,
                                lineHeight = 15.sp, textAlign = TextAlign.End)
                        }
                    }
                }
            }
            PortraitPanel(model, document.id, Modifier.width(78.dp).fillMaxHeight())
        }
        details.chunked(if (largeText) 1 else 3).forEach { row ->
            Row(
                Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                row.forEach { (label, value) ->
                    Field(label, value.ifBlank { "—" }, Modifier.weight(1f).heightIn(min = 48.dp).fillMaxHeight(),
                        enabled = canEdit, compact = true) { model.beginEdit(label) }
                }
            }
        }
        Surface(Modifier.fillMaxWidth().heightIn(min = 48.dp), color = Paper, border = BorderStroke(1.dp, Line)) {
            FolioFieldContent("Languages", state.languageDisplay(), compact = true)
        }
        AboutProficiencies(state)
        Field(
            "Notes",
            identity.notes.ifBlank { "Your story, connections, reminders…" },
            Modifier.padding(top = 4.dp).heightIn(min = 48.dp),
            enabled = canEdit,
            compact = true,
            valueIsHint = identity.notes.isBlank(),
        ) { model.beginEdit("Notes") }
    }
}

/** Uses the authored creation ancestry size when no saved size override exists. */
internal fun BuilderState.sizeDisplay(): String =
    document.identity.size.ifBlank {
        rules.entries.firstOrNull {
            it.slot == ChoiceSlotId("creation", "ancestry", 0) && it.definition.entry.category == EntryCategory.ANCESTRY
        }?.definition?.entry?.mechanics?.size?.name?.readable() ?: "Size —"
    }

/**
 * Base speed comes from the ancestry alone, so it has no value until one is selected.
 *
 * @return the computed speed, or a dash while it has no source.
 */
internal fun EngineResult.speedDisplay(): String =
    (statistics[ModifierTarget(Statistic.SPEED)]?.value as? ContractResult.Available)?.value?.total?.toString() ?: "—"

/**
 * Character-wide languages learned from ancestry grants and language decisions, in acquisition order.
 *
 * @return display titles without duplicates; power- or entry-scoped facts are excluded.
 */
internal fun EngineResult.languageNames(): List<String> {
    val titles = choices.filter { it.valueKind == FactKind.LANGUAGE }.flatMap { it.values }.associate { it.id to it.title }
    return facts.filter { it.kind == FactKind.LANGUAGE && it.targetId == null }.map { it.value }.distinct().map { id ->
        titles[id] ?: id.split('_').joinToString(" ") { it.readable() }
    }
}

/** Display current rules facts independently of any legacy free-text languages. */
internal fun BuilderState.languageDisplay(): String =
    rules.languageNames().joinToString(", ").ifBlank { "—" }

internal fun ContractResult<CalculatedValue>.display(signed: Boolean = false): String = when (this) {
    is ContractResult.Available -> if (signed) value.total.signed() else value.total.toString()
    is ContractResult.Unavailable -> "Unavailable"
}
