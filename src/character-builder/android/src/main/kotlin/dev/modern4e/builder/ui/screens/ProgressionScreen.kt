package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.theme.*
import kotlinx.coroutines.launch

private data class ProgressionEditor(val kind: String, val level: Int = 1, val slot: ChoiceSlotId? = null)

/** One folio column, with stable engine slots and catalog-backed editing sheets. */
@Composable
internal fun ProgressionScreen(state: BuilderState, model: BuilderSession) {
    var editor by remember(state.document.id) { mutableStateOf<ProgressionEditor?>(null) }
    var upcoming by remember { mutableStateOf(false) }
    val document = state.document
    val entries = document.levels.flatMap { it.entries }
    val skills = document.levels.flatMap { it.proficiencies }
    fun selected(slot: ChoiceSlotId) = entries.firstOrNull { it.slot == slot }?.selection?.savedTitle
        ?: state.rules.entries.firstOrNull { it.slot == slot && it.granted }?.definition?.entry?.presentation?.title ?: "Choose…"
    fun open(kind: String, level: Int = 1, slot: ChoiceSlotId? = null) { editor = ProgressionEditor(kind, level, slot) }
    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val tally = Progression.tally(document.level)
            listOf("At-will", "Encounter", "Daily", "Utility").forEach { label ->
                Surface(Modifier.weight(1f), color = Wash, border = BorderStroke(1.dp, Line)) {
                    Column(Modifier.padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text((tally[label] ?: 0).toString(), fontFamily = FontFamily.Serif, fontSize = 24.sp, color = Accent)
                        Text(label, fontSize = 11.sp, color = Dim)
                    }
                }
            }
        }
        listOf("ancestry", "environment", "upbringing", "theme", "class").forEach { kind ->
            val background = kind == "environment" || kind == "upbringing"
            val value = if (background) Progression.background(document, kind).ifBlank { "Choose…" }.readable()
                else selected(ChoiceSlotId("creation", kind, 0))
            Field(kind.readable() + if (kind == "theme") " (optional)" else "", value, enabled = !model.busy) {
                open(if (background) kind else "entry", slot = if (background) null else ChoiceSlotId("creation", kind, 0))
            }
        }
        if (document.level > 2) {
            Text("Incomplete automation: progression above level 2 is not evaluated. Calculated totals are unavailable.", color = Accent)
        }
        (1..if (upcoming) 30 else document.level).forEach { level ->
            val schedule = Progression.level(level)
            val future = level > document.level
            Surface(Modifier.fillMaxWidth().padding(top = 16.dp), color = Wash) {
                Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Text("LEVEL  ", color = Dim, letterSpacing = 2.sp, fontSize = 12.sp)
                    Text(level.toString(), fontFamily = FontFamily.Serif, fontSize = 28.sp)
                }
            }
            if (future) {
                Text("Reached at level $level", color = Dim)
            }
            if (level == 1) {
                val tiles = listOf("Ability Scores", "Environment skill", "Upbringing skill", "Free skills")
                tiles.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { label ->
                            val kind = when (label) { "Ability Scores" -> "allocation"; "Free skills" -> "free";
                                "Environment skill" -> "environment-skill"; else -> "upbringing-skill" }
                            val chosen = when (kind) {
                                "allocation" -> Progression.validAllocation(document.abilities)
                                "free" -> skills.count { it.slot.sourceInstanceId == "creation" && it.slot.choiceId == "free-skill" } == 2
                                else -> skills.any { it.slot.sourceInstanceId == "background.${kind.substringBefore('-')}.${Progression.background(document, kind.substringBefore('-'))}" }
                            }
                            val freeCount = skills.count { it.slot.sourceInstanceId == "creation" && it.slot.choiceId == "free-skill" }
                            Field(label, if (chosen) "✓" else if (kind == "free") "${2 - freeCount} left" else "✗", Modifier.weight(1f), !model.busy) { open(kind) }
                        }
                    }
                }
            }
            // Only the engine can declare real class choices. Illustrative prototype choices are not fabricated.
            val levelChoices = Progression.levelChoices(state, level)
            val className = state.rules.entries.firstOrNull { it.definition.entry.category == EntryCategory.CLASS }
                ?.definition?.entry?.presentation?.title
            levelChoices.filter { choice -> choice.abilities.isEmpty() }.forEach { choice ->
                val sourceTitle = state.rules.entries.firstOrNull { it.instanceId == choice.slot.sourceInstanceId }
                    ?.definition?.entry?.presentation?.title.orEmpty()
                if (choice.entries.isNotEmpty()) {
                    Field(if (choice.optional) "$sourceTitle (optional substitution)" else Progression.choiceLabel(choice.slot.choiceId, className), selected(choice.slot), enabled = !model.busy && !future) { open("entry", level, choice.slot) }
                } else if (choice.valueKind != null) {
                    val pick = document.levels.flatMap { it.values }.firstOrNull { it.slot == choice.slot }
                    val label = when (requireNotNull(choice.valueKind)) {
                        FactKind.LANGUAGE -> "language ${choice.slot.ordinal + 1}"
                        FactKind.EQUIPMENT_PROFICIENCY -> "weapon proficiency"
                        FactKind.DAMAGE_TYPE -> "damage type"
                        FactKind.ANCESTRY_QUALIFICATION -> "Past Life ancestry"
                        FactKind.SKILL_BONUS -> "bonus skill"
                    }
                    Field("$sourceTitle: $label", choice.values.firstOrNull { it.id == pick?.value }?.title ?: pick?.value ?: "Choose...",
                        enabled = !model.busy && !future) { open("value", level, choice.slot) }
                } else if (choice.skills.isNotEmpty()) {
                    Field(Progression.choiceLabel(choice.slot.choiceId, className), skills.firstOrNull { it.slot == choice.slot }?.skill?.name?.readable() ?: "Choose…", enabled = !model.busy && !future) {
                        open("skill", level, choice.slot)
                    }
                }
            }
            if (level == 1 && state.rules.entries.any { it.definition.entry.category == EntryCategory.CLASS && it.definition.entry.presentation.title.contains("Fighter") } &&
                levelChoices.none { it.slot.choiceId.contains("react", ignoreCase = true) }) {
                Text("Reactivity and Combat Superiority choices are not yet authored in the installed Fighter proof.", color = Dim)
            }
            if (schedule.ability != null) {
                if (schedule.ability == "non-main") {
                    Field("Ability increase", document.levels.firstOrNull { it.level == level }?.abilityAdvancements?.firstOrNull()?.increases?.keys?.firstOrNull()?.name?.readable() ?: "Choose…",
                        enabled = !future && !model.busy) { open("advancement", level) }
                } else { Text("+1 to ${schedule.ability} abilities arrives automatically", color = Dim) }
            }
            if (future || level > 2) {
                schedule.powers.forEachIndexed { ordinal, power ->
                    val slot = ChoiceSlotId("advancement.$level", "power", ordinal)
                    Field("$power power", selected(slot), enabled = !future && !model.busy) { open("entry", level, slot) }
                }
            } else if (schedule.powers.isNotEmpty() && levelChoices.none { it.entries.isNotEmpty() }) {
                Text("Choose a class to see its available powers.", color = Dim)
            }
            if (schedule.feat) {
                val slot = ChoiceSlotId(if (level == 1) "creation" else "advancement.$level", "feat", 0)
                Field("Feat", selected(slot), enabled = !future && !model.busy) { open("feat", level, slot) }
            }
            schedule.replacement?.let {
                Field("Replace a $it attack power (optional)", "Choose…", enabled = !future && !model.busy) {
                    open("replacement", level, ChoiceSlotId("advancement.$level", "replacement", 0))
                }
            }
            schedule.automatic.forEach { Text("$it arrives automatically", color = Dim) }
        }
        if (document.level < 30) {
            TextButton({ upcoming = !upcoming }) { Text(if (upcoming) "Hide upcoming levels" else "Show upcoming levels ${document.level + 1}–30") }
        }
    }
    editor?.let { request ->
        ProgressionSheet(request, state, model) { editor = null }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProgressionSheet(request: ProgressionEditor, state: BuilderState, model: BuilderSession, dismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var edit by remember(request) { mutableStateOf<BuilderEdit?>(null) }
    var selected by remember(request) { mutableStateOf(state.document.levels.flatMap { it.entries }.firstOrNull { it.slot == request.slot }?.selection?.entryId
        ?: state.rules.entries.firstOrNull { it.slot == request.slot && it.granted }?.definition?.entry?.id) }
    var expanded by remember(request) { mutableStateOf(selected) }
    var showIneligible by remember(request) { mutableStateOf(false) }
    var featTab by remember(request) { mutableStateOf("Class") }
    var optionRows by remember(request, featTab, state.document) { mutableStateOf<List<BuilderOptionRow>?>(null) }
    var replacementTarget by remember(request) { mutableStateOf<ChoiceSlotId?>(null) }
    val document = state.document
    val catalogPicker = request.kind in listOf("entry", "feat", "replacement")
    LaunchedEffect(request, if (request.kind == "feat") featTab else null, document) {
        if (catalogPicker) {
            optionRows = null
            val group = if (request.kind == "feat") FeatGroup.valueOf(featTab.uppercase()) else null
            model.progressionOptionRows(request.level, request.slot!!, group) { optionRows = it }
        }
    }
    ModalBottomSheet(onDismissRequest = { if (!model.busy) dismiss() }, containerColor = Paper,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().height(pickerSheetHeight(LocalConfiguration.current.screenHeightDp)).padding(horizontal = 20.dp)) {
            if (catalogPicker) {
                key(request, featTab) {
                    CatalogChoiceList(request, state, model, optionRows, selected, expanded, featTab, showIneligible,
                        replacementTarget, Modifier.weight(1f),
                        changeTab = { featTab = it }, toggleIneligible = { showIneligible = !showIneligible },
                        changeTarget = { replacementTarget = it; edit = null }, choose = { option ->
                            val entry = option.entry.entry
                            if (selected == entry.id) {
                                expanded = if (expanded == entry.id) null else entry.id
                            } else {
                                selected = entry.id
                                expanded = entry.id
                                edit = if (request.level <= 2) {
                                    BuilderEdit.Entry(request.level, request.slot!!, entry.id, java.util.UUID.randomUUID().toString(),
                                        option.eligibility == Eligibility.INCOMPLETE)
                                } else {
                                    val decisions = document.levels.firstOrNull { it.level == request.level } ?: LevelDecisions(request.level)
                                    val occurrence = decisions.entries.firstOrNull { it.slot == request.slot }?.instanceId ?: java.util.UUID.randomUUID().toString()
                                    val choice = EntryChoice(occurrence, request.slot!!, SavedSelection(entry.id, entry.presentation.title,
                                        option.entry.supplier.packageId, option.entry.fingerprint))
                                    if (request.kind == "replacement") {
                                        replacementTarget?.let { target -> BuilderEdit.LaterDecisions(decisions.copy(replacements =
                                            decisions.replacements.filterNot { it.replacement.slot == request.slot } + Replacement(target, choice, ReplacementKind.PROGRESSION))) }
                                    } else {
                                        BuilderEdit.LaterDecisions(decisions.copy(entries = decisions.entries.filterNot { it.slot == request.slot } + choice))
                                    }
                                }
                            }
                        })
                }
            } else {
                Column(Modifier.weight(1f).folioScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (request.level > 2) { Text("Incomplete automation: later-level eligibility and totals are unavailable.", color = Accent) }
                    when (request.kind) {
                        "advancement" -> {
                            Ability.entries.filter { it != document.abilities.mainAbility }.forEach { ability ->
                                ChoiceCard(ability.name.readable(), selected == ability.name, false, true, null, {
                                    selected = ability.name
                                    val decisions = document.levels.firstOrNull { it.level == request.level } ?: LevelDecisions(request.level)
                                    edit = BuilderEdit.LaterDecisions(decisions.copy(abilityAdvancements = listOf(
                                        AbilityAdvancement(ChoiceSlotId("advancement.${request.level}", "ability", 0), mapOf(ability to 1)))))
                                }) { }
                            }
                        }
                        "allocation" -> {
                            var points by remember { mutableStateOf(document.abilities.points) }
                            val allocation = document.abilities.copy(points = points)
                            val remaining = Progression.remainingPoints(allocation)
                            Surface(color = Wash, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(3.dp)) {
                                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("Ability points", fontFamily = FontFamily.Serif, fontSize = 20.sp)
                                        Text(if (remaining < 0) "Over budget" else "Left to allocate", color = Dim, fontSize = 12.sp)
                                    }
                                    Text(remaining.toString(), color = Accent, fontFamily = FontFamily.Serif, fontSize = 32.sp)
                                }
                            }
                            Ability.entries.forEach { ability ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(ability.name.readable(), Modifier.weight(1f), fontFamily = FontFamily.Serif)
                                    val value = points[ability] ?: 0
                                    OutlinedButton(enabled = Progression.canAdjustAbility(allocation, ability, -1), modifier = Modifier.size(48.dp),
                                        shape = RoundedCornerShape(3.dp), contentPadding = PaddingValues(0.dp), onClick = {
                                        points = points + (ability to value - 1)
                                        edit = BuilderEdit.Allocation(document.abilities.copy(points = points))
                                    }) { Text("−", fontSize = 24.sp) }
                                    Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) {
                                        Text(value.toString(), color = Accent, fontFamily = FontFamily.Serif, fontSize = 24.sp)
                                    }
                                    OutlinedButton(enabled = Progression.canAdjustAbility(allocation, ability, 1), modifier = Modifier.size(48.dp),
                                        shape = RoundedCornerShape(3.dp), contentPadding = PaddingValues(0.dp), onClick = {
                                        points = points + (ability to value + 1)
                                        edit = BuilderEdit.Allocation(document.abilities.copy(points = points))
                                    }) { Text("+", fontSize = 24.sp) }
                                }
                            }
                            Text("Distribute 5 points: 0–2 each, or one −1 paired with one 3.", color = Dim)
                        }
                        "environment", "upbringing" -> {
                            val backgrounds = if (request.kind == "environment") ModernCreation.environments else ModernCreation.upbringings
                            var background by remember { mutableStateOf(Progression.background(document, request.kind)) }
                            backgrounds.forEach { (name, skills) ->
                                ChoiceCard(name.readable(), name == background, name == expanded, true, null, {
                                    if (background == name) { expanded = if (expanded == name) null else name }
                                    else { background = name; expanded = name; edit = model.backgroundEdit(request.kind, name) }
                                }) {
                                    Text(BackgroundDescriptions[name].orEmpty(), color = Dim)
                                    Text("Choose one: ${skills.joinToString { it.name.readable() }}", color = Dim)
                                }
                            }
                        }
                        "value" -> {
                            val offered = state.rules.choices.firstOrNull { it.slot == request.slot }?.values.orEmpty()
                            val committed = document.levels.flatMap { it.values }.firstOrNull { it.slot == request.slot }?.value
                            val draft = (edit as? BuilderEdit.Value)?.value?.value ?: committed
                            offered.forEach { option ->
                                ChoiceCard(option.title, option.id == draft, false, true, null, {
                                    edit = BuilderEdit.Value(request.level, ValueChoice(request.slot!!, option.id))
                                }) { }
                            }
                        }
                        "free", "environment-skill", "upbringing-skill", "skill" -> {
                            val kind = request.kind.substringBefore('-')
                            val slots = when (kind) {
                                "free" -> (0..1).map { ChoiceSlotId("creation", "free-skill", it) }
                                "skill" -> listOf(request.slot!!)
                                else -> listOf(ChoiceSlotId("background.$kind.${Progression.background(document, kind)}", "skill", 0))
                            }
                            val offered = if (kind == "free") Skill.entries else state.rules.choices.firstOrNull { it.slot == slots.first() }?.skills.orEmpty()
                            var picks by remember { mutableStateOf(document.levels.flatMap { it.proficiencies }.filter { it.slot in slots }.map { it.skill }) }
                            if (offered.isEmpty()) { Text("Choose ${kind.readable()} first.", color = Dim) }
                            offered.forEach { skill ->
                                val chosen = skill in picks
                                val otherSource = state.rules.proficiencies[skill].orEmpty().firstOrNull { it !in slots }
                                val blocked = otherSource != null
                                val draftSource = slots.getOrNull(picks.indexOf(skill))
                                val modifier = state.rules.displayedSkill(skill, otherSource ?: draftSource)
                                val calculation = modifier as? ContractResult.Available
                                Surface(Modifier.fillMaxWidth().clickable(enabled = !blocked) {
                                    picks = if (chosen) picks - skill else if (slots.size == 1) listOf(skill) else if (picks.size < 2) picks + skill else picks
                                    edit = BuilderEdit.Batch(listOf(BuilderEdit.RemoveProficiency(slots.toSet())) + picks.mapIndexed { index, pick ->
                                        BuilderEdit.Proficiency(request.level, ProficiencyChoice(slots[index], pick))
                                    })
                                }, color = if (chosen) Wash else Paper, border = BorderStroke(1.dp, if (chosen) Accent else Line)) {
                                    Row(Modifier.heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Column(Modifier.weight(1f)) {
                                            Text((if (chosen || blocked) "✓ " else "") + skill.name.readable(), color = if (blocked) Dim else Ink)
                                            calculation?.value?.contributors?.mapNotNull { Progression.skillContributorLabel(it.label) }?.forEach {
                                                Text(it, fontSize = 11.sp, lineHeight = 13.sp, color = Dim)
                                            }
                                        }
                                        Text(modifier.display(signed = true), color = Accent)
                                    }
                                }
                            }
                            if (slots.size == 2) { Text("${2 - picks.size} left", color = Dim) }

                        }
                        else -> Unit
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(enabled = !model.busy, onClick = dismiss) { Text("Cancel") }
                if (request.slot != null && selected != null) {
                    TextButton(enabled = !model.busy, onClick = { edit = BuilderEdit.RemoveEntry(request.slot); selected = null; expanded = null }) { Text("Clear") }
                } else if (edit != null) {
                    TextButton(enabled = !model.busy, onClick = dismiss) { Text("Undo changes") }
                }
                val valid = edit != null &&
                    (request.kind != "free" || (edit as? BuilderEdit.Batch)?.edits?.count { it is BuilderEdit.Proficiency } == 2) &&
                    (request.kind != "allocation" || (edit as? BuilderEdit.Allocation)?.value?.let { Progression.validAllocation(it) } == true)
                TextButton(enabled = valid && !model.busy, onClick = {
                    val command = edit ?: return@TextButton
                    scope.launch { model.run { edit(command) }; if (model.errors.isEmpty()) dismiss() }
                }) { Text("Save") }
            }
        }
    }
}

/** Tallest a Progression sheet grows; every sheet uses this height so switching lists never resizes it. */
private val PickerSheetMaxHeight = 650.dp

/**
 * Fixed height shared by every Progression sheet, whatever its content.
 *
 * @param screenHeightDp the window height available to the sheet.
 * @return the maximum sheet height, reduced only when the screen cannot fit it.
 */
internal fun pickerSheetHeight(screenHeightDp: Int): Dp = minOf(PickerSheetMaxHeight, (screenHeightDp * 0.85f).dp)

/** The catalog supplies a tab's metadata first; lazy rows update in place as checks finish. */
@Composable
private fun CatalogChoiceList(request: ProgressionEditor, state: BuilderState, model: BuilderSession, rows: List<BuilderOptionRow>?,
    selected: String?, expanded: String?, featTab: String, showIneligible: Boolean, replacementTarget: ChoiceSlotId?,
    modifier: Modifier, changeTab: (String) -> Unit, toggleIneligible: () -> Unit,
    changeTarget: (ChoiceSlotId) -> Unit, choose: (BuilderOption) -> Unit) {
    val scroll = rememberLazyListState()
    val taken = remember(state.document, request.slot) {
        state.document.levels.flatMap { it.entries }.filter { it.slot != request.slot }.map { it.selection.entryId }.toSet()
    }
    val visible = remember(rows, taken, showIneligible) {
        rows.orEmpty().filter { it.pickerVisible(taken, showIneligible) }
    }
    val hidden = remember(rows, taken) { rows.orEmpty().count { it.checked && !it.pickerSelectable(taken) } }
    LazyColumn(modifier.fillMaxWidth().folioScroll(scroll), state = scroll,
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (request.level > 2) {
            item("coverage") { Text("Incomplete automation: later-level eligibility and totals are unavailable.", color = Accent) }
        }
        if (request.kind == "feat") {
            item("tabs") {
                Row {
                    listOf("General", "Ancestry", "Class").forEach { tab ->
                        TextButton({ changeTab(tab) }, Modifier.weight(1f)) {
                            Text(tab, color = if (featTab == tab) Accent else Dim)
                        }
                    }
                }
            }
        }
        if (request.kind == "replacement") {
            val targets = state.document.levels.filter { it.level < request.level }.flatMap { it.entries }.filter { old ->
                state.rules.entries.any { it.slot == old.slot && it.definition.entry.category == EntryCategory.POWER } || old.slot.choiceId == "power"
            }
            items(targets, key = { "replace:${it.instanceId}" }) { old ->
                ChoiceCard("Replace ${old.selection.savedTitle}", replacementTarget == old.slot, false, true, null,
                    { changeTarget(old.slot) }) { }
            }
        }
        if (rows == null) {
            item("loading") { Text("Loading…", color = Dim) }
        } else {
            items(visible, key = { "option:${it.metadata.metadata.id}" }) { row ->
                val option = row.option
                val entry = option?.entry?.entry
                val level = entry?.mechanics?.prerequisites?.filterIsInstance<Prerequisite.Level>()?.maxOfOrNull { it.minimum }
                    ?: entry?.presentation?.description?.let { Regex("(?:Attack|Utility) (\\d+)").find(it)?.groupValues?.get(1)?.toIntOrNull() }
                val selectable = row.pickerSelectable(taken)
                ChoiceCard(row.metadata.metadata.title, selected == row.metadata.metadata.id,
                    expanded == row.metadata.metadata.id, selectable, level, { option?.let(choose) }) {
                    if (!row.checked) {
                        Text("Checking eligibility…", color = Dim)
                    } else if (entry == null) {
                        Text(row.diagnostics.joinToString { it.message }.ifBlank { "Definition is unavailable." }, color = Dim)
                    } else {
                        if (entry.category == EntryCategory.POWER) { PowerPresentation(entry) }
                        else { ControlledDescription(entry.presentation.description) }
                        if (entry.category == EntryCategory.ANCESTRY) { AncestryFeatures(entry, model) }
                        if (entry.mechanics.prerequisites.any { it is Prerequisite.Unadapted }) {
                            Text("Prerequisite not adapted", color = Accent)
                        }
                        if (!selectable) {
                            Text(if (entry.id in taken) "Already chosen" else option?.diagnostics.orEmpty().joinToString { it.message }, color = Dim)
                        }
                    }
                }
            }
            if (rows.any { !it.checked }) {
                item("checking") { Text("Checking eligibility…", color = Dim) }
            }
            if (hidden > 0) {
                item("toggle") {
                    TextButton(toggleIneligible) { Text(if (showIneligible) "Hide ineligible" else "Show $hidden ineligible") }
                }
            }
            if (rows.isEmpty()) {
                item("empty") {
                    Text("No ${if (request.kind == "feat") featTab.lowercase() else "available"} options in the installed content.", color = Dim)
                }
            }
        }
    }
}

/** The traits and powers an ancestry grants, loaded when its card is expanded. */
@Composable
private fun AncestryFeatures(ancestry: ContentEntry, model: BuilderSession) {
    val granted by produceState<List<ContentEntry>>(emptyList(), ancestry.id) { value = model.grantedEntries(ancestry) }
    granted.forEach { feature ->
        Text(feature.presentation.title, fontFamily = FontFamily.Serif, fontSize = 16.sp)
        ControlledDescription(feature.presentation.description)
    }
}

/** Preserve the catalog's labelled source rows rather than converting published combat math. */
@Composable
private fun PowerPresentation(entry: ContentEntry) {
    val html = entry.presentation.description
    val usage = when {
        html.contains("class=atwillpower", ignoreCase = true) -> "At-will"
        html.contains("class=encounterpower", ignoreCase = true) -> "Encounter"
        else -> "Daily"
    }
    val color = when (usage) {
        "At-will" -> androidx.compose.ui.graphics.Color(0xFF386447)
        "Encounter" -> Accent
        else -> androidx.compose.ui.graphics.Color(0xFF334F70)
    }
    Surface(Modifier.fillMaxWidth(), color = color) {
        val keywords = Regex("<p class=powerstat>(.*?)<br>", RegexOption.DOT_MATCHES_ALL).find(html)?.groupValues?.get(1)
            ?.let { android.text.Html.fromHtml(it, android.text.Html.FROM_HTML_MODE_COMPACT).toString() } ?: usage
        Text(keywords, color = androidx.compose.ui.graphics.Color.White, modifier = Modifier.padding(8.dp))
    }
    ControlledDescription(html)
}

