package dev.modern4e.builder.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*

/**
 * Native focus/back/dismiss behavior with a quick content fade.
 *
 * @param banner optional full-bleed artwork above the padded title and content.
 */
@Composable
internal fun FolioDialog(
    title: String,
    dismiss: () -> Unit,
    dismissible: Boolean = true,
    banner: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(onDismissRequest = dismiss, properties = DialogProperties(dismissOnBackPress = dismissible, dismissOnClickOutside = dismissible)) {
        var visible by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { visible = true }
        AnimatedVisibility(visible, enter = fadeIn(tween(90)), exit = fadeOut(tween(70))) {
            Surface(shape = RoundedCornerShape(6.dp), color = Paper) {
                Column(Modifier.fillMaxWidth().heightIn(max = 620.dp).folioScroll(rememberScrollState())) {
                    banner?.invoke(this)
                    Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Heading(title); content()
                    }
                }
            }
        }
    }
}
