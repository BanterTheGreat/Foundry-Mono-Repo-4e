package dev.modern4e.builder.ui.screens

import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** A real pager gives drag-following transitions and synchronizes swipes with tab selection. */
@Composable
internal fun CharacterPages(state: BuilderState, model: BuilderSession) {
    val pager = rememberPagerState(initialPage = CharacterTabs.indexOf(model.page).coerceAtLeast(0)) { CharacterTabs.size }
    LaunchedEffect(model.page) {
        val target = CharacterTabs.indexOf(model.page)
        if (target >= 0 && target != pager.settledPage) {
            pager.animateScrollToPage(target, animationSpec = tween(220))
        }
    }
    LaunchedEffect(pager) {
        snapshotFlow { if (pager.isScrollInProgress) null else pager.settledPage }.collect { index ->
            if (index != null && model.page in CharacterTabs) {
                model.page = CharacterTabs[index]
            }
        }
    }
    HorizontalPager(pager, modifier = Modifier.fillMaxSize().semantics { contentDescription = "Character tabs" },
        userScrollEnabled = !model.busy) { index ->
        when (CharacterTabs[index]) {
            "character" -> Overview(state, model)
            "stats" -> Stats(state, model)
            "progression" -> ProgressionScreen(state, model)
            "validation" -> Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Heading("Validation")
                if (state.rules.diagnostics.isEmpty()) {
                    Text("No reported diagnostics", color = Dim)
                }
                state.rules.diagnostics.forEach {
                    Text(it.kind.name.readable(), color = Accent)
                    Text(it.message, color = Dim)
                    HorizontalDivider(color = Line)
                }
            }
        }
    }
}
