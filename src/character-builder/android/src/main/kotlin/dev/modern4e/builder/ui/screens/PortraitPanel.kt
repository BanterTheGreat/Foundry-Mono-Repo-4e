package dev.modern4e.builder.ui.screens

import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

import dev.modern4e.builder.*
import dev.modern4e.builder.ui.theme.*

/** The picker the activity registered; null where none is available, which leaves the panel inert. */
internal val LocalPortraitChooser = staticCompositionLocalOf<PortraitChooser?> { null }

/**
 * The About tab's portrait panel. Pressing it opens the system image picker; the chosen image is
 * kept on this device only (see [PortraitStore]) and shown here instead of the placeholder.
 *
 * @param model the session that owns the portrait storage.
 * @param characterId the character the portrait belongs to.
 * @param modifier size and placement of the panel.
 */
@Composable
internal fun PortraitPanel(model: BuilderSession, characterId: String, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    val chooser = LocalPortraitChooser.current
    val image by produceState<ImageBitmap?>(null, characterId, model.portraitRevision) {
        value = withContext(Dispatchers.IO) {
            model.portrait(characterId)?.let { BitmapFactory.decodeFile(it.path)?.asImageBitmap() }
        }
    }
    Surface(
        onClick = { chooser?.let { scope.launch { model.run { choosePortrait(it) } } } },
        modifier = modifier.semantics {
            contentDescription = if (image == null) "Character portrait placeholder" else "Character portrait"
        },
        enabled = chooser != null && !model.busy, color = Wash, border = BorderStroke(1.dp, Line),
    ) {
        val shown = image
        if (shown != null) {
            Image(shown, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Column(verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("♙", fontSize = 28.sp, lineHeight = 32.sp, color = Dim)
                Text("PORTRAIT", fontSize = 9.sp, lineHeight = 12.sp, letterSpacing = 1.sp, color = Dim)
            }
        }
    }
}
