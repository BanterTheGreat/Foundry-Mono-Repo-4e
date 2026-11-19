package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.ContentEntry
import dev.modern4e.builder.ui.theme.Accent
import dev.modern4e.builder.ui.theme.Ink
import dev.modern4e.builder.ui.theme.Line

/** Render the authored prose and advancement benefits for the entry being inspected. */
@Composable
internal fun AdvancementDetails(details: AdvancementDetail, inlineStartingGrants: Boolean = false) {
    if (details.introduction.isNotBlank()) {
        AdvancementProse(details.introduction)
    }
    details.attributes.forEach { (label, value) -> AdvancementProse("*$label* $value") }
    details.levels.forEach { level ->
        val content: @Composable () -> Unit = {
            level.features.forEach { AdvancementFeature(it) }
            level.powers.forEach { PowerBlock(it) }
            level.powerChoices.forEach { choice ->
                Text("Choose ${choice.count} ${if (choice.count == 1) "power" else "powers"}", color = Accent, fontSize = 12.sp)
                choice.powers.forEach { PowerBlock(it) }
            }
        }
        if (inlineStartingGrants && level.level == 1) {
            content()
        } else {
            AdvancementSection(if (level.level == 0) "Base" else "Level ${level.level}", content)
        }
    }
    if (details.modifications.isNotEmpty()) {
        AdvancementSection("Optional modifications") {
            details.modifications.forEach { AdvancementFeature(it) }
        }
    }
    if (details.conclusion.isNotBlank()) {
        HorizontalDivider(color = Line, modifier = Modifier.padding(vertical = 4.dp))
        AdvancementProse(details.conclusion)
    }
}

@Composable
private fun AdvancementSection(title: String, content: @Composable () -> Unit) {
    HorizontalDivider(color = Line, modifier = Modifier.padding(top = 6.dp))
    Text(title, Modifier.semantics { heading() }, fontSize = 14.sp, color = Accent, fontWeight = FontWeight.SemiBold)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        content()
    }
}

@Composable
private fun AdvancementFeature(entry: ContentEntry) {
    Column {
        Text(entry.presentation.title, fontFamily = FontFamily.Serif, fontSize = 14.sp, color = Ink)
        AdvancementProse(featureProse(entry))
    }
}

/** Preserve the authored paragraphs and emphasis in plain-text advancement content. */
@Composable
internal fun AdvancementProse(text: String) {
    val formatted = remember(text) { buildAnnotatedString { appendAuthoredText(text) } }
    Text(formatted, color = Ink, fontSize = 12.sp, lineHeight = 16.sp)
}
