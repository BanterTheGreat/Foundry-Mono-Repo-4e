package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*

/** A rank and the bonus it adds, such as "Trained +3". */
internal fun SkillRank.label(): String = "$title +$bonus"

/**
 * Renders skill details in both the skill picker and the read-only overview.
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
    val contributors = (modifier as? ContractResult.Available)?.value?.contributors.orEmpty()
        .mapNotNull { Progression.skillContributorLabel(it.label) }
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
                (listOf(rank.label()) + contributors).forEach {
                    Text(it, fontSize = 11.sp, lineHeight = 13.sp, color = Dim)
                }
            }
            Text(modifier.display(signed = true), fontSize = 13.sp, color = Accent)
        }
    }
}
