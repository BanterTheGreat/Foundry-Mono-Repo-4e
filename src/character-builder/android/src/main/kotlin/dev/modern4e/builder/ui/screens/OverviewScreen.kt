package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

private fun Int.signed() = if (this >= 0) "+$this" else toString()

/** The About tab: identity, level, speed, languages and notes. */
@Composable
internal fun Overview(state: BuilderState, model: BuilderSession) {
    val document = state.document
    val identity = document.identity
    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(Modifier.weight(1f).fillMaxHeight().heightIn(min = 104.dp), shape = RoundedCornerShape(3.dp), color = Wash, border = BorderStroke(1.dp, Line)) {
                Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.Center) {
                    Text("Level ${document.level}", fontFamily = FontFamily.Serif, fontSize = 38.sp, color = Accent,
                        modifier = Modifier.clickable { model.page = "progression" })
                    Row(Modifier.fillMaxWidth().padding(top = 7.dp), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Speed ${state.rules.speedDisplay()}", fontSize = 12.sp, color = Dim, modifier = Modifier.weight(1f))
                        Text(identity.size.ifBlank { "Size —" }, fontSize = 12.sp, color = Dim, textAlign = TextAlign.End,
                            modifier = Modifier.weight(1f).clickable(enabled = !model.busy) { model.beginEdit("Size") }
                                .semantics { contentDescription = "Edit Size" })
                    }
                }
            }
            Surface(Modifier.width(96.dp).fillMaxHeight().heightIn(min = 104.dp).semantics { contentDescription = "Character portrait placeholder" },
                color = Wash, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(3.dp)) {
                Column(verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("♙", fontSize = 40.sp, color = Dim)
                    Text("PORTRAIT", fontSize = 9.sp, letterSpacing = 1.sp, color = Dim)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.height(IntrinsicSize.Min)) {
            listOf("Gender" to identity.gender, "Age" to identity.age, "Deity" to identity.deity).forEach { (label, value) ->
                Field(label, value.ifBlank { "—" }, Modifier.weight(1f).fillMaxHeight(), !model.busy) { model.beginEdit(label) }
            }
        }
        Field("Languages", state.rules.languageNames().plus(identity.languages.trim()).filter { it.isNotEmpty() }
            .joinToString(", ").ifBlank { "—" }, enabled = !model.busy) { model.beginEdit("Languages") }
        Heading("Notes")
        Surface(color = Wash, border = BorderStroke(1.dp, Line), modifier = Modifier.fillMaxWidth()
            .clickable(enabled = !model.busy) { model.beginEdit("Notes") }.semantics { contentDescription = "Edit notes" }) {
            Text(identity.notes.ifBlank { "Your story, connections, reminders…" }, fontFamily = FontFamily.Serif,
                fontStyle = FontStyle.Italic, lineHeight = 24.sp, modifier = Modifier.heightIn(min = 96.dp).padding(16.dp))
        }
    }
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
    val titles = choices.flatMap { it.values }.associate { it.id to it.title }
    return facts.filter { it.kind == FactKind.LANGUAGE && it.targetId == null }.map { it.value }.distinct().map { id ->
        titles[id] ?: id.split('_').joinToString(" ") { it.readable() }
    }
}

internal fun ContractResult<CalculatedValue>.display(signed: Boolean = false): String = when (this) {
    is ContractResult.Available -> if (signed) value.total.signed() else value.total.toString()
    is ContractResult.Unavailable -> "Unavailable"
}
