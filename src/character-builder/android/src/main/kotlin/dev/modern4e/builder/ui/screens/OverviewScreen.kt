package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
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

@OptIn(ExperimentalLayoutApi::class)
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
                        val speed = state.rules.statistics[ModifierTarget(Statistic.SPEED)]?.value
                        Text("Speed ${speed?.display() ?: "—"}", fontSize = 12.sp, color = Dim, modifier = Modifier.weight(1f))
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
        Field("Languages", identity.languages.ifBlank { "—" }, enabled = !model.busy) { model.beginEdit("Languages") }
        Heading("Abilities")
        Ability.entries.chunked(if (LocalConfiguration.current.fontScale > 1.2f) 3 else 6).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                row.forEach { ability ->
                    val value = state.rules.statistics.getValue(ModifierTarget(Statistic.ABILITY_POINTS, ability = ability))
                    Surface(Modifier.weight(1f).semantics { contentDescription = "${ability.name.readable()}: ${value.value.display()}" },
                        color = Paper, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(2.dp)) {
                        Column(Modifier.padding(vertical = 8.dp, horizontal = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(ability.name.take(3), color = Dim, fontSize = 10.sp)
                            Text(value.value.display(), fontFamily = FontFamily.Serif, fontSize = 25.sp, color = Accent)
                        }
                    }
                }
            }
        }
        Heading("Proficient skills")
        if (state.rules.proficiencies.isEmpty()) {
            Text("No proficient skills", color = Dim)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            state.rules.proficiencies.keys.forEach { skill ->
                val value = state.rules.statistics.getValue(ModifierTarget(Statistic.SKILL_CHECK, skill = skill))
                Surface(color = Wash, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(3.dp)) {
                    Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(skill.name.readable(), fontSize = 13.sp)
                        Text(value.value.display(signed = true), color = Accent, fontSize = 13.sp)
                    }
                }
            }
        }
        Heading("Notes")
        Surface(color = Wash, border = BorderStroke(1.dp, Line), modifier = Modifier.fillMaxWidth()
            .clickable(enabled = !model.busy) { model.beginEdit("Notes") }.semantics { contentDescription = "Edit notes" }) {
            Text(identity.notes.ifBlank { "Your story, connections, reminders…" }, fontFamily = FontFamily.Serif,
                fontStyle = FontStyle.Italic, lineHeight = 24.sp, modifier = Modifier.heightIn(min = 96.dp).padding(16.dp))
        }
    }
}

private fun ContractResult<CalculatedValue>.display(signed: Boolean = false): String = when (this) {
    is ContractResult.Available -> if (signed) value.total.signed() else value.total.toString()
    is ContractResult.Unavailable -> "Unavailable"
}
