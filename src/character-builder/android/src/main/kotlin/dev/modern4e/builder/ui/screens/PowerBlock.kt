package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.ui.components.ControlledDescription
import dev.modern4e.builder.ui.theme.*

internal data class PowerRule(val label: String?, val text: String)
internal data class PowerPhase(val title: String?, val rules: List<PowerRule>)
internal data class PowerBlockText(
    val usage: String?,
    val action: String?,
    val range: String?,
    val flavor: String,
    val phases: List<PowerPhase>,
    val granted: List<Pair<String, PowerBlockText>> = emptyList(),
)

private val PowerHeader = Regex("""(?m)^\s*(AT_WILL|ENCOUNTER|DAILY) / ([A-Z_]+)[ \t]*$""")
private val GrantedPower = Regex("""(?m)^[ \t]*Grants:[ \t]+([^\r\n]+)(?=\s+(?:AT_WILL|ENCOUNTER|DAILY) / [A-Z_]+[ \t]*$)""")
private val RuleLabel = Regex("""^([\p{L}][\p{L}\p{N} ()'’/-]*):\s*(.*)$""")
private val LegacyMarkup = Regex("""</?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*|/?)>""")
private val RangeLine = Regex("""^(Melee|Ranged|Personal|Close|Area|Special|See|Aura)\b""", RegexOption.IGNORE_CASE)
private val AttackPhase = Regex("""^(Secondary|Tertiary) (?:Target|Attack)$""", RegexOption.IGNORE_CASE)

/** Reads the builder's authored plain-text format while keeping all rules in source order. */
internal fun powerBlockText(description: String): PowerBlockText? {
    if (LegacyMarkup.containsMatchIn(description)) {
        return null
    }
    val grants = GrantedPower.findAll(description).toList()
    val main = readPowerBlock(description.substring(0, grants.firstOrNull()?.range?.first ?: description.length))
    val granted = grants.mapIndexed { index, grant ->
        val end = grants.getOrNull(index + 1)?.range?.first ?: description.length
        grant.groupValues[1].trim() to readPowerBlock(description.substring(grant.range.last + 1, end))
    }
    return main.copy(granted = granted)
}

private fun readPowerBlock(description: String): PowerBlockText {
    val header = PowerHeader.find(description)
    val flavor = header?.let { description.substring(0, it.range.first).trim() }.orEmpty()
    val action = header?.groupValues?.get(2)?.lowercase()?.replace('_', ' ')?.replaceFirstChar { it.uppercaseChar() }
    val lines = description.substring(header?.range?.last?.plus(1) ?: 0).lineSequence()
        .map(String::trim).filter(String::isNotEmpty).toList()
    val range = lines.firstOrNull()?.takeIf { header != null && RangeLine.containsMatchIn(it) && !RuleLabel.matches(it) }
    val rules = (if (range == null) lines else lines.drop(1)).map { line ->
        val label = RuleLabel.matchEntire(line)
        PowerRule(label?.groupValues?.get(1), label?.groupValues?.get(2) ?: line)
    }
    val phases = mutableListOf<PowerPhase>()
    var title: String? = null
    var current = mutableListOf<PowerRule>()
    for (rule in rules) {
        val phase = rule.label?.let(AttackPhase::matchEntire)?.groupValues?.get(1)
        val nextTitle = phase?.lowercase()?.replaceFirstChar { it.uppercaseChar() }?.plus(" attack")
        if (nextTitle != null && nextTitle != title) {
            // An effect that explicitly starts this attack belongs at the start of its block.
            val leadIn = current.lastOrNull()?.takeIf {
                it.label.equals("Effect", ignoreCase = true) &&
                    Regex("""\bmake\b[^.!?]*\b${phase}\b[^.!?]*\battack\b""", RegexOption.IGNORE_CASE).containsMatchIn(it.text)
            }
            if (leadIn != null) {
                current.removeAt(current.lastIndex)
            }
            if (current.isNotEmpty()) {
                val hasAttack = current.any { it.label.equals("Primary Attack", true) || it.label.equals("Attack", true) }
                phases += PowerPhase(title ?: "Primary attack".takeIf { hasAttack }, current)
            }
            title = nextTitle
            current = listOfNotNull(leadIn).toMutableList()
        }
        current += rule
    }
    if (current.isNotEmpty()) {
        phases += PowerPhase(title ?: "Primary attack".takeIf { current.any { it.label.equals("Primary Attack", true) } }, current)
    }
    val usage = when (header?.groupValues?.get(1)) {
        "AT_WILL" -> "At-will"
        "ENCOUNTER" -> "Encounter"
        "DAILY" -> "Daily"
        else -> null
    }
    val actionLabel = when (action) {
        "Standard", "Minor", "Move", "Free" -> "$action action"
        else -> action
    }
    val labeledPhases = phases.map { phase ->
        val phaseTitle = phase.title
        if (phaseTitle != null && phaseTitle != "Primary attack" &&
            phase.rules.none { it.label.equals(phaseTitle, true) || it.label.equals("Attack", true) }) {
            phase.copy(title = phaseTitle.replace("attack", "target"))
        } else {
            phase
        }
    }
    return PowerBlockText(usage, actionLabel, range, flavor, labeledPhases)
}

/** Classic power card shared by the reader and expanded catalog rows. */
@Composable
internal fun PowerBlock(entry: ContentEntry, showTitle: Boolean = true) {
    val description = entry.presentation.description
    val block = remember(description) { powerBlockText(description) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PowerCard(entry.presentation.title.takeIf { showTitle }, powerChoiceUsage(entry) ?: block?.usage, block, description)
        block?.granted?.forEach { (title, granted) ->
            PowerCard(title, granted.usage, granted, "")
        }
    }
}

/** Draws one power and its attack stages. */
@Composable
private fun PowerCard(title: String?, usage: String?, block: PowerBlockText?, fallback: String) {
    val color = usage?.let(::powerChoiceColor) ?: Ink
    Surface(Modifier.fillMaxWidth(), color = Paper, border = BorderStroke(1.dp, Line)) {
        Column {
            val facts = listOfNotNull(usage, block?.action, block?.range).joinToString("  ·  ")
            if (title != null || facts.isNotEmpty()) {
                Column(Modifier.fillMaxWidth().background(color).padding(horizontal = 11.dp, vertical = 8.dp)) {
                    if (title != null) {
                        Text(title, Modifier.semantics { heading() }, color = Color.White, fontFamily = FontFamily.Serif,
                            fontSize = 21.sp, lineHeight = 24.sp)
                    }
                    if (facts.isNotEmpty()) {
                        Text(facts, color = Color.White, fontSize = 12.sp, lineHeight = 16.sp)
                    }
                }
            }
            if (block == null) {
                Box(Modifier.padding(horizontal = 11.dp, vertical = 8.dp)) {
                    ControlledDescription(fallback, compact = true)
                }
            } else {
                if (block.flavor.isNotEmpty()) {
                    Text(block.flavor, Modifier.padding(horizontal = 11.dp, vertical = 8.dp), color = Dim,
                        fontStyle = FontStyle.Italic, fontFamily = FontFamily.Serif, fontSize = 14.sp, lineHeight = 19.sp)
                }
                block.phases.forEach { phase ->
                    phase.title?.let {
                        Text(it, Modifier.fillMaxWidth().semantics { heading() }.background(Wash).padding(horizontal = 11.dp, vertical = 6.dp),
                            color = Ink, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                    phase.rules.forEachIndexed { index, rule ->
                        val shade = if (index % 2 == 0) color.copy(alpha = 0.08f) else Paper
                        Text(buildAnnotatedString {
                            rule.label?.let {
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("$it: ") }
                            }
                            append(rule.text)
                        }, Modifier.fillMaxWidth().background(shade).padding(horizontal = 11.dp, vertical = 5.dp),
                            color = Ink, style = MaterialTheme.typography.bodySmall, fontSize = 13.sp, lineHeight = 18.sp)
                    }
                }
            }
        }
    }
}
