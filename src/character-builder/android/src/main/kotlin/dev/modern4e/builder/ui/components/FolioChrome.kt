package dev.modern4e.builder.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.modern4e.builder.CharacterDocument
import dev.modern4e.builder.CharacterNavigationTabs
import dev.modern4e.builder.summary
import dev.modern4e.builder.ui.theme.*

/** The footer label for a character page. */
internal fun footerTabLabel(page: String): String = when (page) {
    "character" -> "About"
    "progression" -> "Levels"
    else -> page.replaceFirstChar { it.titlecase() }
}

/** Position of [page] among the footer tabs, or -1 when it has none (Validation is reached from the status strip or the menu), so no tab is marked. */
internal fun footerTabIndex(page: String): Int = CharacterNavigationTabs.indexOf(page)

/**
 * The small line under the character name. Work in progress takes precedence over the level line, so
 * the header answers "is it ready?" before it answers "who is this?".
 */
internal fun characterHeaderSubtitle(document: CharacterDocument?, loading: Boolean, saving: Boolean, exporting: Boolean): String {
    if (exporting) {
        return "Exporting…"
    }
    if (saving) {
        return "Saving…"
    }
    if (loading || document == null) {
        return "Loading…"
    }
    val summary = document.summary()
    return listOf("Level ${summary.level}", summary.characterClass).filter(String::isNotBlank).joinToString(" · ")
}

/** What the footer strip reports about the open character; its action leads to the first open choice. */
internal data class FooterStatus(val text: String, val action: String)

/** The strip says how many required choices remain and offers the way on; with none left there is no strip. */
internal fun footerStatus(missing: Int): FooterStatus? = if (missing > 0) {
    FooterStatus("$missing required ${if (missing == 1) "choice" else "choices"} left", "Continue →")
} else {
    null
}

/**
 * The shared 62 dp header: oxblood back chevron, a centered serif title and an optional small line beneath it.
 * [onTitleClick] makes the title tappable; [menu] fills the trailing 48 dp slot, which stays reserved without it
 * so the title is centered either way.
 */
@Composable
internal fun FolioHeader(
    title: String,
    subtitle: String?,
    backEnabled: Boolean,
    onBack: () -> Unit,
    onTitleClick: (() -> Unit)? = null,
    titleDescription: String? = null,
    menu: (@Composable () -> Unit)? = null,
) {
    Row(Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        FolioIconButton("Back", enabled = backEnabled, action = onBack) {
            Canvas(Modifier.size(24.dp)) {
                val chevron = Path().apply {
                    moveTo(size.width * .625f, size.height * .25f)
                    lineTo(size.width * .375f, size.height * .5f)
                    lineTo(size.width * .625f, size.height * .75f)
                }
                drawPath(chevron, Accent, style = Stroke(width = 1.5.dp.toPx()))
            }
        }
        Column(Modifier.weight(1f).padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.fillMaxWidth().heightIn(min = 40.dp).then(
                    if (onTitleClick != null) {
                        Modifier.clickable(onClick = onTitleClick).semantics { contentDescription = titleDescription.orEmpty() }
                    } else {
                        Modifier
                    }),
                contentAlignment = Alignment.Center,
            ) {
                Text(title, fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 26.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            }
            if (subtitle != null) {
                Text(subtitle.uppercase(), color = Dim, fontSize = 9.sp, lineHeight = 12.sp, fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.3.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { menu?.invoke() }
    }
}

/**
 * The character footer: a status strip reporting the required choices still to make (absent when [status] is
 * null), above text tabs with an oxblood underline that slides to the selected one.
 */
@Composable
internal fun FolioFooter(
    page: String,
    status: FooterStatus?,
    enabled: Boolean,
    onNavigate: (String) -> Unit,
    onStatusAction: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        HorizontalDivider(color = Line)
        if (status != null) {
            Row(Modifier.fillMaxWidth().height(42.dp).background(Wash), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(3.dp).fillMaxHeight().background(Accent))
                Text(status.text, color = Ink, fontSize = 13.sp, maxLines = 1,
                    modifier = Modifier.weight(1f).padding(start = 14.dp))
                TextButton(enabled = enabled, onClick = onStatusAction, contentPadding = PaddingValues(horizontal = 14.dp)) {
                    Text(status.action, color = Accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
            HorizontalDivider(color = Line)
        }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val tabWidth = maxWidth / CharacterNavigationTabs.size
            Row(Modifier.fillMaxWidth()) {
                CharacterNavigationTabs.forEach { tab ->
                    val selected = tab == page
                    TextButton(enabled = enabled, onClick = { onNavigate(tab) }, contentPadding = PaddingValues(horizontal = 4.dp),
                        modifier = Modifier.weight(1f).height(50.dp).semantics { this.selected = selected; role = Role.Tab }) {
                        Text(footerTabLabel(tab), color = if (selected) Accent else Dim, fontSize = 14.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
                    }
                }
            }
            val index = footerTabIndex(page)
            if (index >= 0) {
                val offset by animateDpAsState(tabWidth * index, tween(220), label = "Tab underline")
                Box(Modifier.align(Alignment.BottomStart).offset(x = offset).width(tabWidth).height(3.dp).background(Accent))
            }
        }
    }
}
