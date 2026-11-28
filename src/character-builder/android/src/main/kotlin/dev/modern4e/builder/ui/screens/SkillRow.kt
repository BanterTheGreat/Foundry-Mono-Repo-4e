package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*

/**
 * The list behind the class, free and theme skill tiles. The free skills have several picks, so a header above the
 * scrolling list counts the ones left.
 *
 * @param slots the slots this list fills.
 * @param free whether these are the free skills, which offer the whole catalog.
 * @param stage receives the draft after each press.
 */
@Composable
internal fun SkillPickList(state: BuilderState, level: Int, slots: List<ChoiceSlotId>, free: Boolean, modifier: Modifier,
    stage: (BuilderEdit) -> Unit) {
    val offer = state.rules.choices.firstOrNull { it.slot == slots.first() }
    val offered = if (free) Skill.catalog else offer?.skills.orEmpty()
    val granted = offer?.skillRank ?: SkillRank.TRAINED
    var picks by remember { mutableStateOf(savedSkillPicks(state.document, slots, offered)) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (free) {
            PickTallyHeader(freeSkillTally(picks.size))
        }
        Column(Modifier.weight(1f).fillMaxWidth().folioScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (offered.isEmpty()) {
                Text("No skills are available for this choice yet.", color = Dim)
            }
            state.rules.skillPickRows(offered, slots, picks, granted).forEach { row ->
                SkillRow(row.skill, row.rank, state.rules.displayedSkill(row.skill, row.rank), row.chosen, row.blocked) {
                    picks = toggleSkillPick(picks, row.skill, slots.size)
                    stage(skillPickEdit(level, slots, picks))
                }
            }
        }
    }
}

/**
 * Renders a skill in both the skill picker and the read-only overview: its name over its rank, with its total at the
 * right.
 *
 * @param rank the rank shown, which a picker's draft may have changed.
 * @param modifier the skill's total bonus at that rank.
 */
@Composable
internal fun SkillRow(
    skill: Skill,
    rank: SkillRank,
    modifier: ContractResult<CalculatedValue>,
    chosen: Boolean,
    blocked: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val action = if (onClick == null) Modifier else Modifier.clickable(enabled = !blocked, onClick = onClick)
    Surface(
        Modifier.fillMaxWidth().then(action),
        color = if (chosen) Wash else Paper,
        border = BorderStroke(1.dp, if (chosen) Accent else Line),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    (if (chosen || blocked) "✓ " else "") + skill.title,
                    fontSize = 15.sp,
                    lineHeight = 18.sp,
                    color = if (blocked) Dim else Ink,
                )
                Text(rank.title, fontSize = 11.sp, lineHeight = 13.sp, color = Dim)
            }
            Text(modifier.display(signed = true), fontSize = 13.sp, color = Accent)
        }
    }
}
