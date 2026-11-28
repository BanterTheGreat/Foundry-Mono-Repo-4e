package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.items
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

/** Equipment proficiency groups shown on the About tab; shields are listed with armor. */
internal enum class EquipmentCategory(val title: String) { ARMOR("Armor"), WEAPONS("Weapons"), IMPLEMENTS("Implements") }

/** Explain the same known calculation used by the defense tile, including class and equipment terms. */
internal fun EngineResult.defenseBreakdown(defense: Statistic): String {
    val calculation = displayedDefense(defense) as? ContractResult.Available ?: return "—"
    return calculation.value.contributors.filter { it.value != 0 }.joinToString(", ") {
        "${it.label} ${if (it.value >= 0) "+" else ""}${it.value}"
    }
}

private val ArmorIds = setOf("CLOTH", "LEATHER", "LIGHT", "HIDE", "CHAINMAIL", "SCALE", "HEAVY", "PLATE")
private val ImplementIds = setOf("ROD", "WAND", "STAFF", "ORB", "TOME", "HOLY_SYMBOL", "TOTEM", "LIGHT_BLADE", "HEAVY_BLADE")

/** Shows the class hit point total, or a dash while the total is unavailable. */
internal fun EngineResult.maxHpDisplay(): String =
    displayedStatistic(Statistic.HIT_POINTS).scoreDisplay()

/** Shows the maximum healing surges, or a dash while the total is unavailable. */
internal fun EngineResult.maxSurgesDisplay(): String =
    displayedStatistic(Statistic.HEALING_SURGES).scoreDisplay()

/** Shows the known defense total, or a dash if its base cannot be resolved. */
internal fun EngineResult.defenseDisplay(defense: Statistic): String =
    displayedDefense(defense).scoreDisplay()

private fun ContractResult<CalculatedValue>?.scoreDisplay(): String =
    (this as? ContractResult.Available)?.value?.total?.toString() ?: "—"

private val defenses = listOf(
    Statistic.AC to "AC",
    Statistic.FORTITUDE to "Fortitude",
    Statistic.REFLEX to "Reflex",
    Statistic.WILL to "Will",
)

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

/** Displays vitals, the equipment-adjusted defenses, and the equipped item fields. */
@Composable
internal fun Stats(state: BuilderState, model: BuilderSession) {
    var showDefenseBreakdown by remember(state.document.id) { mutableStateOf(false) }
    val configuration = LocalConfiguration.current
    val narrow = configuration.screenWidthDp < 320 || configuration.fontScale > 1.2f
    Column(
        Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        CompactHeading("Vitals")
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Vital("Max HP", state.rules.maxHpDisplay(), Modifier.weight(1f).fillMaxHeight())
            Vital("Max Surges", state.rules.maxSurgesDisplay(), Modifier.weight(1f).fillMaxHeight())
        }
        CompactHeading("Defenses")
        StatTiles(defenses.map { (defense, label) ->
            label to state.rules.defenseDisplay(defense)
        }, columns = if (narrow) 2 else 4)
        FolioTextButton(if (showDefenseBreakdown) "Hide defense breakdown" else "Show defense breakdown") {
            showDefenseBreakdown = !showDefenseBreakdown
        }
        if (showDefenseBreakdown) {
            defenses.forEach { (defense, label) ->
                Text("$label: ${state.rules.defenseBreakdown(defense)}", color = Dim, fontSize = 12.sp)
            }
        }
        CompactHeading("Equipment")
        EquippedItems(state, model)
        CraftKnowledgeSection(state, model)
    }
}

/** Displays a single vital and its total. */
@Composable
private fun Vital(label: String, value: String, modifier: Modifier) {
    Surface(
        modifier.semantics(mergeDescendants = true) { contentDescription = "$label: $value" },
        color = Wash,
        border = BorderStroke(1.dp, Line),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(label.uppercase(), color = Dim, fontSize = 10.sp, lineHeight = 13.sp, letterSpacing = 1.sp,
                modifier = Modifier.weight(1f))
            StatValue(value)
        }
    }
}

/** Shows ability totals and known proficiencies below languages on About. */
@Composable
internal fun AboutProficiencies(state: BuilderState, model: BuilderSession) {
    val equipment = state.rules.equipmentByCategory()
    val configuration = LocalConfiguration.current
    val narrow = configuration.screenWidthDp < 320 || configuration.fontScale > 1.2f
    var showingSkills by remember(state.document.id) { mutableStateOf(false) }
    Box(Modifier.padding(vertical = 4.dp)) {
        StatTiles(Ability.entries.map { ability ->
            ability.name.readable() to state.rules.overviewAbilityTotals.getValue(ability).toString()
        }, columns = if (narrow) 3 else 6, abbreviate = true)
    }
    CurrentPowerTally(state, model, columns = if (narrow) 2 else 4)
    ProficiencyRow(
        "Skills",
        state.rules.heldSkillLabels(),
        modifier = Modifier.clickable { showingSkills = true },
    )
    EquipmentCategory.entries.forEach { ProficiencyRow(it.title, equipment.getValue(it)) }

    if (showingSkills) {
        val skills = remember(state.rules) { state.rules.skillOverviewRows() }
        ChoicePickerSheet(busy = false, dismiss = { showingSkills = false }) {
            CollapsibleChoiceList(Modifier.weight(1f)) {
                items(skills, key = { it.skill.name }) { row ->
                    SkillRow(row.skill, row.rank, row.modifier, chosen = row.rank != SkillRank.UNTRAINED)
                }
            }
            FolioActions { FolioTextButton("Close") { showingSkills = false } }
        }
    }
}

internal data class SkillOverviewRow(
    val skill: Skill,
    val rank: SkillRank,
    val modifier: ContractResult<CalculatedValue>,
)

/** The 2.0 catalog in printed order, with committed ranks and total bonuses. */
internal fun EngineResult.skillOverviewRows(): List<SkillOverviewRow> =
    Skill.catalog.map { SkillOverviewRow(it, skillRank(it), displayedSkill(it)) }

/** About's summary of the skills held above Untrained, each with its total bonus. */
internal fun EngineResult.heldSkillLabels(): List<String> = Skill.catalog
    .filter { skillRank(it) != SkillRank.UNTRAINED }
    .map { "${it.title} ${displayedSkill(it).display(signed = true)}" }

/** Places related scores in a grid that can expand vertically with the font scale. */
@Composable
private fun StatTiles(values: List<Pair<String, String>>, columns: Int, abbreviate: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        values.chunked(columns).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { (label, value) ->
                    Surface(
                        Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = "$label: $value" },
                        color = Paper,
                        border = BorderStroke(1.dp, Line),
                    ) {
                        Column(
                            Modifier.padding(vertical = 4.dp, horizontal = 2.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            StatValue(value)
                            Text(if (abbreviate) label.take(3).uppercase() else label,
                                color = Dim, fontSize = 10.sp, lineHeight = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

/** Uses the same score typography as the Levels power tallies. */
@Composable
private fun StatValue(value: String) {
    Text(value, fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 24.sp, color = Accent)
}

/** One compact folio row with wrapped proficiencies and an explicit empty state. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProficiencyRow(label: String, values: List<String>, modifier: Modifier = Modifier) {
    Surface(
        modifier.fillMaxWidth().semantics(mergeDescendants = true) {
            contentDescription = "$label: ${values.joinToString().ifEmpty { "None" }}"
        },
        color = Paper,
        border = BorderStroke(1.dp, Line),
    ) {
        Column(
            Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(label.uppercase(), color = Dim, fontSize = 9.sp, lineHeight = 12.sp, letterSpacing = 1.sp)
            if (values.isEmpty()) {
                Text("None", color = Dim, fontSize = 12.sp, lineHeight = 15.sp)
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    values.forEach { value ->
                        Surface(color = Wash) {
                            Text(value, fontSize = 12.sp, lineHeight = 15.sp,
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp))
                        }
                    }
                }
            }
        }
    }
}
