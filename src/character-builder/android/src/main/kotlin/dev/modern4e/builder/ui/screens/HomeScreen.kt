package dev.modern4e.builder.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import dev.modern4e.builder.*
import dev.modern4e.builder.R
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*

/** Renders the home destination using the retained session. */
@Composable
internal fun HomeScreen(model: BuilderSession, task: (suspend BuilderSession.() -> Unit) -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Column(Modifier.weight(1f).fillMaxWidth().padding(bottom = 70.dp), verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Modern 4e", fontFamily = FontFamily.Serif, fontSize = 52.sp)
            Text("Character Builder", color = Dim, fontSize = 16.sp, letterSpacing = 2.sp, modifier = Modifier.padding(top = 16.dp))
            Text(stringResource(R.string.app_build_time), color = Dim, fontSize = 12.sp,
                modifier = Modifier.padding(top = 16.dp))
        }
        FolioButton("Your Characters", !model.busy) {
            if (model.libraryNeedsRefresh) {
                task { openLibrary() }
            } else {
                model.page = "library"
            }
        }
    }
}
