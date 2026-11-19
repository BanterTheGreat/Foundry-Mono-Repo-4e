package dev.modern4e.builder

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import dev.modern4e.builder.ui.theme.*
import dev.modern4e.builder.ui.components.*
import dev.modern4e.builder.ui.screens.*
import dev.modern4e.builder.ui.dialogs.BuilderDialogs

internal val CharacterNavigationTabs = listOf("character", "progression", "stats")
internal val CharacterTabs = CharacterNavigationTabs + "validation"
internal fun String.readable() = lowercase().replace('_', ' ').replaceFirstChar { it.titlecase() }

/** App shell: initializes the session and coordinates navigation, chrome, and destinations. */
@Composable
fun BuilderApp(model: BuilderSession, exchange: FileExchange, portraitChooser: PortraitChooser? = null) {
    val scope = rememberCoroutineScope()
    fun task(action: suspend BuilderSession.() -> Unit) { scope.launch { model.run(action) } }
    LaunchedEffect(Unit) { model.run { refresh() } }
    LaunchedEffect(model) { model.preloadHomePickers() }
    val drawerState = remember { DrawerState(DrawerValue.Closed) }
    fun closeMenu() {
        scope.launch { drawerState.close() }
    }
    FolioTheme {
        BackHandler(model.errors.isEmpty() && model.page != "home" && model.dialog == null &&
            model.preview == null && model.description == null && model.deleting == null) {
            if (drawerState.targetValue == DrawerValue.Open || drawerState.isOpen) {
                closeMenu()
            } else {
                model.navigateBack()
            }
        }
        CharacterDrawer(
            drawerState = drawerState,
            onDismiss = ::closeMenu,
            onExit = { model.page = "home" },
            onOpen = { task { openLibrary() } },
            onValidation = { model.page = "validation" },
            exportEnabled = model.canExport,
        ) {
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
                            IconButton(enabled = !model.busy, onClick = model::navigateBack,
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
                            if (character && model.saving) {
                                Text("Saving…", color = Dim, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))
                            }
                            if (character) {
                                IconButton(onClick = { scope.launch { drawerState.open() } }, enabled = !model.busy,
                                    modifier = Modifier.semantics { contentDescription = "Character menu" }) {
                                    CogIcon()
                                }
                            }
                        }
                        HorizontalDivider(color = Line)
                    }
                    if (model.busy || model.saving) { LinearProgressIndicator(Modifier.fillMaxWidth()) }
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
                            CharacterNavigationTabs.forEach { page ->
                                TextButton(enabled = !model.busy, onClick = { model.page = page }, contentPadding = PaddingValues(horizontal = 4.dp),
                                    modifier = Modifier.weight(1f).semantics { selected = model.page == page; role = Role.Tab }) {
                                    val color = if (page == model.page) Accent else Dim
                                    when (page) {
                                        "character" -> Text("About", color = color)
                                        "progression" -> {
                                            val missing = model.current?.let { Progression.missing(it) } ?: 0
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(3.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Text("Levels", color = color)
                                                if (missing > 0) {
                                                    Badge(
                                                        modifier = Modifier.offset(y = (-7).dp),
                                                        containerColor = MaterialTheme.colorScheme.error,
                                                    ) {
                                                        Text(missing.toString(), Modifier.semantics {
                                                            contentDescription = "$missing required choices remaining"
                                                        })
                                                    }
                                                }
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
        }
        if (model.confirmReturnToLibrary) {
            AlertDialog(
                onDismissRequest = { model.resolveBackConfirmation(leave = false) },
                title = { Text("Return to the character list?") },
                confirmButton = { TextButton(onClick = { model.resolveBackConfirmation(leave = true) }) { Text("Return") } },
                dismissButton = { TextButton(onClick = { model.resolveBackConfirmation(leave = false) }) { Text("Cancel") } },
            )
        }
        BuilderDialogs(model, ::task)
    }
}

/** Wraps the character screen in a full-height right drawer with swipe dismissal. */
@Composable
private fun CharacterDrawer(
    drawerState: DrawerState,
    onDismiss: () -> Unit,
    onExit: () -> Unit,
    onOpen: () -> Unit,
    onValidation: () -> Unit,
    exportEnabled: Boolean,
    content: @Composable () -> Unit,
) {
    val contentDirection = LocalLayoutDirection.current
    // Material drawers enter from logical start, so mirror only the drawer container.
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            gesturesEnabled = drawerState.isOpen,
            drawerContent = {
                CompositionLocalProvider(LocalLayoutDirection provides contentDirection) {
                    ModalDrawerSheet(
                        modifier = Modifier.width(220.dp),
                        drawerShape = RectangleShape,
                        drawerContainerColor = Paper,
                    ) {
                        Column(Modifier.folioScroll(rememberScrollState()).padding(vertical = 4.dp)) {
                            DropdownMenuItem(text = { Text("Exit") }, onClick = {
                                onDismiss()
                                onExit()
                            })
                            DropdownMenuItem(text = { Text("Open Character") }, onClick = {
                                onDismiss()
                                onOpen()
                            })
                            HorizontalDivider(color = Line)
                            // A file taken mid-save could lack the latest choices, so Export waits for the save to finish.
                            DropdownMenuItem(text = { Text("Export") }, onClick = onDismiss, enabled = exportEnabled)
                            HorizontalDivider(color = Line)
                            DropdownMenuItem(text = { Text("Validation") }, onClick = {
                                onDismiss()
                                onValidation()
                            })
                        }
                    }
                }
            },
        ) {
            CompositionLocalProvider(LocalLayoutDirection provides contentDirection, content = content)
        }
    }
}
