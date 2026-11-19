package dev.modern4e.builder.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.dp

import dev.modern4e.builder.ui.theme.*

/** Solid wrench silhouette avoids platform-dependent emoji rendering for Settings. */
@Composable
internal fun WrenchIcon() {
    Canvas(Modifier.size(26.dp)) {
        val wrench = Path().apply {
            moveTo(14.7f, 6.3f)
            cubicTo(14.3f, 6.7f, 14.3f, 7.3f, 14.7f, 7.7f)
            lineTo(16.3f, 9.3f)
            cubicTo(16.7f, 9.7f, 17.3f, 9.7f, 17.7f, 9.3f)
            lineTo(21.47f, 5.53f)
            cubicTo(23f, 10f, 19f, 14f, 14.53f, 13.47f)
            lineTo(7.41f, 20.59f)
            cubicTo(5.3f, 22.7f, 2.3f, 19.7f, 4.41f, 17.59f)
            lineTo(11.53f, 10.47f)
            cubicTo(10f, 6f, 14f, 2f, 18.47f, 3.53f)
            lineTo(14.7f, 6.3f)
            close()
        }
        scale(size.width / 24f, size.height / 24f, pivot = Offset.Zero) {
            drawPath(wrench, Accent)
        }
    }
}

/** A compact outlined trash can with the same stroke treatment as the back icon. */
@Composable
internal fun TrashIcon() {
    Canvas(Modifier.size(24.dp)) {
        val path = Path().apply {
            moveTo(size.width * .2f, size.height * .25f)
            lineTo(size.width * .8f, size.height * .25f)
            moveTo(size.width * .38f, size.height * .25f)
            lineTo(size.width * .38f, size.height * .125f)
            lineTo(size.width * .62f, size.height * .125f)
            lineTo(size.width * .62f, size.height * .25f)
            moveTo(size.width * .28f, size.height * .25f)
            lineTo(size.width * .33f, size.height * .875f)
            lineTo(size.width * .67f, size.height * .875f)
            lineTo(size.width * .72f, size.height * .25f)
            moveTo(size.width * .43f, size.height * .38f)
            lineTo(size.width * .43f, size.height * .73f)
            moveTo(size.width * .57f, size.height * .38f)
            lineTo(size.width * .57f, size.height * .73f)
        }
        drawPath(path, Accent, style = Stroke(width = 1.5.dp.toPx()))
    }
}

/** Small decorative pencil; the containing header supplies the edit action and semantics. */
@Composable
internal fun PencilIcon() {
    Canvas(Modifier.size(16.dp)) {
        val pencil = Path().apply {
            moveTo(size.width * .18f, size.height * .65f)
            lineTo(size.width * .68f, size.height * .15f)
            lineTo(size.width * .85f, size.height * .32f)
            lineTo(size.width * .35f, size.height * .82f)
            lineTo(size.width * .12f, size.height * .88f)
            close()
            moveTo(size.width * .58f, size.height * .25f)
            lineTo(size.width * .75f, size.height * .42f)
        }
        drawPath(pencil, Dim, style = Stroke(width = 1.3.dp.toPx()))
    }
}

/** Draws the character menu icon with the folio accent color. */
@Composable
internal fun CogIcon() {
    Canvas(Modifier.size(24.dp)) {
        val unit = size.width / 24f
        repeat(8) { tooth ->
            rotate(45f * tooth) {
                drawRect(Accent, topLeft = Offset(10f * unit, 2f * unit), size = Size(4f * unit, 6f * unit))
            }
        }
        drawCircle(Accent, radius = 7.5f * unit)
        drawCircle(Paper, radius = 3.5f * unit)
    }
}
