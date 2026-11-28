package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.R
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** Renders the home cover: emblem and wordmark above a numbered ledger of Continue and Characters. */
@Composable
internal fun HomeScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    val rows = model.characters.homeRows()
    Column(Modifier.fillMaxSize().folioScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(12.dp))
        HomeEmblem()
        Text("Modern 4e", fontFamily = FontFamily.Serif, fontSize = 50.sp, color = Ink, modifier = Modifier.padding(top = 18.dp))
        Text("CHARACTER BUILDER", color = Dim, fontSize = 14.sp, letterSpacing = 2.sp, modifier = Modifier.padding(top = 10.dp))
        Text("❖", color = Accent, fontSize = 14.sp, modifier = Modifier.padding(vertical = 26.dp))
        Column(Modifier.fillMaxWidth()) {
            HorizontalDivider(color = Line)
            rows.forEach { row ->
                HomeLedgerRow(row, !model.busy) {
                    when (row.action) {
                        HomeAction.Continue -> row.characterId?.let { id -> task { load(id) } }
                        HomeAction.Characters -> if (model.libraryNeedsRefresh) {
                            task { openLibrary() }
                        } else {
                            model.page = "library"
                        }
                    }
                }
                HorizontalDivider(color = Line)
            }
        }
        Spacer(Modifier.weight(1f))
        Text(stringResource(R.string.app_build_time), color = Dim, fontSize = 12.sp, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 24.dp))
    }
}

/** Small outlined tag in Home's top-left corner marking a debug build. */
@Composable
internal fun DebugBuildBadge(text: String) {
    Text(text.uppercase(), color = Accent, fontSize = 10.sp, letterSpacing = 1.sp,
        modifier = Modifier.padding(start = 16.dp, top = 16.dp).border(1.dp, Accent, RoundedCornerShape(3.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp))
}

/** One ledger row: a Roman numeral, a serif title over a dim detail line, and a chevron. */
@Composable
private fun HomeLedgerRow(row: HomeRow, enabled: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(enabled = enabled, role = Role.Button, onClick = onClick)
        .padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(row.numeral, color = Accent, fontFamily = FontFamily.Serif, fontSize = 22.sp, textAlign = TextAlign.Center,
            modifier = Modifier.width(40.dp))
        Column(Modifier.weight(1f).padding(start = 6.dp)) {
            Text(row.title, color = Ink, fontFamily = FontFamily.Serif, fontSize = 21.sp, lineHeight = 26.sp)
            Text(row.detail, color = Dim, fontSize = 13.sp, lineHeight = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text("›", color = Accent, fontSize = 24.sp, modifier = Modifier.padding(horizontal = 8.dp))
    }
}
