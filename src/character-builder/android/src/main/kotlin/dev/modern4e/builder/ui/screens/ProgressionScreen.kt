package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
    val powerEntryIds = remember(model, state) { model.powerEntryIds() }
    val document = state.document
    val entries = document.levels.flatMap { it.entries }
    val skills = document.levels.flatMap { it.proficiencies }
    val values = document.levels.flatMap { it.values }
    val ancestryLanguages = remember(state) { Progression.ancestryLanguageChoices(state) }
    val ancestryPowers = remember(state, powerEntryIds) { Progression.ancestryPowerChoices(state, powerEntryIds) }
    val grantsByLevel = remember(state) { Progression.automaticGrants(state).groupBy { it.level } }
    val invalidSlots = remember(state.rules) { Progression.invalidChoiceSlots(state.rules) }
    val filledSlots = remember(state) {
        buildSet {
            entries.mapTo(this) { it.slot }
            skills.mapTo(this) { it.slot }
            values.mapTo(this) { it.slot }
            state.rules.entries.filter { it.granted }.mapTo(this) { it.slot }
        }
    }
    fun needsAttention(slot: ChoiceSlotId, level: Int = 1, optional: Boolean = false) =
        Progression.choiceNeedsAttention(level <= document.level, optional, slot in filledSlots, slot in invalidSlots)
    fun selected(slot: ChoiceSlotId) = entries.firstOrNull { it.slot == slot }?.selection?.savedTitle
        ?: state.rules.entries.firstOrNull { it.slot == slot && it.granted }?.definition?.entry?.presentation?.title ?: "Choose…"
    fun selectedPowerUsage(slot: ChoiceSlotId) = state.rules.entries.firstOrNull { it.slot == slot }
        ?.definition?.entry?.let(::powerChoiceUsage)
    fun open(kind: String, level: Int = 1, slot: ChoiceSlotId? = null) { editor = ProgressionEditor(kind, level, slot) }
    @Composable
    fun CreationChoice(kind: String, modifier: Modifier = Modifier) {
        val background = kind == "environment" || kind == "upbringing"
        val slot = ChoiceSlotId("creation", kind, 0)
        val selection = if (background) Progression.background(document, kind) else selected(slot)
        val backgroundOptions = if (kind == "environment") ModernCreation.environments else ModernCreation.upbringings
        val invalid = if (background) selection !in backgroundOptions else needsAttention(slot)
        LevelChoice(
            kind.readable(),
            if (background) selection.ifBlank { "Choose…" }.readable() else selection,
            modifier, enabled = !model.busy, invalid = invalid,
        ) {
            open(if (background) kind else "entry", slot = if (background) null else slot)
        }
    }
    @Composable
    fun AncestryLanguage(choice: EngineChoice, modifier: Modifier = Modifier) {
        LevelValueChoice(choice, "Ancestry Language", values.firstOrNull { it.slot == choice.slot }?.value,
            enabled = !model.busy, invalid = needsAttention(choice.slot, optional = choice.optional), modifier = modifier) {
            open("value", level = 1, slot = choice.slot)
        }
    }
    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val tally = Progression.tally(document.level)
            listOf("At-will", "Encounter", "Daily", "Utility").forEach { label ->
                val color = powerChoiceColor(label)
                Surface(Modifier.weight(1f), color = Wash, border = BorderStroke(1.dp, color ?: Line)) {
                    Column(Modifier.padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text((tally[label] ?: 0).toString(), fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 24.sp, color = color ?: Accent)
                        Text(label, fontSize = 10.sp, lineHeight = 13.sp, color = color ?: Dim)
                    }
                }
            }
        }
        ProgressionLevelHeading(0)
        val firstLanguage = ancestryLanguages.firstOrNull()
        if (firstLanguage == null) {
            CreationChoice("ancestry")
        } else {
            CreationChoicePair {
                CreationChoice("ancestry", Modifier.weight(1f).fillMaxHeight())
                AncestryLanguage(firstLanguage, Modifier.weight(1f).fillMaxHeight())
            }
        }
        ancestryPowers.forEach { choice ->
            LevelChoice("Ancestry Power Choice", selected(choice.slot), enabled = !model.busy,
                powerUsage = selectedPowerUsage(choice.slot), invalid = needsAttention(choice.slot, optional = choice.optional)) {
                open("entry", level = 1, slot = choice.slot)
            }
        }
        ancestryLanguages.drop(1).forEach { AncestryLanguage(it) }
        CreationChoicePair {
            CreationChoice("class", Modifier.weight(1f).fillMaxHeight())
            CreationChoice("theme", Modifier.weight(1f).fillMaxHeight())
        }
        CreationChoicePair {
            CreationChoice("environment", Modifier.weight(1f).fillMaxHeight())
            CreationChoice("upbringing", Modifier.weight(1f).fillMaxHeight())
        }
        val startingGrants = grantsByLevel[0].orEmpty().groupBy { it.sourceCategory }
        listOf(EntryCategory.ANCESTRY, EntryCategory.CLASS, EntryCategory.THEME).forEach { source ->
            startingGrants[source]?.let { grants ->
                StartingGrantDivider("${source.name.readable()} Features")
                grants.forEach { grant -> AutomaticGrantCard(document.id, grant) }
            }
        }
        if (document.level > 2) {
            Text("Incomplete automation: progression above level 2 is not evaluated. Calculated totals are unavailable.", color = Accent)
        }
        (1..if (upcoming) 30 else document.level).forEach { level ->
            val schedule = Progression.level(level)
            val future = level > document.level
            ProgressionLevelHeading(level)
            if (future) {
                Text("Reached at level $level", color = Dim)
            }
            if (level == 1) {
                val tiles = listOf("Ability Scores", "Environment skill", "Upbringing skill", "Free skills")
                tiles.chunked(2).forEach { row ->
                    Row(
                        Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        row.forEach { label ->
                            val kind = when (label) { "Ability Scores" -> "allocation"; "Free skills" -> "free";
                                "Environment skill" -> "environment-skill"; else -> "upbringing-skill" }
                            val backgroundKind = kind.removeSuffix("-skill").takeIf { it != kind }
                            val background = backgroundKind?.let { Progression.background(document, it) }
                            val available = background == null || background.isNotBlank()
                            val freeSlots = (0..1).map { ChoiceSlotId("creation", "free-skill", it) }
                            val freeCount = freeSlots.count { it in filledSlots }
                            val chosen = when (kind) {
                                "allocation" -> Progression.validAllocation(document.abilities) &&
                                    document.abilities.source !in invalidSlots
                                "free" -> freeSlots.none { needsAttention(it) }
                                else -> available && !needsAttention(ChoiceSlotId("background.$backgroundKind.$background", "skill", 0))
                            }
                            val value = when {
                                !available -> "Choose ${backgroundKind.orEmpty().readable()} first"
                                chosen -> "✓"
                                kind == "free" && freeCount < 2 -> "${2 - freeCount} LEFT"
                                else -> "✗"
                            }
                            LevelChoice(
                                label, value, Modifier.weight(1f).fillMaxHeight(),
                                enabled = available && !model.busy, valueIsHint = !available || (kind == "free" && freeCount < 2),
                                invalid = !chosen,
                            ) { open(kind) }
                        }
                    }
                }
            }
            val (classGrants, otherGrants) = grantsByLevel[level].orEmpty().partition { it.sourceCategory == EntryCategory.CLASS }
            val (otherPowers, otherFeatures) = otherGrants.partition { it.isPower }
            classGrants.forEach { grant -> AutomaticGrantCard(document.id, grant) }

            val levelChoices = Progression.levelChoices(state, level).filterNot { it in ancestryLanguages || it in ancestryPowers }
            val className = state.rules.entries.firstOrNull { it.definition.entry.category == EntryCategory.CLASS }
                ?.definition?.entry?.presentation?.title
            val (powerSlots, regularChoices) = Progression.partitionLevelChoices(level, levelChoices, powerEntryIds)
            regularChoices.forEach { choice ->
                val source = state.rules.entries.firstOrNull { it.instanceId == choice.slot.sourceInstanceId }?.definition?.entry
                val sourceTitle = source?.presentation?.title.orEmpty()
                val invalid = needsAttention(choice.slot, level, choice.optional)
                if (choice.entries.isNotEmpty()) {
                    val label = if (choice.optional) "$sourceTitle (optional substitution)" else Progression.choiceLabel(choice.slot.choiceId, className)
                    LevelChoice(label, selected(choice.slot), enabled = !model.busy && !future, powerUsage = selectedPowerUsage(choice.slot) ?: label, invalid = invalid) {
                        open("entry", level, choice.slot)
                    }
                } else if (choice.valueKind != null) {
                    val label = Progression.valueChoiceLabel(requireNotNull(choice.valueKind), choice.slot.ordinal, sourceTitle, source?.category)
                    LevelValueChoice(choice, label, values.firstOrNull { it.slot == choice.slot }?.value,
                        enabled = !model.busy && !future, invalid = invalid) { open("value", level, choice.slot) }
                } else if (choice.skills.isNotEmpty()) {
                    LevelChoice(Progression.choiceLabel(choice.slot.choiceId, className), skills.firstOrNull { it.slot == choice.slot }?.skill?.name?.readable() ?: "Choose…", enabled = !model.busy && !future, invalid = invalid) {
                        open("skill", level, choice.slot)
                    }
                }
            }
            otherFeatures.forEach { grant -> AutomaticGrantCard(document.id, grant) }
            if (level == 1 && state.rules.entries.any { it.definition.entry.category == EntryCategory.CLASS && it.definition.entry.presentation.title.contains("Fighter") } &&
                levelChoices.none { it.slot.choiceId.contains("react", ignoreCase = true) }) {
                Text("Reactivity and Combat Superiority choices are not yet authored in the installed Fighter proof.", color = Dim)
            }
            if (schedule.ability != null) {
                if (schedule.ability == "non-main") {
                    val advancements = document.levels.firstOrNull { it.level == level }?.abilityAdvancements.orEmpty()
                    val slot = ChoiceSlotId("advancement.$level", "ability", 0)
                    val increase = advancements.singleOrNull()?.takeIf { it.slot == slot }?.increases?.entries?.singleOrNull()
                    LevelChoice("Ability increase", increase?.key?.name?.readable() ?: "Choose…",
                        enabled = !future && !model.busy,
                        invalid = !future && (increase?.value != 1 || increase.key == document.abilities.mainAbility)) {
                        open("advancement", level)
                    }
                } else { Text("+1 to ${schedule.ability} abilities arrives automatically", color = Dim) }
            }
            if (future || level > 2) {
                schedule.powers.forEachIndexed { ordinal, power ->
                    val slot = ChoiceSlotId("advancement.$level", "power", ordinal)
                    LevelChoice("$power power", selected(slot), enabled = !future && !model.busy, powerUsage = selectedPowerUsage(slot) ?: power,
                        invalid = needsAttention(slot, level)) {
                        open("entry", level, slot)
                    }
                }
            } else if (schedule.powers.isNotEmpty() && levelChoices.none { it.entries.isNotEmpty() }) {
                Text("Choose a class to see its available powers.", color = Dim)
            }
            if (schedule.feat) {
                val slot = ChoiceSlotId(if (level == 1) "creation" else "advancement.$level", "feat", 0)
                LevelChoice("Feat", selected(slot), enabled = !future && !model.busy, invalid = needsAttention(slot, level)) { open("feat", level, slot) }
            }
            otherPowers.forEach { grant -> AutomaticGrantCard(document.id, grant) }
            schedule.replacement?.let {
                val replacements = document.levels.firstOrNull { decisions -> decisions.level == level }?.replacements.orEmpty()
                val invalid = !future && replacements.any { change ->
                    change.replaces in invalidSlots || change.replacement.slot in invalidSlots
                }
                LevelChoice("Replace a $it attack power (optional)", "Choose…", enabled = !future && !model.busy,
                    powerUsage = it, invalid = invalid) {
                    open("replacement", level, ChoiceSlotId("advancement.$level", "replacement", 0))
                }
            }
            schedule.automatic.forEach { Text("$it arrives automatically", color = Dim) }
            if (powerSlots.isNotEmpty()) {
                val gap = 4.dp
                Row(
                    Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(gap),
                ) {
                    powerSlots.forEach { choice ->
                        val sourceTitle = state.rules.entries.firstOrNull { it.instanceId == choice.slot.sourceInstanceId }
                            ?.definition?.entry?.presentation?.title.orEmpty()
                        val label = if (choice.optional) sourceTitle else Progression.choiceLabel(choice.slot.choiceId, className)
                        val compactLabel = label.removeSuffix(" attack power").removeSuffix(" power")
                        LevelOnePowerTile(
                            compactLabel, selected(choice.slot), selectedPowerUsage(choice.slot) ?: label,
                            Modifier.weight(1f).heightIn(min = 48.dp).fillMaxHeight(), enabled = !model.busy,
                            invalid = needsAttention(choice.slot, level, choice.optional),
                        ) { open("entry", level, choice.slot) }
                    }
                }
            }
        }
        if (document.level < 30) {
            TextButton({ upcoming = !upcoming }) { Text(if (upcoming) "Hide upcoming levels" else "Show upcoming levels ${document.level + 1}–30") }
        }
    }
    editor?.let { request ->
        ProgressionSheet(request, state, model) { editor = null }
    }
}

/** Keeps paired creation fields equally wide and as tall as the larger label or value needs. */
@Composable
private fun CreationChoicePair(content: @Composable RowScope.() -> Unit) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = content)
}

/** Separates grant sources within Base. */
@Composable
private fun StartingGrantDivider(title: String) {
    Row(
        Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HorizontalDivider(Modifier.width(14.dp), thickness = 2.dp, color = Accent)
        Text(title, Modifier.semantics { heading() }, color = Accent, fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 18.sp)
        HorizontalDivider(Modifier.weight(1f), color = Line)
    }
}

/** Labels the choices made at creation and the rows gained at each character level. */
@Composable
private fun ProgressionLevelHeading(level: Int) {
    Surface(Modifier.fillMaxWidth().padding(top = 16.dp), color = Wash) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            if (level > 0) {
                Text("LEVEL  ", color = Dim, letterSpacing = 2.sp, fontSize = 12.sp)
            }
            Text(if (level == 0) "Base" else level.toString(), fontFamily = FontFamily.Serif, fontSize = 28.sp)
        }
    }
}

/** Expands the rules for a granted entry without opening an editor. */
@Composable
private fun AutomaticGrantCard(documentId: String, grant: ProgressionGrant) {
    key(documentId, grant.occurrence.instanceId, grant.entry.id) {
        var expanded by remember { mutableStateOf(false) }
        Surface(
            Modifier.fillMaxWidth().clickable(role = Role.Button) { expanded = !expanded }
                .semantics { stateDescription = if (expanded) "Granted, expanded" else "Granted, collapsed" },
            color = Wash,
            border = BorderStroke(1.dp, Line),
        ) {
            Column {
                FolioFieldContent(grant.label, grant.entry.presentation.title, compact = true) {
                    Text(if (expanded) "GRANTED  ▴" else "GRANTED  ▾", color = Dim, fontSize = 9.sp,
                        lineHeight = 12.sp, letterSpacing = 1.sp)
                }
                if (expanded) {
                    Column(Modifier.padding(start = 12.dp, end = 12.dp, bottom = 6.dp)) {
                        if (grant.isPower) {
                            PowerBlock(grant.entry, showTitle = false)
                        } else {
                            AdvancementProse(grant.entry.presentation.description)
                        }
                    }
                }
            }
        }
    }
}

/** Displays a committed value and opens its editor with the original engine slot. */
@Composable
private fun LevelValueChoice(choice: EngineChoice, label: String, value: String?, enabled: Boolean, invalid: Boolean,
    modifier: Modifier = Modifier, edit: () -> Unit) {
    val title = choice.values.firstOrNull { it.id == value }?.title ?: value ?: "Choose…"
    LevelChoice(label, title, modifier, enabled = enabled, invalid = invalid, action = edit)
}

/** A compact power slot with the same edit action and frequency color as a Levels field. */
@Composable
private fun LevelOnePowerTile(
    label: String,
    title: String,
    usage: String,
    modifier: Modifier,
    enabled: Boolean,
    invalid: Boolean,
    action: () -> Unit,
) {
    val errorColor = MaterialTheme.colorScheme.error
    val accent = powerChoiceColor(usage).takeUnless { invalid }
    Surface(
        modifier.clickable(enabled = enabled, role = Role.Button, onClick = action)
            .semantics { if (invalid) { stateDescription = "Needs attention" } },
        color = if (invalid) errorColor.copy(alpha = 0.10f).compositeOver(Paper) else Paper,
        border = BorderStroke(1.dp, if (invalid) errorColor else Line),
    ) {
        Column(
            Modifier.leftEdgeAccent(accent).padding(horizontal = 4.dp, vertical = 3.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(label, color = if (invalid) errorColor else Dim, fontSize = 10.sp, lineHeight = 11.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            Text(title, color = if (invalid) errorColor else Ink,
                fontFamily = FontFamily.Serif, fontSize = 11.sp, lineHeight = 12.sp,
                maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        }
    }
}

/** Applies the Levels layout and the known power frequency color to choice fields. */
@Composable
private fun LevelChoice(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    powerUsage: String? = null,
    valueIsHint: Boolean = false,
    invalid: Boolean = false,
    action: () -> Unit,
) {
    Field(
        label, value, modifier, enabled, compact = true, leftAccent = powerUsage?.let(::powerChoiceColor),
        valueIsHint = valueIsHint, invalid = invalid, action = action,
    )
}

@Composable
private fun ProgressionSheet(request: ProgressionEditor, state: BuilderState, model: BuilderSession, dismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val document = state.document
    val mainAbilities = if (request.kind == "allocation") {
        state.rules.choices.firstOrNull { it.slot == document.abilities.source }?.abilities.orEmpty()
    } else {
        emptyList()
    }
    var edit by remember(request) {
        val fixedMain = mainAbilities.singleOrNull()?.takeIf { it != document.abilities.mainAbility }
        mutableStateOf<BuilderEdit?>(fixedMain?.let {
            BuilderEdit.Allocation(Progression.changeMainAbility(document.abilities, it))
        })
    }
    var selected by remember(request) { mutableStateOf(state.document.levels.flatMap { it.entries }.firstOrNull { it.slot == request.slot }?.selection?.entryId
        ?: state.rules.entries.firstOrNull { it.slot == request.slot && it.granted }?.definition?.entry?.id) }
    var expanded by remember(request) { mutableStateOf(selected) }
    var showIneligible by remember(request) { mutableStateOf(false) }
    var featTab by remember(request) { mutableStateOf("Class") }
    var optionRows by remember(request, featTab, state.document) { mutableStateOf<List<BuilderOptionRow>?>(null) }
    var optionLoadFinished by remember(request, featTab, state.document) { mutableStateOf(false) }
    var replacementTarget by remember(request) { mutableStateOf<ChoiceSlotId?>(null) }
    val catalogPicker = request.kind in listOf("entry", "feat", "replacement")
    val featAccessTitles = remember(model, document.packages) { model.featAccessTitles() }
    LaunchedEffect(request, if (request.kind == "feat") featTab else null, document) {
        if (catalogPicker) {
            optionRows = null
            val group = if (request.kind == "feat") FeatGroup.valueOf(featTab.uppercase()) else null
            model.progressionOptionRows(request.level, request.slot!!, group) { optionRows = it }
            optionLoadFinished = true
        }
    }
    ChoicePickerSheet(model.busy, dismiss) {
        request.slot?.let { Progression.choiceIntroduction(state, it) }?.let { introduction ->
            Box(Modifier.fillMaxWidth().heightIn(max = 120.dp).folioScroll(rememberScrollState()).padding(bottom = 8.dp)) {
                AdvancementProse(introduction)
            }
        }
        if (catalogPicker) {
            key(request, featTab) {
                CatalogChoiceList(request, state, optionRows, optionLoadFinished, selected, expanded, featTab, showIneligible,
                    replacementTarget, featAccessTitles, Modifier.weight(1f),
                    changeTab = { featTab = it }, toggleIneligible = { showIneligible = !showIneligible },
                    changeTarget = { replacementTarget = it; edit = null; selected = null; expanded = null }, choose = { option ->
                        val entry = option.entry.entry
                        expanded = choiceExpansionOnTap(entry.id, selected, expanded)
                        if (selected != entry.id) {
                            selected = entry.id
                            edit = if (request.level <= 2) {
                                val slot = requireNotNull(request.slot)
                                BuilderEdit.Entry(request.level, slot, entry.id, model.progressionEntryInstance(request.level, slot),
                                    acceptIneligible = option.eligibility != Eligibility.ELIGIBLE)
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
            Column(Modifier.weight(1f).folioScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (request.level > 2) { Text("Incomplete automation: later-level eligibility and totals are unavailable.", color = Accent) }
                when (request.kind) {
                    "advancement" -> {
                        Ability.entries.filter { it != document.abilities.mainAbility }.forEach { ability ->
                            ChoiceCard(ability.name.readable(), selected == ability.name, false, true, null, {
                                selected = ability.name
                                val decisions = document.levels.firstOrNull { it.level == request.level } ?: LevelDecisions(request.level)
                                edit = BuilderEdit.LaterDecisions(decisions.copy(abilityAdvancements = listOf(
                                    AbilityAdvancement(ChoiceSlotId("advancement.${request.level}", "ability", 0), mapOf(ability to 1)))))
                            }, compact = true) { }
                        }
                    }
                    "allocation" -> {
                        val allocation = (edit as? BuilderEdit.Allocation)?.value ?: document.abilities
                        val remaining = Progression.remainingPoints(allocation)
                        if (mainAbilities.size > 1) {
                            Text("Main ability", fontFamily = FontFamily.Serif)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                mainAbilities.forEach { ability ->
                                    FilterChip(
                                        selected = ability == allocation.mainAbility,
                                        onClick = {
                                            if (ability != allocation.mainAbility) {
                                                edit = BuilderEdit.Allocation(Progression.changeMainAbility(allocation, ability))
                                            }
                                        },
                                        label = { Text(ability.name.readable()) },
                                    )
                                }
                            }
                        }
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
                                val value = allocation.points[ability] ?: 0
                                OutlinedButton(enabled = Progression.canAdjustAbility(allocation, ability, -1), modifier = Modifier.size(48.dp),
                                    shape = RoundedCornerShape(3.dp), contentPadding = PaddingValues(0.dp), onClick = {
                                    edit = BuilderEdit.Allocation(allocation.copy(points = allocation.points + (ability to value - 1)))
                                }) { Text("−", fontSize = 24.sp) }
                                Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) {
                                    Text(value.toString(), color = Accent, fontFamily = FontFamily.Serif, fontSize = 24.sp)
                                }
                                OutlinedButton(enabled = Progression.canAdjustAbility(allocation, ability, 1), modifier = Modifier.size(48.dp),
                                    shape = RoundedCornerShape(3.dp), contentPadding = PaddingValues(0.dp), onClick = {
                                    edit = BuilderEdit.Allocation(allocation.copy(points = allocation.points + (ability to value + 1)))
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
                            }, compact = true) {
                                PlainChoiceDescription(BackgroundDescriptions[name].orEmpty())
                                PlainChoiceDescription("Choose one: ${skills.joinToString { it.name.readable() }}")
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
                            }, compact = true) { }
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
                            SkillRow(skill, modifier, chosen, blocked) {
                                picks = if (chosen) picks - skill else if (slots.size == 1) listOf(skill) else if (picks.size < 2) picks + skill else picks
                                edit = BuilderEdit.Batch(listOf(BuilderEdit.RemoveProficiency(slots.toSet())) + picks.mapIndexed { index, pick ->
                                    BuilderEdit.Proficiency(request.level, ProficiencyChoice(slots[index], pick))
                                })
                            }
                        }
                        if (slots.size == 2) { Text("${2 - picks.size} left", color = Dim) }

                    }
                    else -> Unit
                }
            }
        }
        val clear: (() -> Unit)? = if (request.slot != null && selected != null) {
            { edit = BuilderEdit.RemoveEntry(request.slot); selected = null; expanded = null }
        } else {
            null
        }
        val valid = edit != null &&
            (request.kind != "free" || (edit as? BuilderEdit.Batch)?.edits?.count { it is BuilderEdit.Proficiency } == 2) &&
            (request.kind != "allocation" || (edit as? BuilderEdit.Allocation)?.value?.let {
                it.mainAbility in mainAbilities && Progression.validAllocation(it)
            } == true)
        ChoicePickerActions(model.busy, valid, dismiss, clear) {
            val command = edit ?: return@ChoicePickerActions
            scope.launch { model.run { edit(command) }; if (model.errors.isEmpty()) dismiss() }
        }
    }
}

/** Tallest a Progression sheet grows; every sheet uses this height so switching lists never resizes it. */
private val PickerSheetMaxHeight = 710.dp

/** Largest share of the window a Progression sheet may use, leaving 40% less unused space than the former 85%. */
private const val PickerSheetMaxScreenFraction = 0.91f

/**
 * Fixed height shared by every Progression sheet, whatever its content.
 *
 * @param screenHeightDp the window height available to the sheet.
 * @return the maximum sheet height, reduced only when the screen cannot fit it.
 */
internal fun pickerSheetHeight(screenHeightDp: Int): Dp = minOf(PickerSheetMaxHeight, (screenHeightDp * PickerSheetMaxScreenFraction).dp)

/** The current category shows eligibility progress until its checked options are ready. */
@Composable
private fun CatalogChoiceList(request: ProgressionEditor, state: BuilderState, rows: List<BuilderOptionRow>?, loadFinished: Boolean,
    selected: String?, expanded: String?, featTab: String, showIneligible: Boolean, replacementTarget: ChoiceSlotId?,
    featAccessTitles: Map<String, String>, modifier: Modifier, changeTab: (String) -> Unit, toggleIneligible: () -> Unit,
    changeTarget: (ChoiceSlotId) -> Unit, choose: (BuilderOption) -> Unit) {
    val taken = remember(state.document, request.slot) {
        state.document.levels.flatMap { it.entries }.filter { it.slot != request.slot }.map { it.selection.entryId }.toSet()
    }
    val options = remember(rows, taken) { pickerOptions(rows, taken) }
    val utilityPicker = request.kind == "entry" && request.slot?.let {
        isUtilityPowerPicker(request.level, it, state.rules.entries)
    } == true
    if (usesPowerReader(rows) && options is PickerOptions.Ready) {
        val targets = if (request.kind == "replacement") {
            state.document.levels.filter { it.level < request.level }.flatMap { it.entries }.filter { old ->
                state.rules.entries.any { it.slot == old.slot && it.definition.entry.category == EntryCategory.POWER } || old.slot.choiceId == "power"
            }
        } else {
            emptyList()
        }
        PowerChoiceReader(options, taken, selected, utilityPicker, showIneligible, replacementTarget, targets,
            modifier, request.level > 2, request.kind == "replacement", toggleIneligible, changeTarget, choose)
        return
    }
    val advancementRoot = request.slot == ChoiceSlotId("creation", "theme", 0) ||
        request.slot == ChoiceSlotId("creation", "ancestry", 0)
    if (options is PickerOptions.Ready &&
        (advancementRoot || usesClassFeatureReader(rows, request.slot, state.rules.entries))
    ) {
        AdvancementChoiceReader(options, taken, selected, showIneligible, modifier, toggleIneligible, choose)
        return
    }
    if (request.slot == ChoiceSlotId("creation", "class", 0) && options is PickerOptions.Ready) {
        ClassPicker(options, selected, expanded, modifier, showIneligible = showIneligible,
            taken = taken, toggleIneligible = toggleIneligible, choose = choose)
        return
    }
    fun LazyListScope.optionItems(options: List<BuilderOptionRow>, eligible: Boolean) {
        items(options, key = { "option:${it.metadata.metadata.id}" }) { row ->
            val option = row.option
            val entry = option?.entry?.entry
            val level = entry?.mechanics?.prerequisites?.filterIsInstance<Prerequisite.Level>()?.maxOfOrNull { it.minimum }
                ?: entry?.presentation?.description?.let { Regex("(?:Attack|Utility) (\\d+)").find(it)?.groupValues?.get(1)?.toIntOrNull() }
            val titleColor = entry?.takeIf { utilityPicker && it.category == EntryCategory.POWER }
                ?.let(::powerChoiceUsage)?.let(::powerChoiceColor) ?: Ink
            val badge = if (entry?.category == EntryCategory.FEAT) entry.featTierBadge() else level?.toString()
            ChoiceCard(row.metadata.metadata.title, selected == row.metadata.metadata.id,
                expanded == row.metadata.metadata.id || !eligible, option != null, badge, { option?.let(choose) },
                compact = true, titleColor = if (eligible) titleColor else MaterialTheme.colorScheme.error) {
                if (entry == null) {
                    Text(row.diagnostics.joinToString { it.message }.ifBlank { "Definition is unavailable." }, fontSize = 12.sp, color = Dim)
                } else {
                    if (entry.category == EntryCategory.FEAT) {
                        entry.featPrerequisiteText(featAccessTitles)?.let {
                            Text("Prerequisites: $it", fontSize = 12.sp, lineHeight = 15.sp, color = Ink)
                        }
                    }
                    if (!eligible) {
                        val reason = if (entry.id in taken) "Already chosen"
                            else option.diagnostics.joinToString { it.message }.ifBlank { "Ineligible" }
                        Text(reason, fontSize = 12.sp, lineHeight = 15.sp, color = Dim)
                    } else {
                        when {
                            entry.category == EntryCategory.POWER -> PowerBlock(entry, showTitle = false)
                            else -> ControlledDescription(entry.presentation.description, compact = true)
                        }
                        if (entry.mechanics.prerequisites.any { it is Prerequisite.Unadapted }) {
                            Text("Prerequisite not adapted", fontSize = 12.sp, color = Accent)
                        }
                    }
                }
            }
        }
    }
    CollapsibleChoiceList(modifier) {
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
        if (options is PickerOptions.Loading) {
            item("loading") {
                val progress = options.total?.let {
                    if (request.level > 2) " ${options.checked}/$it loaded"
                    else " ${options.checked}/$it checked · ${options.eligible} eligible"
                }.orEmpty()
                if (loadFinished) {
                    Text("Could not finish loading options. Reopen the picker to retry.", color = MaterialTheme.colorScheme.error)
                } else {
                    val label = if (request.level > 2) "Loading options…" else "Checking eligibility…"
                    Text(label + progress, color = Dim)
                }
            }
            return@CollapsibleChoiceList
        }
        if (request.kind == "replacement") {
            val targets = state.document.levels.filter { it.level < request.level }.flatMap { it.entries }.filter { old ->
                state.rules.entries.any { it.slot == old.slot && it.definition.entry.category == EntryCategory.POWER } || old.slot.choiceId == "power"
            }
            items(targets, key = { "replace:${it.instanceId}" }) { old ->
                ChoiceCard("Replace ${old.selection.savedTitle}", replacementTarget == old.slot, false, true, null,
                    { changeTarget(old.slot) }, compact = true) { }
            }
        }
        if (options is PickerOptions.Ready) {
            optionItems(options.eligible, eligible = true)
            if (options.ineligible.isNotEmpty()) {
                item("toggle") {
                    IneligibleChoiceToggle(options.ineligible.size, showIneligible, toggleIneligible)
                }
                if (showIneligible) {
                    optionItems(options.ineligible, eligible = false)
                }
            }
            if (options.eligible.isEmpty() && options.ineligible.isEmpty()) {
                item("empty") {
                    Text("No ${if (request.kind == "feat") featTab.lowercase() else "available"} options in the installed content.", color = Dim)
                }
            }
        }
    }
}

/** A single-line search with the same touch height as the compact picker rows. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PowerSearchField(query: String, onQueryChange: (String) -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val textStyle = MaterialTheme.typography.bodyMedium
    BasicTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp).heightIn(min = 48.dp),
        textStyle = textStyle.copy(color = Ink),
        singleLine = true,
        cursorBrush = SolidColor(Accent),
        interactionSource = interactionSource,
        decorationBox = { innerTextField ->
            OutlinedTextFieldDefaults.DecorationBox(
                value = query,
                innerTextField = innerTextField,
                enabled = true,
                singleLine = true,
                visualTransformation = VisualTransformation.None,
                interactionSource = interactionSource,
                placeholder = { Text("Search powers", style = textStyle) },
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            )
        },
    )
}

/** Compact browsing stays above an independently scrolling power description with explicit row taps drafting the selection. */
@Composable
private fun PowerChoiceReader(
    options: PickerOptions.Ready, taken: Set<String>, selected: String?, utilityPicker: Boolean,
    showIneligible: Boolean, replacementTarget: ChoiceSlotId?, targets: List<EntryChoice>, modifier: Modifier,
    incompleteAutomation: Boolean, requiresReplacementTarget: Boolean, toggleIneligible: () -> Unit,
    changeTarget: (ChoiceSlotId) -> Unit, choose: (BuilderOption) -> Unit,
) {
    var inspected by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    val visible = visibleReaderPowers(options, showIneligible, query)
    val page = catalogReaderPage(visible, inspected, selected)
    Column(modifier.fillMaxWidth()) {
        if (incompleteAutomation) {
            Text("Incomplete automation: later-level eligibility and totals are unavailable.", color = Accent)
        }
        PowerSearchField(query, { query = it })
        CatalogReaderPanes(Modifier.weight(1f), page?.metadata?.metadata?.id, list = {
            items(targets, key = { "replace:${it.instanceId}" }) { old ->
                ChoiceCard("Replace ${old.selection.savedTitle}", replacementTarget == old.slot, false, true, null,
                    { changeTarget(old.slot) }, compact = true) { }
            }
            if (visible.isEmpty()) {
                item("empty") { Text("No powers match your search.", color = Dim, fontSize = 12.sp) }
            }
            items(visible, key = { "power:${it.metadata.metadata.id}" }) { row ->
                val entry = row.option?.entry?.entry
                val level = entry?.mechanics?.prerequisites?.filterIsInstance<Prerequisite.Level>()?.maxOfOrNull { it.minimum }
                    ?: entry?.presentation?.description?.let { Regex("(?:Attack|Utility) (\\d+)").find(it)?.groupValues?.get(1)?.toIntOrNull() }
                val color = if (!row.pickerSelectable(taken)) {
                    MaterialTheme.colorScheme.error
                } else {
                    if (utilityPicker) entry?.let(::powerChoiceUsage)?.let(::powerChoiceColor) ?: Ink else Ink
                }
                ChoiceCard(row.metadata.metadata.title, selected == row.metadata.metadata.id, false, true, level?.toString(),
                    {
                        inspected = row.metadata.metadata.id
                        row.powerDraftOnTap(taken, selected,
                            replacementReady = !requiresReplacementTarget || replacementTarget != null,
                            allowIneligible = showIneligible)?.let(choose)
                    }, compact = true, titleColor = color,
                    viewed = page?.metadata?.metadata?.id == row.metadata.metadata.id) { }
            }
            if (options.ineligible.isNotEmpty()) {
                item("toggle") {
                    TextButton(toggleIneligible) {
                        Text(if (showIneligible) "Hide ineligible" else "Show ${options.ineligible.size} ineligible")
                    }
                }
            }
        }) {
            page?.let { row ->
                val entry = row.option?.entry?.entry
                if (entry != null) {
                    PowerBlock(entry)
                    if (entry.mechanics.prerequisites.any { it is Prerequisite.Unadapted }) {
                        Text("Prerequisite not adapted", fontSize = 12.sp, color = Accent)
                    }
                } else {
                    Text(row.metadata.metadata.title, fontFamily = FontFamily.Serif, fontSize = 18.sp, color = Ink)
                }
                if (!row.pickerSelectable(taken)) {
                    Text(readerIneligibility(row, taken), fontSize = 12.sp, color = Dim)
                }
            }
        }
    }
}

/** Keep the catalog and its detail independently scrollable, resetting detail scroll for each entry. */
@Composable
private fun CatalogReaderPanes(
    modifier: Modifier,
    entryId: String?,
    list: LazyListScope.() -> Unit,
    detail: @Composable () -> Unit,
) {
    val listScroll = rememberLazyListState()
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val dividerPadding = 8.dp
        val dividerThickness = 1.dp
        val listHeight = if (entryId == null) {
            Modifier.fillMaxHeight()
        } else {
            val paneHeight = (maxHeight - dividerPadding * 2 - dividerThickness).coerceAtLeast(0.dp)
            Modifier.heightIn(max = paneHeight * 0.4f)
        }
        Column(Modifier.fillMaxSize()) {
            LazyColumn(listHeight.fillMaxWidth().folioScroll(listScroll),
                state = listScroll, verticalArrangement = Arrangement.spacedBy(4.dp), content = list)
            if (entryId != null) {
                HorizontalDivider(
                    color = Line, thickness = dividerThickness, modifier = Modifier.padding(vertical = dividerPadding),
                )
                key(entryId) {
                    Column(Modifier.weight(1f).fillMaxWidth().folioScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        detail()
                    }
                }
            }
        }
    }
}

/** Explain why a catalog entry can be inspected but cannot be chosen. */
private fun readerIneligibility(row: BuilderOptionRow, taken: Set<String>): String =
    if (row.metadata.metadata.id in taken) "Already chosen" else row.diagnostics.joinToString { it.message }.ifBlank {
        if (row.option == null) "Definition is unavailable." else "Ineligible"
    }

/** Preview advancement entries and stage the tapped choice for Save. */
@Composable
private fun AdvancementChoiceReader(
    options: PickerOptions.Ready,
    taken: Set<String>,
    selected: String?,
    showIneligible: Boolean,
    modifier: Modifier,
    toggleIneligible: () -> Unit,
    choose: (BuilderOption) -> Unit,
) {
    var inspected by remember { mutableStateOf<String?>(null) }
    val visible = options.eligible + if (showIneligible) options.ineligible else emptyList()
    val page = catalogReaderPage(visible, inspected, selected)
    val pageId = page?.metadata?.metadata?.id
    CatalogReaderPanes(modifier, pageId, list = {
        items(visible, key = { it.metadata.metadata.id }) { row ->
            val id = row.metadata.metadata.id
            ChoiceCard(row.metadata.metadata.title, selected == id, false, true, null,
                {
                    inspected = id
                    row.catalogReaderDraft(taken, selected, allowIneligible = showIneligible)?.let(choose)
                }, compact = true, viewed = pageId == id,
                titleColor = if (row.pickerSelectable(taken)) Ink else MaterialTheme.colorScheme.error) { }
        }
        if (options.ineligible.isNotEmpty()) {
            item("toggle") {
                TextButton(toggleIneligible) {
                    Text(if (showIneligible) "Hide ineligible" else "Show ${options.ineligible.size} ineligible")
                }
            }
        }
        if (options.eligible.isEmpty() && options.ineligible.isEmpty()) {
            item("empty") { Text("No available options in the installed content.", color = Dim) }
        }
    }) {
        page?.let { row ->
            val entry = row.option?.entry?.entry
            Text(row.metadata.metadata.title, fontFamily = FontFamily.Serif, fontSize = 18.sp, color = Ink)
            if (!row.pickerSelectable(taken)) {
                Text(readerIneligibility(row, taken), fontSize = 12.sp, color = Dim)
            }
            if (entry?.category == EntryCategory.POWER) {
                PowerBlock(entry, showTitle = false)
            } else if (entry != null) {
                val details = remember(entry, row.advancementDefinitions) {
                    advancementDetail(entry, row.advancementDefinitions)
                }
                AdvancementDetails(details, inlineStartingGrants = entry.category == EntryCategory.FEATURE)
            }
        }
    }
}
