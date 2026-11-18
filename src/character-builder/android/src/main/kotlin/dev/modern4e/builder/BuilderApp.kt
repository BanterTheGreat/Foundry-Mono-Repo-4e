package dev.modern4e.builder

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.screens.*
import dev.modern4e.builder.ui.dialogs.BuilderDialogs

internal val CharacterTabs = listOf("character", "progression", "stats", "validation")
internal fun String.readable() = lowercase().replace('_', ' ').replaceFirstChar { it.titlecase() }

/** App shell: initializes the session and coordinates navigation, chrome, and destinations. */
@Composable
fun BuilderApp(model: BuilderSession, exchange: FileExchange, portraitChooser: PortraitChooser? = null) {
    val scope = rememberCoroutineScope()
    fun task(action: suspend BuilderSession.() -> Unit) { scope.launch { model.run(action) } }
    LaunchedEffect(Unit) { model.run { refresh() } }
    FolioTheme {
        BackHandler(model.errors.isEmpty() && model.page != "home" && model.dialog == null && model.preview == null && model.description == null && model.deleting == null) {
            model.page = when (model.page) { "stats", "progression", "validation" -> "character"; "library" -> "home"; else -> "library" }
        }
        Surface(Modifier.fillMaxSize(), color = Paper) {
            Column(Modifier.fillMaxSize().systemBarsPadding()) {
                if (model.page == "home") {
                    Row(Modifier.fillMaxWidth().height(62.dp).padding(end = 4.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.Top) {
                        IconButton({}, enabled = false, modifier = Modifier.size(48.dp).semantics { contentDescription = "Settings, coming later" }) {
                            WrenchIcon()
                        }
                    }
                } else {
                    Row(Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(enabled = !model.busy, onClick = { model.page = if (model.page == "library") "home" else "library" },
                            modifier = Modifier.size(48.dp).semantics { contentDescription = "Back" }) {
                            Canvas(Modifier.size(24.dp)) {
                                val chevron = Path().apply {
                                    moveTo(size.width * .625f, size.height * .25f)
                                    lineTo(size.width * .375f, size.height * .5f)
                                    lineTo(size.width * .625f, size.height * .75f)
                                }
                                drawPath(chevron, Accent, style = Stroke(width = 1.5.dp.toPx()))
                            }
                        }
                        val character = model.page in CharacterTabs
                        Row(Modifier.weight(1f).height(48.dp).then(
                            if (character) Modifier.clickable(enabled = !model.busy) { model.beginEdit("Name") }
                                .semantics(mergeDescendants = true) { contentDescription = "Edit character name" } else Modifier),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(if (character) model.current?.document?.identity?.name.orEmpty() else if (model.page == "import") "Import Character" else "Characters",
                                fontFamily = FontFamily.Serif, fontSize = 24.sp, lineHeight = 28.sp,
                                modifier = Modifier.weight(1f, fill = false), maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                            if (character) { PencilIcon() }
                        }
                    }
                    HorizontalDivider(color = Line)
                }
                if (model.busy) { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                AnimatedContent(if (model.page in CharacterTabs) "character" else model.page, modifier = Modifier.weight(1f), label = "Screen transition", transitionSpec = {
                    val order = listOf("home", "library", "import", "character")
                    val forward = order.indexOf(targetState) > order.indexOf(initialState)
                    slideInHorizontally(tween(220)) { if (forward) it else -it } togetherWith
                        slideOutHorizontally(tween(220)) { if (forward) -it else it }
                }) { page ->
                    when (page) {
                        "home" -> HomeScreen(model, ::task)
                        "library" -> LibraryScreen(model, ::task)
                        "import" -> ImportScreen(model, ::task, exchange)
                        "character" -> model.current?.let {
                            CompositionLocalProvider(LocalPortraitChooser provides portraitChooser) { CharacterPages(it, model) }
                        }
                    }
                }
                if (model.page in CharacterTabs) {
                    HorizontalDivider(color = Line)
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        CharacterTabs.forEach { page ->
                            TextButton(enabled = !model.busy, onClick = { model.page = page }, modifier = Modifier.weight(1f).semantics { selected = model.page == page; role = Role.Tab }) {
                                val color = if (page == model.page) Accent else Dim
                                when (page) {
                                    "character" -> Text("About", color = color)
                                    "progression" -> {
                                        val missing = model.current?.let { Progression.missing(it) } ?: 0
                                        BadgedBox(badge = {
                                            if (missing > 0) {
                                                Badge(containerColor = MaterialTheme.colorScheme.error) {
                                                    Text(missing.toString(), Modifier.semantics {
                                                        contentDescription = "$missing required choices remaining"
                                                    })
                                                }
                                            }
                                        }) {
                                            Text("Levels", color = color)
                                        }
                                    }
                                    else -> Text(page.readable(), color = color)
                                }
                            }
                        }
                    }
                }
            }
        }
        BuilderDialogs(model, ::task)
    }
}
