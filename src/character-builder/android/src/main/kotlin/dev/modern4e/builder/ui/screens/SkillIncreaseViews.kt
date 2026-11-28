package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.theme.*

/** Narrower than the other pickers' sides, so the five rank columns stay wide enough to press. */
internal val SkillMatrixSheetPadding = 8.dp

/** Brings the matrix sheet's text and footer back to the usual inset from the edge of the table. */
internal val SkillMatrixInset = 4.dp

private val NameWidth = 82.dp
private val BonusWidth = 32.dp
private val RowHeight = 30.dp

/**
 * A reached or upcoming milestone on Levels. Nothing bought reads as an ordinary empty choice; saved increases list
 * one chip per skill, and an illegal milestone is red with its reason.
 *
 * @param reached whether the character has reached the level; only a reached milestone asks for attention.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SkillIncreaseCard(step: SkillIncreaseStep, increases: List<SkillIncrease>, reached: Boolean,
    enabled: Boolean, saving: Boolean, action: () -> Unit) {
    if (increases.isEmpty()) {
        LevelChoice("Skill increase · ${step.pool} points · up to ${step.cap.title}", ChoosePlaceholder,
            enabled = enabled, invalid = reached && step.needsAttention, saving = saving, action = action)
        return
    }
    val errorColor = MaterialTheme.colorScheme.error
    val problem = step.problem().takeUnless { saving }
    val attention = reached && step.needsAttention
    Surface(
        Modifier.openChoice(attention && !saving).fillMaxWidth().clickable(enabled = enabled, role = Role.Button, onClick = action)
            .semantics {
                contentDescription = "Edit level ${step.level} skill increase"
                if (saving) {
                    stateDescription = "Saving"
                } else if (attention) {
                    stateDescription = "Needs attention"
                }
            },
        color = if (problem != null) errorColor.copy(alpha = 0.10f).compositeOver(Paper) else if (saving) Wash else Paper,
        border = BorderStroke(1.dp, if (problem != null) errorColor else Line),
    ) {
        Box {
            Column(Modifier.alpha(if (saving) 0.55f else 1f).padding(horizontal = 12.dp, vertical = 6.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Skill increase", color = if (problem != null) errorColor else Dim, fontSize = 11.sp, lineHeight = 14.sp)
                    val open = reached && problem == null && step.canAfford
                    Text(step.spendingSummary(), color = if (problem != null) errorColor else if (open) Accent else Dim,
                        fontSize = 11.sp, lineHeight = 14.sp, fontWeight = if (open) FontWeight.SemiBold else null)
                }
                FlowRow(Modifier.padding(top = 3.dp), horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    increases.forEach { increase ->
                        Surface(color = Wash, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(3.dp)) {
                            Text("${(increase.skill.current ?: increase.skill).title} ▲ ${increase.rank.title}",
                                Modifier.padding(horizontal = 8.dp, vertical = 1.dp), color = Ink,
                                fontFamily = FontFamily.Serif, fontSize = 14.sp)
                        }
                    }
                }
                problem?.let { Text(it, Modifier.padding(top = 2.dp), color = errorColor, fontSize = 11.sp, lineHeight = 14.sp) }
            }
            if (saving) {
                SavingSpinner(Modifier.align(Alignment.CenterEnd).padding(end = 12.dp))
            }
        }
    }
}

/**
 * The skill by rank table for one milestone: the points left, one row per skill and a line explaining the draft or the
 * cell last pressed.
 *
 * @param bonus the skill's displayed total at the rank its row reaches.
 * @param explanation why the cell last pressed changed nothing, or null to show [note].
 */
@Composable
internal fun SkillMatrixEditor(matrix: SkillMatrix, note: SkillNote, explanation: String?, planned: Boolean,
    bonus: (Skill, SkillRank) -> ContractResult<CalculatedValue>, modifier: Modifier, press: (SkillCell) -> Unit) {
    Column(modifier) {
        PickTallyHeader(matrix.step.tally(planned), Modifier.padding(horizontal = SkillMatrixInset))
        SkillMatrixHeading(matrix.step)
        Column(Modifier.weight(1f).fillMaxWidth().folioScroll(rememberScrollState())) {
            val rows = matrix.rows.associateBy { it.skill }
            SkillGroups.forEachIndexed { index, group ->
                if (index > 0) {
                    HorizontalDivider(color = Line)
                }
                group.forEach { skill ->
                    val row = rows.getValue(skill)
                    SkillMatrixLine(row, matrix.step, bonus(skill, row.rank), press)
                }
            }
        }
        val message = explanation ?: note.text
        Box(Modifier.fillMaxWidth().heightIn(min = 34.dp).padding(horizontal = SkillMatrixInset),
            contentAlignment = Alignment.CenterStart) {
            Text(message, Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = if (explanation != null) Ink else if (note.error) MaterialTheme.colorScheme.error else Dim,
                fontSize = 12.sp, lineHeight = 15.sp)
        }
    }
}

/** The header of a picker with a limited number of picks: what is chosen, one pip per pick and how many are left. */
@Composable
internal fun PickTallyHeader(tally: PickTally, modifier: Modifier = Modifier) {
    Surface(modifier.fillMaxWidth(), color = Wash, border = BorderStroke(1.dp, Line), shape = RoundedCornerShape(3.dp)) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 5.dp).semantics(mergeDescendants = true) {
                contentDescription = tally.description
            },
            horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(tally.title, fontFamily = FontFamily.Serif, fontSize = 16.sp, lineHeight = 18.sp)
                Text(tally.subtitle, color = Dim, fontSize = 11.sp, lineHeight = 13.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                repeat(tally.total) { pick ->
                    Box(Modifier.size(width = 8.dp, height = 9.dp)
                        .background(if (pick < tally.used) Accent else Color.Transparent, RoundedCornerShape(2.dp))
                        .border(1.dp, Accent, RoundedCornerShape(2.dp)))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(tally.left.toString(), color = if (tally.left < 0) MaterialTheme.colorScheme.error else Accent,
                    fontFamily = FontFamily.Serif, fontSize = 24.sp)
                Text("left", fontFamily = FontFamily.Serif, fontSize = 13.sp)
            }
        }
    }
}

/** Names the columns; a rank above the cap shows the level that opens it. */
@Composable
private fun SkillMatrixHeading(step: SkillIncreaseStep) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(start = SkillMatrixInset, end = SkillMatrixInset, top = 4.dp, bottom = 3.dp),
            verticalAlignment = Alignment.Bottom) {
            HeadingText("Skill", Modifier.width(NameWidth), TextAlign.Start)
            SkillMatrixRanks.forEach { rank ->
                val locked = step.lockedLabel(rank)
                HeadingText(if (locked == null) rank.title else "$locked\n${rank.title}",
                    Modifier.weight(1f).alpha(if (locked == null) 1f else 0.6f), TextAlign.Center)
            }
            HeadingText("Bonus", Modifier.width(BonusWidth), TextAlign.End)
        }
        HorizontalDivider(color = Line)
    }
}

@Composable
private fun HeadingText(text: String, modifier: Modifier, align: TextAlign) {
    Text(text, modifier, color = Dim, fontSize = 10.sp, lineHeight = 12.sp, textAlign = align, maxLines = 2,
        softWrap = false, overflow = TextOverflow.Clip)
}

/** One skill: its name, a press target for every rank and its total at the rank the draft reaches. */
@Composable
private fun SkillMatrixLine(row: SkillMatrixRow, step: SkillIncreaseStep, bonus: ContractResult<CalculatedValue>,
    press: (SkillCell) -> Unit) {
    val changed = row.bought || row.cells.any { it.kind == SkillCellKind.STALE }
    Row(
        Modifier.fillMaxWidth().heightIn(min = RowHeight).height(IntrinsicSize.Min)
            .background(if (changed) Wash else Color.Transparent).padding(horizontal = SkillMatrixInset),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(row.skill.title, Modifier.width(NameWidth), color = if (row.bought) Accent else Ink, fontSize = 14.sp,
            fontWeight = if (row.bought) FontWeight.Bold else null, maxLines = 1, overflow = TextOverflow.Ellipsis)
        row.cells.forEach { cell ->
            SkillMatrixCell(cell, overBudget = step.left < 0, lastOfBar = cell.rank == row.rank,
                Modifier.weight(1f).fillMaxHeight()) { press(cell) }
        }
        Text(bonus.display(signed = true), Modifier.width(BonusWidth), color = if (row.bought) Accent else Ink,
            fontSize = if (row.bought) 15.sp else 13.sp, fontWeight = if (row.bought) FontWeight.Bold else null,
            textAlign = TextAlign.End, maxLines = 1)
    }
}

/**
 * A whole cell is the press target; what it draws says what the press does. Held and bought ranks join into one bar.
 *
 * @param lastOfBar whether the row's bar ends in this cell.
 */
@Composable
private fun SkillMatrixCell(cell: SkillCell, overBudget: Boolean, lastOfBar: Boolean, modifier: Modifier, press: () -> Unit) {
    val errorColor = MaterialTheme.colorScheme.error
    val name = "${cell.skill.title} ${cell.rank.title}"
    val description = when (cell.kind) {
        SkillCellKind.HELD -> "$name, already held"
        SkillCellKind.BOUGHT -> "Stop at $name"
        SkillCellKind.REACHED -> "Undo $name"
        SkillCellKind.STALE -> "Remove $name, already held"
        SkillCellKind.BUY -> "Raise to $name for ${cell.price} points"
        SkillCellKind.PLANNED -> "$name, planned at level ${cell.plannedLevel}"
        SkillCellKind.LOCKED -> "$name, locked"
        SkillCellKind.UNAFFORDABLE -> "$name, costs ${cell.price} points"
    }
    val first = cell.rank == SkillMatrixRanks.first()
    val barShape = RoundedCornerShape(topStart = if (first) 4.dp else 0.dp, bottomStart = if (first) 4.dp else 0.dp,
        topEnd = if (lastOfBar) 4.dp else 0.dp, bottomEnd = if (lastOfBar) 4.dp else 0.dp)
    val barInset = Modifier.fillMaxWidth().padding(start = if (first) 3.dp else 0.dp, end = if (lastOfBar) 3.dp else 0.dp)
    val boxShape = RoundedCornerShape(3.dp)
    Box(
        modifier.then(if (cell.locked) Modifier.hatched(Line.copy(alpha = 0.55f)) else Modifier)
            .clickable(role = Role.Button, onClick = press).semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        when (cell.kind) {
            SkillCellKind.HELD -> Box(barInset.height(8.dp).background(Dim.copy(alpha = 0.75f), barShape))
            SkillCellKind.BOUGHT -> Box(barInset.height(8.dp).background(if (overBudget) errorColor else Accent, barShape))
            SkillCellKind.REACHED -> Box(barInset.height(22.dp).background(if (overBudget) errorColor else Accent, barShape),
                contentAlignment = Alignment.Center) {
                Text("✓", color = Paper, fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.Bold)
            }
            SkillCellKind.STALE -> CellBox(Modifier.background(errorColor.copy(alpha = 0.10f), boxShape)
                .border(1.dp, errorColor, boxShape), "✕", errorColor)
            SkillCellKind.BUY -> CellBox(Modifier.background(Paper, boxShape).border(1.dp, Accent, boxShape),
                "${cell.price} pt", Accent)
            SkillCellKind.PLANNED -> CellBox(Modifier.dashedBorder(Dim), "Lv ${cell.plannedLevel}", Dim)
            SkillCellKind.UNAFFORDABLE -> Box(Modifier.size(4.dp).background(Line, CircleShape))
            SkillCellKind.LOCKED -> Unit
        }
    }
}

@Composable
private fun CellBox(modifier: Modifier, text: String, color: Color) {
    Box(Modifier.fillMaxWidth().padding(horizontal = 3.dp).heightIn(min = 22.dp).then(modifier),
        contentAlignment = Alignment.Center) {
        Text(text, color = color, fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** Diagonal rules that mark ranks above the tier cap. */
private fun Modifier.hatched(color: Color): Modifier = clipToBounds().drawBehind {
    val spacing = 5.dp.toPx()
    var x = -size.height
    while (x < size.width) {
        drawLine(color, Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = 1.dp.toPx())
        x += spacing
    }
}
