package dev.modern4e.builder

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
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
fun BuilderApp(
    model: BuilderSession,
    exchange: FileExchange,
    portraitChooser: PortraitChooser? = null,
    exports: ExportTargets? = null,
    errorSharer: AndroidErrorReportSharer? = null,
) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(model.exportedMessage) {
        model.exportedMessage?.let { message ->
            snackbar.showSnackbar(message)
            model.exportedMessage = null
        }
    }
    fun task(action: suspend BuilderSession.() -> Unit) { scope.launch { model.run(action) } }
    LaunchedEffect(Unit) { model.run { refresh() } }
    LaunchedEffect(model) { model.preloadHomePickers() }
    val drawerState = remember { DrawerState(DrawerValue.Closed) }
    fun closeMenu() {
        scope.launch { drawerState.close() }
    }
    FolioTheme {
        BackHandler(model.errors.isEmpty() && (model.page != "home" || drawerState.isOpen) && model.dialog == null &&
            model.preview == null && model.description == null && model.deleting == null) {
            if (drawerState.targetValue == DrawerValue.Open || drawerState.isOpen) {
                closeMenu()
            } else {
                model.navigateBack()
            }
        }
        CharacterDrawer(
            drawerState = drawerState,
            home = model.page == "home",
            onRecovery = { task { openRecoveries() } },
            onDismiss = ::closeMenu,
            onExit = { model.page = "home" },
            onOpen = { task { openLibrary() } },
            onValidation = { model.page = "validation" },
            onExport = { model.exportChoice = true },
            exportEnabled = model.canExport && exports != null,
            onCopy = model::beginCopy,
            copyEnabled = model.canCopy,
        ) {
            Surface(Modifier.fillMaxSize(), color = Paper) {
                Box(Modifier.fillMaxSize()) {
                    Column(Modifier.fillMaxSize().systemBarsPadding()) {
                        if (model.page == "home") {
                            Row(Modifier.fillMaxWidth().height(62.dp).padding(end = 4.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.Top) {
                                FolioIconButton("Main menu", enabled = !model.busy, action = { scope.launch { drawerState.open() } }) {
                                    CogIcon()
                                }
                            }
                        } else {
                            val character = model.page in CharacterTabs
                            FolioHeader(
                                title = if (character) model.current?.document?.identity?.name.orEmpty() else if (model.page == "import") "Import Character" else if (model.page == "recovery") "Recovery Copies" else "Characters",
                                subtitle = if (character) characterHeaderSubtitle(model.current?.document, model.busy, model.saving, model.exporting) else null,
                                backEnabled = !model.busy,
                                onBack = model::navigateBack,
                                onTitleClick = if (character && !model.busy) { { model.beginEdit("Name") } } else null,
                                titleDescription = "Edit character name",
                                menu = if (character) {
                                    {
                                        FolioIconButton("Character menu", enabled = !model.busy, action = { scope.launch { drawerState.open() } }) {
                                            CogIcon()
                                        }
                                    }
                                } else null,
                            )
                            HorizontalDivider(color = Line)
                        }
                        // The slot is always reserved, so the content below never shifts when the bar appears or goes away.
                        Box(Modifier.fillMaxWidth().height(4.dp)) {
                            if (model.busy || model.saving) { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                        }
                        AnimatedContent(if (model.page in CharacterTabs) "character" else model.page, modifier = Modifier.weight(1f), label = "Screen transition", transitionSpec = {
                            val order = listOf("home", "library", "recovery", "import", "character")
                            val forward = order.indexOf(targetState) > order.indexOf(initialState)
                            slideInHorizontally(tween(220)) { if (forward) it else -it } togetherWith
                                slideOutHorizontally(tween(220)) { if (forward) -it else it }
                        }) { page ->
                            when (page) {
                                "home" -> HomeScreen(model, ::task)
                                "library" -> LibraryScreen(model, ::task)
                                "recovery" -> RecoveryScreen(model, ::task)
                                "import" -> ImportScreen(model, ::task, exchange)
                                "character" -> model.current?.let {
                                    CompositionLocalProvider(LocalPortraitChooser provides portraitChooser) { CharacterPages(it, model) }
                                }
                            }
                        }
                        if (model.page in CharacterTabs) {
                            FolioFooter(model.page, footerStatus(model.current?.let { Progression.unfinished(it) } ?: 0), enabled = !model.busy,
                                onNavigate = { model.page = it },
                                onStatusAction = { status ->
                                    model.page = status.target
                                    if (!status.complete) {
                                        model.requestFirstOpenChoice()
                                    }
                                })
                        }
                    }
                    SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).systemBarsPadding().padding(16.dp)) { data ->
                        Snackbar(data, containerColor = Accent, contentColor = Paper, shape = RectangleShape)
                    }
                }
            }
        }
        if (model.confirmReturnToLibrary) {
            FolioDialog("Return to the character list?", { model.resolveBackConfirmation(leave = false) }) {
                FolioActions {
                    FolioTextButton("Cancel") { model.resolveBackConfirmation(leave = false) }
                    FolioButton("Return", true, compact = true, fillWidth = false) { model.resolveBackConfirmation(leave = true) }
                }
            }
        }
        BuilderDialogs(model, ::task, exports, errorSharer)
    }
}

/** Wraps Home and character pages in the same full-height right drawer with swipe dismissal. */
@Composable
private fun CharacterDrawer(
    drawerState: DrawerState,
    home: Boolean,
    onRecovery: () -> Unit,
    onDismiss: () -> Unit,
    onExit: () -> Unit,
    onOpen: () -> Unit,
    onValidation: () -> Unit,
    onExport: () -> Unit,
    exportEnabled: Boolean,
    onCopy: () -> Unit,
    copyEnabled: Boolean,
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
                            if (home) {
                                DropdownMenuItem(text = { Text("Recovery Copies") }, onClick = {
                                    onDismiss()
                                    onRecovery()
                                })
                            } else {
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
                                DropdownMenuItem(text = { Text("Export") }, onClick = {
                                    onDismiss()
                                    onExport()
                                }, enabled = exportEnabled)
                                // A copy of a character mid-save could lack the latest choices, so Copy waits like Export.
                                DropdownMenuItem(text = { Text("Copy Character") }, onClick = {
                                    onDismiss()
                                    onCopy()
                                }, enabled = copyEnabled)
                                HorizontalDivider(color = Line)
                                DropdownMenuItem(text = { Text("Validation") }, onClick = {
                                    onDismiss()
                                    onValidation()
                                })
                            }
                        }
                    }
                }
            },
        ) {
            CompositionLocalProvider(LocalLayoutDirection provides contentDirection, content = content)
        }
    }
}
