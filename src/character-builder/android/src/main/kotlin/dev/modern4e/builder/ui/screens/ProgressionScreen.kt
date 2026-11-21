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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
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
    val powerEntryIds = remember(model, state) { model.powerEntryIds() }
    val document = state.document
    val entries = document.levels.flatMap { it.entries }
    val skills = document.levels.flatMap { it.proficiencies }
    val values = document.levels.flatMap { it.values }
    val ancestryLanguages = remember(state) { Progression.ancestryLanguageChoices(state) }
    val ancestryPowers = remember(state, powerEntryIds) { Progression.ancestryPowerChoices(state, powerEntryIds) }
    val activeGrants = remember(state) { Progression.automaticGrants(state) }
    // The last preview stays up while the next is computed, so upcoming levels never collapse and reflow after a save, and
    // a returning tab starts from the session's remembered one instead of an empty screen.
    val futureState by key(document.id) {
        produceState(model.cachedFuturePreview(document.id), state, model) {
            value = if (document.level < BuilderSession.MAX_LEVEL) {
                model.progressionPreview(state, BuilderSession.MAX_LEVEL)
            } else {
                null
            }
        }
    }
    val futureGrants = remember(futureState, document.level) {
        futureState?.let(Progression::automaticGrants).orEmpty().filter { it.level > document.level }
    }
    val grantsByLevel = remember(activeGrants, futureGrants) { (activeGrants + futureGrants).groupBy { it.level } }
    val invalidSlots = remember(state.rules) { Progression.invalidChoiceSlots(state.rules) }
    val filledSlots = remember(state) {
        buildSet {
            entries.mapTo(this) { it.slot }
            skills.mapTo(this) { it.slot }
            values.mapTo(this) { it.slot }
            state.rules.entries.filter { it.granted }.mapTo(this) { it.slot }
        }
    }
    fun needsAttention(slot: ChoiceSlotId, level: Int = 1, optional: Boolean = false) = Progression.choiceNeedsAttention(
        level <= document.level, optional, model.pendingSelection(slot)?.let { it.title != null } ?: (slot in filledSlots), slot in invalidSlots)
    fun selected(slot: ChoiceSlotId, displayState: BuilderState = state) = model.pendingSelection(slot)?.let { it.title ?: ChoosePlaceholder }
        ?: entries.firstOrNull { it.slot == slot }?.selection?.savedTitle
        ?: displayState.rules.entries.firstOrNull { it.slot == slot && it.granted }?.definition?.entry?.presentation?.title ?: ChoosePlaceholder
    fun selectedPowerUsage(slot: ChoiceSlotId, displayState: BuilderState = state) = displayState.rules.entries.firstOrNull { it.slot == slot }
        ?.definition?.entry?.let(::powerChoiceUsage)
    fun open(kind: String, level: Int = 1, slot: ChoiceSlotId? = null) { editor = ProgressionEditor(kind, level, slot) }
    fun saving(kind: String, level: Int = 1, slot: ChoiceSlotId? = null) = model.isSaving(ProgressionEditor(kind, level, slot))
    fun creationNeedsAttention(kind: String): Boolean {
        val background = kind == "environment" || kind == "upbringing"
        val slot = if (background) null else AdvancementRules.rootSlot(1, EntryCategory.valueOf(kind.uppercase()))
        val backgroundOptions = if (kind == "environment") ModernCreation.environments else ModernCreation.upbringings
        return if (slot == null) Progression.background(document, kind) !in backgroundOptions else needsAttention(slot)
    }
    fun skillTileChosen(kind: String): Boolean {
        val backgroundKind = kind.removeSuffix("-skill").takeIf { it != kind }
        val background = backgroundKind?.let { Progression.background(document, it) }
        val available = background == null || background.isNotBlank()
        val freeSlots = (0..1).map { ChoiceSlotId("creation", "free-skill", it) }
        return when (kind) {
            "allocation" -> Progression.validAllocation(document.abilities) && document.abilities.source !in invalidSlots
            "free" -> freeSlots.none { needsAttention(it) }
            else -> available && !needsAttention(ChoiceSlotId("background.$backgroundKind.$background", "skill", 0))
        }
    }
    fun abilityIncreaseInvalid(level: Int): Boolean {
        val rootSlot = AdvancementRules.rootSlot(level, SlotCategory.AbilityIncrease)
        val advancements = document.levels.firstOrNull { it.level == level }?.abilityAdvancements.orEmpty()
        val increase = advancements.singleOrNull()?.takeIf { it.slot == (rootSlot ?: AdvancementRules.abilitySlot(level)) }
            ?.increases?.entries?.singleOrNull()
        return rootSlot != null && level <= document.level &&
            (increase?.value != 1 || increase.key == document.abilities.mainAbility)
    }
    fun replacementInvalid(level: Int): Boolean {
        val replacementSlot = AdvancementRules.rootSlots(level).firstOrNull { root -> root.category is SlotCategory.Replacement }?.slot
        val replacements = document.levels.firstOrNull { decisions -> decisions.level == level }?.replacements.orEmpty()
        return replacementSlot != null && level <= document.level &&
            (replacements.none { it.kind == ReplacementKind.PROGRESSION } || replacements.any { change ->
                change.replaces in invalidSlots || change.replacement.slot in invalidSlots
            })
    }
    /** Counts what the Base heading reports: the origin choices shown above Level 1. */
    fun baseNeeds(): Int = listOf("ancestry", "class", "theme", "environment", "upbringing").count(::creationNeedsAttention) +
        ancestryLanguages.count { needsAttention(it.slot, optional = it.optional) } +
        ancestryPowers.count { needsAttention(it.slot, optional = it.optional) }
    /** Counts the choices a reached level's rows flag, so its heading can report how many are left. */
    fun levelNeeds(level: Int): Int {
        if (level > document.level) {
            return 0
        }
        val schedule = Progression.level(level)
        val levelChoices = Progression.levelChoices(state, level).filterNot { it in ancestryLanguages || it in ancestryPowers }
        val (powerSlots, regularChoices) = Progression.partitionLevelChoices(level, levelChoices, powerEntryIds)
        val shown = powerSlots + regularChoices.filter { it.entries.isNotEmpty() || it.valueKind != null || it.skills.isNotEmpty() }
        var needs = shown.count { needsAttention(it.slot, level, it.optional) }
        if (level == 1) {
            needs += listOf("allocation", "environment-skill", "upbringing-skill", "free").count { !skillTileChosen(it) }
        }
        AdvancementRules.rootSlot(level, EntryCategory.PARAGON_PATH)?.let { slot ->
            needs += if (needsAttention(slot, level)) 1 else 0
        }
        if (schedule.ability == "non-main" && abilityIncreaseInvalid(level)) {
            needs++
        }
        if (schedule.feat) {
            val slot = AdvancementRules.rootSlot(level, EntryCategory.FEAT)
            if (slot != null && needsAttention(slot, level)) {
                needs++
            }
        }
        if (schedule.replacement != null && replacementInvalid(level)) {
            needs++
        }
        return needs
    }
    @Composable
    fun CreationChoice(kind: String, modifier: Modifier = Modifier) {
        val background = kind == "environment" || kind == "upbringing"
        val slot = if (background) null else AdvancementRules.rootSlot(1, EntryCategory.valueOf(kind.uppercase()))
        val selection = if (slot == null) Progression.background(document, kind) else selected(slot)
        val invalid = creationNeedsAttention(kind)
        LevelChoice(
            kind.readable(),
            if (background) selection.ifBlank { ChoosePlaceholder }.readable() else selection,
            modifier, enabled = !model.busy, invalid = invalid,
            saving = if (background) saving(kind) else saving("entry", slot = slot),
        ) {
            open(if (background) kind else "entry", slot = if (background) null else slot)
        }
    }
    @Composable
    fun AncestryLanguage(choice: EngineChoice, modifier: Modifier = Modifier) {
        LevelValueChoice(choice, "Ancestry Language", values.firstOrNull { it.slot == choice.slot }?.value,
            enabled = !model.busy, invalid = needsAttention(choice.slot, optional = choice.optional), modifier = modifier,
            saving = saving("value", slot = choice.slot)) {
            open("value", level = 1, slot = choice.slot)
        }
    }
    val scroll = rememberScrollState()
    val openChoices = remember { OpenChoiceRegistry() }
    var viewport by remember { mutableStateOf<LayoutCoordinates?>(null) }
    ScrollToFirstOpenChoice(model, scroll, openChoices) { viewport?.takeIf { it.isAttached }?.positionInRoot()?.y }
    CompositionLocalProvider(LocalOpenChoices provides openChoices) {
    Column(Modifier.fillMaxSize().onGloballyPositioned { viewport = it }.folioScroll(scroll).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        ProgressionLevelHeading(0, Progression.levelTally(true, baseNeeds()), current = false)
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
                powerUsage = selectedPowerUsage(choice.slot), invalid = needsAttention(choice.slot, optional = choice.optional),
                saving = saving("entry", slot = choice.slot)) {
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
        if (document.level > AdvancementRules.LAST_ENFORCED_LEVEL) {
            Text("Some progression choices above level 20 still need rules or catalog content.", color = Dim)
        }
        (1..BuilderSession.MAX_LEVEL).forEach { level ->
            val schedule = Progression.level(level)
            val future = level > document.level
            val levelState = if (future) futureState ?: state else state
            ProgressionLevelHeading(level, Progression.levelTally(!future, levelNeeds(level)), level == document.level,
                onClick = if (future && !model.busy) {
                    { model.beginLevelChange(level) }
                } else {
                    null
                })
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
                            val freeCount = (0..1).count { ChoiceSlotId("creation", "free-skill", it) in filledSlots }
                            val chosen = skillTileChosen(kind)
                            val value = when {
                                !available -> "Choose ${backgroundKind.orEmpty().readable()} first"
                                chosen -> "✓"
                                kind == "free" && freeCount < 2 -> "${2 - freeCount} LEFT"
                                else -> ChoosePlaceholder
                            }
                            LevelChoice(
                                label, value, Modifier.weight(1f).fillMaxHeight(),
                                enabled = available && !model.busy, valueIsHint = !available || (kind == "free" && freeCount < 2),
                                invalid = !chosen, saving = saving(kind),
                            ) { open(kind) }
                        }
                    }
                }
            }
            val (classGrants, otherGrants) = grantsByLevel[level].orEmpty().partition { it.sourceCategory == EntryCategory.CLASS }
            val (otherPowers, otherFeatures) = otherGrants.partition { it.isPower }
            classGrants.forEach { grant -> AutomaticGrantCard(document.id, grant) }

            val levelChoices = Progression.levelChoices(levelState, level).filterNot { it in ancestryLanguages || it in ancestryPowers }
            val className = state.rules.entries.firstOrNull { it.definition.entry.category == EntryCategory.CLASS }
                ?.definition?.entry?.presentation?.title
            val (powerSlots, regularChoices) = Progression.partitionLevelChoices(level, levelChoices, powerEntryIds)
            regularChoices.forEach { choice ->
                val source = levelState.rules.entries.firstOrNull { it.instanceId == choice.slot.sourceInstanceId }?.definition?.entry
                val sourceTitle = source?.presentation?.title.orEmpty()
                val invalid = needsAttention(choice.slot, level, choice.optional)
                if (choice.entries.isNotEmpty()) {
                    val label = if (choice.optional) "$sourceTitle (optional substitution)" else Progression.choiceLabel(choice.slot.choiceId, className)
                    LevelChoice(label, selected(choice.slot, levelState), enabled = !model.busy,
                        powerUsage = selectedPowerUsage(choice.slot, levelState) ?: label, invalid = invalid,
                        saving = saving("entry", level, choice.slot)) {
                        open("entry", level, choice.slot)
                    }
                } else if (choice.valueKind != null) {
                    val label = Progression.valueChoiceLabel(requireNotNull(choice.valueKind), choice.slot.ordinal, sourceTitle, source?.category)
                    LevelValueChoice(choice, label, values.firstOrNull { it.slot == choice.slot }?.value,
                        enabled = !model.busy, invalid = invalid, saving = saving("value", level, choice.slot)) {
                        open("value", level, choice.slot)
                    }
                } else if (choice.skills.isNotEmpty()) {
                    LevelChoice(Progression.choiceLabel(choice.slot.choiceId, className), skills.firstOrNull { it.slot == choice.slot }?.skill?.name?.readable() ?: ChoosePlaceholder, enabled = !model.busy, invalid = invalid,
                        saving = saving("skill", level, choice.slot)) {
                        open("skill", level, choice.slot)
                    }
                }
            }
            otherFeatures.forEach { grant -> AutomaticGrantCard(document.id, grant) }
            if (level == 1 && state.rules.entries.any { it.definition.entry.category == EntryCategory.CLASS && it.definition.entry.presentation.title.contains("Fighter") } &&
                levelChoices.none { it.slot.choiceId.contains("react", ignoreCase = true) }) {
                Text("Reactivity and Combat Superiority choices are not yet authored in the installed Fighter proof.", color = Dim)
            }
            AdvancementRules.rootSlot(level, EntryCategory.PARAGON_PATH)?.let { slot ->
                LevelChoice("Paragon path", selected(slot), enabled = !model.busy,
                    invalid = needsAttention(slot, level), saving = saving("entry", level, slot)) { open("entry", level, slot) }
            }
            if (schedule.ability != null) {
                if (schedule.ability == "non-main") {
                    val rootSlot = AdvancementRules.rootSlot(level, SlotCategory.AbilityIncrease)
                    val supported = rootSlot != null
                    val advancements = document.levels.firstOrNull { it.level == level }?.abilityAdvancements.orEmpty()
                    val slot = rootSlot ?: AdvancementRules.abilitySlot(level)
                    val increase = advancements.singleOrNull()?.takeIf { it.slot == slot }?.increases?.entries?.singleOrNull()
                    LevelChoice("Ability increase", increase?.key?.name?.readable() ?: if (supported) ChoosePlaceholder else "Unavailable",
                        enabled = supported && !model.busy,
                        invalid = abilityIncreaseInvalid(level),
                        saving = saving("advancement", level)) {
                        open("advancement", level)
                    }
                } else { Text("+1 to ${schedule.ability} abilities arrives automatically", color = Dim) }
            }
            if (level > AdvancementRules.LAST_ENFORCED_LEVEL && levelChoices.none { with(Progression) { it.isPowerChoice(powerEntryIds) } }) {
                schedule.powers.forEach { power ->
                    if ((power.startsWith("Paragon ") && otherPowers.any { it.sourceCategory == EntryCategory.PARAGON_PATH }) ||
                        (power.startsWith("Epic ") && otherPowers.any { it.sourceCategory == EntryCategory.EPIC_DESTINY })) {
                        return@forEach
                    }
                    LevelChoice("$power power", "Unavailable", enabled = false, powerUsage = power) {}
                }
            } else if (schedule.powers.isNotEmpty() && document.classEntryIds().isEmpty() &&
                levelChoices.none { it.entries.isNotEmpty() }) {
                Text("Choose a class to see its available powers.", color = Dim)
            }
            if (schedule.feat) {
                val slot = AdvancementRules.rootSlot(level, EntryCategory.FEAT)
                LevelChoice("Feat", if (slot != null) selected(slot) else "Unavailable", enabled = slot != null && !model.busy,
                    invalid = slot != null && needsAttention(slot, level), saving = saving("feat", level, slot)) {
                    open("feat", level, slot)
                }
            }
            otherPowers.forEach { grant -> AutomaticGrantCard(document.id, grant) }
            schedule.replacement?.let {
                val replacementSlot = AdvancementRules.rootSlots(level).firstOrNull { root ->
                    root.category is SlotCategory.Replacement
                }?.slot
                val supported = replacementSlot != null
                val replacements = document.levels.firstOrNull { decisions -> decisions.level == level }?.replacements.orEmpty()
                val invalid = replacementInvalid(level)
                val savedTitle = replacements.singleOrNull()?.replacement?.selection?.savedTitle
                LevelChoice("Replace a $it attack power", savedTitle ?: if (supported) ChoosePlaceholder else "Unavailable",
                    enabled = supported && !model.busy,
                    powerUsage = it, invalid = invalid,
                    saving = saving("replacement", level, replacementSlot)) {
                    open("replacement", level, replacementSlot)
                }
            }
            if (future || level > AdvancementRules.LAST_ENFORCED_LEVEL) {
                schedule.automatic.filterNot { label ->
                    (label.startsWith("Paragon ") && otherFeatures.any { it.sourceCategory == EntryCategory.PARAGON_PATH }) ||
                        (label.startsWith("Epic ") && otherFeatures.any { it.sourceCategory == EntryCategory.EPIC_DESTINY })
                }.forEach { Text("$it arrives automatically", color = Dim) }
            }
            Progression.groupByLabel(powerSlots) { choice ->
                val sourceTitle = state.rules.entries.firstOrNull { it.instanceId == choice.slot.sourceInstanceId }
                    ?.definition?.entry?.presentation?.title.orEmpty()
                if (choice.optional) sourceTitle else Progression.choiceLabel(choice.slot.choiceId, className)
            }.forEach { (label, group) ->
                Progression.powerRows(group).forEach { row ->
                    CreationChoicePair {
                        row.forEach { choice ->
                            LevelChoice(label, selected(choice.slot), Modifier.weight(1f).fillMaxHeight(), enabled = !model.busy,
                                powerUsage = selectedPowerUsage(choice.slot) ?: label,
                                invalid = needsAttention(choice.slot, level, choice.optional),
                                saving = saving("entry", level, choice.slot)) {
                                open("entry", level, choice.slot)
                            }
                        }
                    }
                }
            }
        }
    }
    }
    editor?.let { request ->
        val editorState by key(request, state) {
            produceState(state.takeIf { request.level <= document.level }, model) {
                if (request.level > document.level) {
                    value = model.progressionPreview(state, request.level)
                }
            }
        }
        editorState?.let { ProgressionSheet(request, it, model) { editor = null } }
    }
}

/** Keeps paired fields (creation choices, power slots) equally wide and as tall as the larger label or value needs. */
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

/**
 * Labels the choices made at creation and the rows gained at each character level, with how many of them are still open.
 *
 * @param level 0 for the creation choices (Base), otherwise the character level.
 * @param tally what to report beside the heading: a finished mark, the choices left, or that the level is upcoming.
 * @param current whether this is the character's own level, which its number highlights.
 * @param onClick what tapping the heading does, or null when it is only a label; an upcoming level uses it to offer the level-up.
 */
@Composable
private fun ProgressionLevelHeading(level: Int, tally: LevelTally, current: Boolean, onClick: (() -> Unit)? = null) {
    val upcoming = tally is LevelTally.Upcoming
    Row(
        Modifier.fillMaxWidth().padding(top = if (level == 0) 0.dp else 20.dp).heightIn(min = 40.dp)
            .semantics(mergeDescendants = true) { heading() }.then(
                if (onClick != null) {
                    Modifier.clickable(onClickLabel = "Level up to level $level", role = Role.Button, onClick = onClick)
                } else {
                    Modifier
                }),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (level == 0) "Base" else level.toString(), fontFamily = FontFamily.Serif, fontSize = if (level == 0) 24.sp else 30.sp,
            color = if (upcoming) Dim else if (current) Accent else Ink)
        if (level > 0) {
            Text("LEVEL", color = Dim, letterSpacing = 2.sp, fontSize = 10.sp)
        }
        HorizontalDivider(Modifier.weight(1f), color = Line)
        when (tally) {
            is LevelTally.Needs -> Text("${tally.count} to choose", color = Accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            LevelTally.Complete -> Text("✓", Modifier.semantics { contentDescription = "Complete" }, color = RequirementMetColor,
                fontSize = 14.sp, fontWeight = FontWeight.Bold)
            LevelTally.Upcoming -> if (onClick != null) {
                Surface(shape = RoundedCornerShape(3.dp), color = Color.Transparent, border = BorderStroke(1.dp, Accent)) {
                    Text("Level up ›", Modifier.padding(horizontal = 10.dp, vertical = 2.dp), color = Accent, fontSize = 12.sp,
                        lineHeight = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            } else {
                Text("Upcoming", color = Dim, fontSize = 11.sp)
            }
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
    modifier: Modifier = Modifier, saving: Boolean = false, edit: () -> Unit) {
    val title = choice.values.firstOrNull { it.id == value }?.title ?: value ?: ChoosePlaceholder
    LevelChoice(label, title, modifier, enabled = enabled, invalid = invalid, saving = saving, action = edit)
}

/** What a Levels field shows for a slot nobody has filled yet. */
internal const val ChoosePlaceholder = "Choose…"

/**
 * One choice on the Levels tab and in other editable lists. A filled choice shows its label above its value, tinted with the
 * power frequency colour; a choice still to be made is a dashed outline inviting a tap, accent-coloured once it is required.
 *
 * @param blank treats [value] as the invitation text of an empty optional field, as [ChoosePlaceholder] is for a slot.
 */
@Composable
internal fun LevelChoice(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    powerUsage: String? = null,
    valueIsHint: Boolean = false,
    invalid: Boolean = false,
    saving: Boolean = false,
    blank: Boolean = false,
    action: () -> Unit,
) {
    val errorColor = MaterialTheme.colorScheme.error
    val kindColor = powerUsage?.let(::powerChoiceColor)
    val invitation = (value == ChoosePlaceholder || valueIsHint || blank) && !saving
    val illegal = invalid && !invitation && !saving
    Surface(
        modifier.openChoice(invalid && !saving).fillMaxWidth().then(
            if (invitation) Modifier.dashedBorder(if (invalid) Accent else Line) else Modifier,
        ).clickable(enabled = enabled, onClick = action).semantics {
            contentDescription = "Edit $label"
            if (saving) {
                stateDescription = "Saving"
            } else if (invalid) {
                stateDescription = "Needs attention"
            }
        },
        color = when {
            illegal -> errorColor.copy(alpha = 0.10f).compositeOver(Paper)
            invitation -> Color.Transparent
            saving -> Wash
            else -> Paper
        },
        border = if (invitation) null else BorderStroke(1.dp, if (illegal) errorColor else Line),
    ) {
        Box(Modifier.leftEdgeAccent(kindColor.takeUnless { illegal || invitation })) {
            Column(Modifier.alpha(if (saving) 0.55f else 1f).padding(horizontal = 12.dp, vertical = 6.dp)) {
                Text(label, color = if (illegal) errorColor else kindColor.takeUnless { invitation } ?: Dim, fontSize = 11.sp,
                    lineHeight = 14.sp, fontWeight = if (kindColor != null && !invitation) FontWeight.SemiBold else null)
                when {
                    valueIsHint -> Box(Modifier.heightIn(min = 20.dp), contentAlignment = Alignment.CenterStart) {
                        Text(value, color = Dim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    invitation -> Text("+ $value", color = if (invalid) Accent else Dim, fontSize = 14.sp, lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold)
                    else -> Text(value, color = if (illegal) errorColor else Ink, fontFamily = FontFamily.Serif, fontSize = 16.sp,
                        lineHeight = 20.sp)
                }
            }
            if (saving) {
                SavingSpinner(Modifier.align(Alignment.CenterEnd).padding(end = 12.dp))
            }
        }
    }
}

@Composable
private fun ProgressionSheet(request: ProgressionEditor, state: BuilderState, model: BuilderSession, dismiss: () -> Unit) {
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
    val savedReplacement = remember(request, document) {
        document.levels.firstOrNull { it.level == request.level }?.replacements?.singleOrNull()
            ?.takeIf { request.kind == "replacement" }
    }
    var selected by remember(request) { mutableStateOf(if (request.kind == "replacement") {
        savedReplacement?.replacement?.selection?.entryId
    } else if (request.kind == "advancement") {
        document.levels.firstOrNull { it.level == request.level }?.abilityAdvancements?.singleOrNull()?.increases?.keys?.singleOrNull()?.name
    } else state.document.levels.flatMap { it.entries }.firstOrNull { it.slot == request.slot }?.selection?.entryId
        ?: state.rules.entries.firstOrNull { it.slot == request.slot && it.granted }?.definition?.entry?.id) }
    var expanded by remember(request) { mutableStateOf(selected) }
    var selectedTitle by remember(request) { mutableStateOf<String?>(null) }
    var featTab by remember(request) { mutableStateOf("Class") }
    var optionRows by remember(request, featTab, state.document) { mutableStateOf<List<BuilderOptionRow>?>(null) }
    var optionLoadFinished by remember(request, featTab, state.document) { mutableStateOf(false) }
    var replacementTarget by remember(request) { mutableStateOf(savedReplacement?.replaces) }
    val catalogPicker = request.kind in listOf("entry", "feat", "replacement")
    val requirementTitles = remember(model, document.packages) { model.requirementTitles() }
    val requirementClassIds = remember(model, document.packages) { model.requirementClassIds() }
    LaunchedEffect(request, if (request.kind == "feat") featTab else null, document, replacementTarget) {
        if (catalogPicker) {
            optionRows = null
            val group = if (request.kind == "feat") FeatGroup.valueOf(featTab.uppercase()) else null
            optionLoadFinished = false
            if (request.kind == "replacement") {
                optionRows = replacementTarget?.let { model.progressionReplacementRows(request.level, it) } ?: emptyList()
            } else {
                model.progressionOptionRows(request.level, request.slot!!, group) { optionRows = it }
            }
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
                CatalogChoiceList(request, state, optionRows, optionLoadFinished, selected, expanded, featTab,
                    replacementTarget, requirementTitles, requirementClassIds, Modifier.weight(1f),
                    changeTab = { featTab = it },
                    changeTarget = { replacementTarget = it; edit = null; selected = null; expanded = null }, choose = { option ->
                        val entry = option.entry.entry
                        expanded = choiceExpansionOnTap(entry.id, selected, expanded)
                        if (selected != entry.id) {
                            selected = entry.id
                            selectedTitle = entry.presentation.title
                            val slot = requireNotNull(request.slot)
                            edit = if (request.kind == "replacement") {
                                replacementTarget?.let { target -> BuilderEdit.ReplacePower(request.level, target, entry.id,
                                    ReplacementKind.PROGRESSION, acceptIneligible = option.eligibility != Eligibility.ELIGIBLE) }
                            } else {
                                BuilderEdit.Entry(request.level, slot, entry.id, model.progressionEntryInstance(request.level, slot),
                                    acceptIneligible = option.eligibility != Eligibility.ELIGIBLE)
                            }
                        }
                    })
            }
        } else {
            Column(Modifier.weight(1f).folioScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                when (request.kind) {
                    "advancement" -> {
                        val preview = Progression.advancementPreviewPoints(state, request.level,
                            Ability.entries.firstOrNull { it.name == selected })
                        Ability.entries.filter { it != document.abilities.mainAbility }.forEach { ability ->
                            ChoiceCard(ability.name.readable(), selected == ability.name, false, true, null, {
                                selected = ability.name
                                edit = BuilderEdit.Advancement(request.level,
                                    AbilityAdvancement(AdvancementRules.abilitySlot(request.level), mapOf(ability to 1)))
                            }, compact = true, trailingValue = preview[ability]?.toString()) { }
                        }
                    }
                    "allocation" -> {
                        val allocation = (edit as? BuilderEdit.Allocation)?.value ?: document.abilities
                        val remaining = Progression.remainingPoints(allocation)
                        if (mainAbilities.size > 1) {
                            Text("Main ability", fontFamily = FontFamily.Serif)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                mainAbilities.forEach { ability ->
                                    FolioButton(ability.name.readable(), true, outlined = ability != allocation.mainAbility, compact = true, fillWidth = false,
                                        modifier = Modifier.weight(1f).semantics { this.selected = ability == allocation.mainAbility }) {
                                        if (ability != allocation.mainAbility) {
                                            edit = BuilderEdit.Allocation(Progression.changeMainAbility(allocation, ability))
                                        }
                                    }
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
                                FolioStepper("−", "Lower ${ability.name.readable()}", Progression.canAdjustAbility(allocation, ability, -1)) {
                                    edit = BuilderEdit.Allocation(allocation.copy(points = allocation.points + (ability to value - 1)))
                                }
                                Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) {
                                    Text(value.toString(), color = Accent, fontFamily = FontFamily.Serif, fontSize = 24.sp)
                                }
                                FolioStepper("+", "Raise ${ability.name.readable()}", Progression.canAdjustAbility(allocation, ability, 1)) {
                                    edit = BuilderEdit.Allocation(allocation.copy(points = allocation.points + (ability to value + 1)))
                                }
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
        val clear: (() -> Unit)? = if (request.kind == "replacement") {
            val saved = document.levels.firstOrNull { it.level == request.level }?.replacements?.singleOrNull()
            saved?.let { replacement ->
                { edit = BuilderEdit.RemoveReplacement(request.level, replacement.replaces); selected = null; expanded = null }
            }
        } else if (request.kind == "advancement" && selected != null) {
            { edit = BuilderEdit.Advancement(request.level, null); selected = null }
        } else if (request.slot != null && selected != null) {
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
            // The session applies and stores it in the background, so the sheet closes at once and the next edit can start.
            model.submitEdit(command, selectedTitle, request)
            dismiss()
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
    selected: String?, expanded: String?, featTab: String, replacementTarget: ChoiceSlotId?,
    requirementTitles: Map<String, String>, requirementClassIds: Set<String>, modifier: Modifier, changeTab: (String) -> Unit,
    changeTarget: (ChoiceSlotId) -> Unit, choose: (BuilderOption) -> Unit) {
    val taken = remember(state.rules, request.slot, replacementTarget) {
        state.rules.entries.filter { !it.granted && it.slot != (replacementTarget ?: request.slot) }
            .mapTo(mutableSetOf()) { it.definition.entry.id }
    }
    val options = remember(rows, taken, request.kind, request.level) {
        pickerOptions(rows, taken, featLevel = request.level)
    }
    val utilityPicker = request.kind == "entry" && request.slot?.let {
        isUtilityPowerPicker(request.level, it, state.rules.entries)
    } == true
    if (usesPowerReader(rows) && options is PickerOptions.Ready) {
        val targets = if (request.kind == "replacement") {
            Progression.replacementTargets(state, request.level)
        } else {
            emptyList()
        }
        PowerChoiceReader(options, taken, selected, utilityPicker, replacementTarget, targets,
            modifier, request.kind == "replacement", requirementTitles, requirementClassIds, changeTarget, choose)
        return
    }
    val rootCategory = request.slot?.let { AdvancementRules.rootCategory(request.level, it) }
    val advancementRoot = rootCategory == EntryCategory.PARAGON_PATH || rootCategory == EntryCategory.THEME ||
        rootCategory == EntryCategory.ANCESTRY ||
        rows.orEmpty().any { it.metadata.metadata.category == EntryCategory.EPIC_DESTINY }
    if (options is PickerOptions.Ready &&
        (advancementRoot || usesClassFeatureReader(rows, request.slot, state.rules.entries))
    ) {
        AdvancementChoiceReader(options, taken, selected, modifier, requirementTitles, requirementClassIds, choose)
        return
    }
    if (rootCategory == EntryCategory.CLASS && options is PickerOptions.Ready) {
        ClassPicker(options, selected, expanded, modifier, taken = taken, choose = choose)
        return
    }
    fun LazyListScope.optionItems(options: List<BuilderOptionRow>) {
        items(options, key = { "option:${it.metadata.metadata.id}" }) { row ->
            val option = row.option
            val eligible = row.pickerSelectable(taken)
            val entry = option?.entry?.entry
            val level = entry?.pickerPowerLevel()
            val titleColor = entry?.takeIf { utilityPicker && it.category == EntryCategory.POWER }
                ?.let(::powerChoiceUsage)?.let(::powerChoiceColor) ?: Ink
            val badge = if (entry?.category == EntryCategory.FEAT) entry.featTierBadge() else level?.toString()
            ChoiceCard(row.metadata.metadata.title, selected == row.metadata.metadata.id,
                expanded == row.metadata.metadata.id, option != null, badge, { option?.let(choose) },
                compact = true, titleColor = if (eligible) titleColor else MaterialTheme.colorScheme.error) {
                if (entry == null) {
                    Text("Definition is unavailable.", fontSize = 12.sp, color = Dim)
                } else {
                    if (entry.category == EntryCategory.FEAT) {
                        entry.featPrerequisiteText(requirementTitles)?.let {
                            Text("Prerequisites: $it", fontSize = 12.sp, lineHeight = 15.sp, color = Ink)
                        }
                    }
                    when {
                        entry.category == EntryCategory.POWER -> PowerBlock(entry, showTitle = false)
                        else -> ControlledDescription(entry.presentation.description, compact = true)
                    }
                }
            }
        }
    }
    CollapsibleChoiceList(modifier) {
        if (request.kind == "feat") {
            item("tabs") {
                Row {
                    listOf("General", "Ancestry", "Class").forEach { tab ->
                        FolioTab(featTab == tab, true, Modifier.weight(1f), action = { changeTab(tab) }) { Text(tab, color = it) }
                    }
                }
            }
        }
        if (options is PickerOptions.Loading) {
            item("loading") {
                val progress = options.total?.let {
                    if (request.level > AdvancementRules.LAST_ENFORCED_LEVEL) " ${options.checked}/$it loaded"
                    else " ${options.checked}/$it checked · ${options.eligible} eligible"
                }.orEmpty()
                if (loadFinished) {
                    Text("Could not finish loading options. Reopen the picker to retry.", color = MaterialTheme.colorScheme.error)
                } else {
                    val label = if (request.level > AdvancementRules.LAST_ENFORCED_LEVEL) "Loading options…" else "Checking eligibility…"
                    Text(label + progress, color = Dim)
                }
            }
            return@CollapsibleChoiceList
        }
        if (request.kind == "replacement") {
            val targets = Progression.replacementTargets(state, request.level)
            if (replacementTarget == null) {
                item("target-hint") { Text("Choose the earlier power to replace.", color = Dim) }
            }
            items(targets, key = { "replace:${it.instanceId}" }) { old ->
                ChoiceCard("Replace ${old.selection.savedTitle}", replacementTarget == old.slot, false, true, null,
                    { changeTarget(old.slot) }, compact = true) { }
            }
        }
        if (options is PickerOptions.Ready) {
            optionItems(options.visible)
            if (options.eligible.isEmpty() && options.ineligible.isEmpty()) {
                item("empty") {
                    Text("No ${if (request.kind == "feat") featTab.lowercase() else "available"} options in the installed content.", color = Dim)
                }
            }
        }
    }
}

/** The power picker's search, sharing the folio search field. */
@Composable
private fun PowerSearchField(query: String, onQueryChange: (String) -> Unit) {
    FolioSearchField(query, "Search powers", Modifier.fillMaxWidth().padding(bottom = 4.dp), onQueryChange)
}

/** Compact browsing stays above an independently scrolling power description with explicit row taps drafting the selection. */
@Composable
private fun PowerChoiceReader(
    options: PickerOptions.Ready, taken: Set<String>, selected: String?, utilityPicker: Boolean,
    replacementTarget: ChoiceSlotId?, targets: List<EntryChoice>, modifier: Modifier,
    requiresReplacementTarget: Boolean,
    requirementTitles: Map<String, String>,
    requirementClassIds: Set<String>,
    changeTarget: (ChoiceSlotId) -> Unit, choose: (BuilderOption) -> Unit,
) {
    var inspected by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    val visible = visibleReaderPowers(options, query)
    val page = catalogReaderPage(visible, inspected, selected)
    Column(modifier.fillMaxWidth()) {
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
                val level = entry?.pickerPowerLevel()
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
                            allowIneligible = true)?.let(choose)
                    }, compact = true, titleColor = color,
                    viewed = page?.metadata?.metadata?.id == row.metadata.metadata.id) { }
            }
        }) {
            page?.let { row ->
                val entry = row.option?.entry?.entry
                if (entry != null) {
                    EntryRequirements(row, requirementTitles, requirementClassIds)
                    PowerBlock(entry)
                } else {
                    Text(row.metadata.metadata.title, fontFamily = FontFamily.Serif, fontSize = 18.sp, color = Ink)
                }
            }
        }
    }
}

/** Show one requirements line: a red cross when the candidate falls short, a green check when it qualifies. */
@Composable
private fun EntryRequirements(row: BuilderOptionRow, titles: Map<String, String>, classIds: Set<String>) {
    val requirements = entryRequirementPreview(row, titles, classIds)
    val text = requirements.requirements ?: requirements.unmet.joinToString("; ").ifBlank { null } ?: return
    val met = requirements.unmet.isEmpty()
    Text("${if (met) "✓" else "✗"} Requires: $text", fontSize = 12.sp,
        color = if (met) RequirementMetColor else MaterialTheme.colorScheme.error)
}

/** The At-will green, darkened for legibility on the folio's paper. */
private val RequirementMetColor = Color(0xFF386327)

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

/** Preview advancement entries and stage the tapped choice for Save. */
@Composable
private fun AdvancementChoiceReader(
    options: PickerOptions.Ready,
    taken: Set<String>,
    selected: String?,
    modifier: Modifier,
    requirementTitles: Map<String, String>,
    requirementClassIds: Set<String>,
    choose: (BuilderOption) -> Unit,
) {
    var inspected by remember { mutableStateOf<String?>(null) }
    val visible = options.visible
    val page = catalogReaderPage(visible, inspected, selected)
    val pageId = page?.metadata?.metadata?.id
    CatalogReaderPanes(modifier, pageId, list = {
        items(visible, key = { it.metadata.metadata.id }) { row ->
            val id = row.metadata.metadata.id
            ChoiceCard(row.metadata.metadata.title, selected == id, false, true, null,
                {
                    inspected = id
                    row.catalogReaderDraft(taken, selected, allowIneligible = true)?.let(choose)
                }, compact = true, viewed = pageId == id,
                titleColor = if (row.pickerSelectable(taken)) Ink else MaterialTheme.colorScheme.error) { }
        }
        if (options.eligible.isEmpty() && options.ineligible.isEmpty()) {
            item("empty") { Text("No available options in the installed content.", color = Dim) }
        }
    }) {
        page?.let { row ->
            val entry = row.option?.entry?.entry
            Text(row.metadata.metadata.title, fontFamily = FontFamily.Serif, fontSize = 18.sp, color = Ink)
            if (row.option?.eligibility != Eligibility.ELIGIBLE) {
                EntryRequirements(row, requirementTitles, requirementClassIds)
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
