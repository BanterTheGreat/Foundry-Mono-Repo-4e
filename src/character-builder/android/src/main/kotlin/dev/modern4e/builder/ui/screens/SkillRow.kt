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

/** Renders skill details in both the proficiency picker and the read-only overview. */
@Composable
internal fun SkillRow(
    skill: Skill,
    modifier: ContractResult<CalculatedValue>,
    chosen: Boolean,
    blocked: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val calculation = modifier as? ContractResult.Available
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
                    (if (chosen || blocked) "✓ " else "") + skill.name.readable(),
                    fontSize = 15.sp,
                    lineHeight = 18.sp,
                    color = if (blocked) Dim else Ink,
                )
                calculation?.value?.contributors?.mapNotNull { Progression.skillContributorLabel(it.label) }?.forEach {
                    Text(it, fontSize = 11.sp, lineHeight = 13.sp, color = Dim)
                }
            }
            Text(modifier.display(signed = true), fontSize = 13.sp, color = Accent)
        }
    }
}
