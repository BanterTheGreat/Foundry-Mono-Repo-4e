package dev.modern4e.builder.ui.screens

import android.text.Html
import android.text.SpannableStringBuilder
import android.text.style.URLSpan
import android.widget.TextView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch

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
            "progression" -> Column(Modifier.fillMaxSize().padding(24.dp)) {
                Heading("Progression")
                Text("Build editing is coming later.", color = Dim)
            }
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
