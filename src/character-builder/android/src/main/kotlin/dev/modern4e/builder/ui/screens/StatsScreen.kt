package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** Equipment proficiency groups shown on the Stats tab; shields are listed with armor. */
internal enum class EquipmentCategory(val title: String) { ARMOR("Armor"), WEAPONS("Weapons"), IMPLEMENTS("Implements") }

private val ArmorIds = setOf("CLOTH", "LEATHER", "LIGHT", "HIDE", "CHAINMAIL", "SCALE", "HEAVY", "PLATE")
private val ImplementIds = setOf("ROD", "WAND", "STAFF", "ORB", "TOME", "HOLY_SYMBOL", "TOTEM", "LIGHT_BLADE", "HEAVY_BLADE")

/**
 * Maximum hit points from the class formula plus modifiers.
 *
 * @return the computed total, or a dash while no class provides a base.
 */
internal fun EngineResult.maxHpDisplay(): String =
    (statistics[ModifierTarget(Statistic.HIT_POINTS)]?.value as? ContractResult.Available)?.value?.total?.toString() ?: "—"

/**
 * Groups the character's equipment proficiencies by category, in acquisition order.
 *
 * The engine keeps one flat set, so the category comes from the class profile when it lists the value
 * (a Staff can be a weapon and an implement) and from the id otherwise.
 *
 * @return display titles per category; categories without proficiencies are present and empty.
 */
internal fun EngineResult.equipmentByCategory(): Map<EquipmentCategory, List<String>> {
    val profiles = entries.mapNotNull { it.definition.entry.mechanics.classProfile?.proficiencies }
    val titles = choices.flatMap { it.values }.associate { it.id to it.title }
    val grouped = EquipmentCategory.entries.associateWith { mutableListOf<String>() }
    for (value in equipmentProficiencies.keys) {
        val listed = profiles.flatMap { it.entries }.filter { value in it.value }.mapNotNull { (key, _) ->
            when (key) {
                "armor", "shields" -> EquipmentCategory.ARMOR
                "weapons" -> EquipmentCategory.WEAPONS
                "implements" -> EquipmentCategory.IMPLEMENTS
                else -> null
            }
        }.distinct()
        val categories = listed.ifEmpty {
            listOf(when {
                value.endsWith("_SHIELD") || value in ArmorIds -> EquipmentCategory.ARMOR
                value in ImplementIds -> EquipmentCategory.IMPLEMENTS
                else -> EquipmentCategory.WEAPONS
            })
        }
        val title = titles[value] ?: value.substringAfterLast('.').replace('-', '_').split('_').joinToString(" ") { it.readable() }
        categories.forEach { grouped.getValue(it) += title }
    }
    return grouped.mapValues { it.value.distinct() }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Stats(state: BuilderState) {
    val equipment = state.rules.equipmentByCategory()
    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Heading("Vitals")
        val maxHp = state.rules.maxHpDisplay()
        Surface(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "Max HP: $maxHp" },
            color = Wash, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(3.dp)) {
            Row(Modifier.padding(13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("MAX HP", fontSize = 10.sp, letterSpacing = 1.sp, color = Dim, modifier = Modifier.weight(1f))
                Text(maxHp, fontFamily = FontFamily.Serif, fontSize = 34.sp, color = Accent)
            }
        }
        Heading("Abilities")
        Ability.entries.chunked(if (LocalConfiguration.current.fontScale > 1.2f) 3 else 6).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                row.forEach { ability ->
                    val value = state.rules.overviewAbilityTotals.getValue(ability).toString()
                    Surface(Modifier.weight(1f).semantics { contentDescription = "${ability.name.readable()}: $value" },
                        color = Paper, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(2.dp)) {
                        Column(Modifier.padding(vertical = 8.dp, horizontal = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(ability.name.take(3), color = Dim, fontSize = 10.sp)
                            Text(value, fontFamily = FontFamily.Serif, fontSize = 25.sp, color = Accent)
                        }
                    }
                }
            }
        }
        Heading("Proficiencies")
        ProficiencyRow("Skills", state.rules.proficiencies.keys.map { skill ->
            "${skill.name.readable()} ${state.rules.displayedSkill(skill).display(signed = true)}"
        })
        EquipmentCategory.entries.forEach { ProficiencyRow(it.title, equipment.getValue(it)) }
    }
}

/** One labelled row of proficiency chips; an empty row reads "None". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProficiencyRow(label: String, values: List<String>) {
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "$label: ${values.joinToString().ifEmpty { "None" }}" },
        verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label.uppercase(), fontSize = 10.sp, letterSpacing = 1.sp, color = Dim)
        if (values.isEmpty()) {
            Text("None", color = Dim, fontSize = 13.sp)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            values.forEach { value ->
                Surface(color = Wash, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(3.dp)) {
                    Text(value, fontSize = 13.sp, modifier = Modifier.padding(10.dp))
                }
            }
        }
    }
}
