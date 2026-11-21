package dev.modern4e.builder.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
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
    Canvas(Modifier.size(24.dp)) {
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

/** A solid Paper warning triangle with an Accent exclamation mark, for use on an Accent surface. */
@Composable
internal fun WarningIcon() {
    Canvas(Modifier.size(44.dp)) {
        val unit = size.width / 48f
        val triangle = Path().apply {
            moveTo(24f * unit, 5f * unit)
            lineTo(45f * unit, 42f * unit)
            lineTo(3f * unit, 42f * unit)
            close()
        }
        drawPath(triangle, Paper)
        drawPath(triangle, Paper, style = Stroke(width = 3f * unit, join = StrokeJoin.Round))
        drawLine(Accent, Offset(24f * unit, 18f * unit), Offset(24f * unit, 30f * unit), strokeWidth = 4f * unit, cap = StrokeCap.Round)
        drawCircle(Accent, radius = 2.3f * unit, center = Offset(24f * unit, 36f * unit))
    }
}

/** The three-node share glyph, drawn in Accent for a Paper disc. */
@Composable
internal fun ShareIcon() {
    Canvas(Modifier.size(26.dp)) {
        val unit = size.width / 24f
        val stroke = Stroke(width = 1.8f * unit, cap = StrokeCap.Round)
        val left = Offset(6f * unit, 12f * unit)
        val top = Offset(18f * unit, 5.5f * unit)
        val bottom = Offset(18f * unit, 18.5f * unit)
        drawLine(Accent, Offset(8.3f * unit, 10.7f * unit), Offset(15.7f * unit, 6.7f * unit), strokeWidth = stroke.width, cap = StrokeCap.Round)
        drawLine(Accent, Offset(8.3f * unit, 13.3f * unit), Offset(15.7f * unit, 17.3f * unit), strokeWidth = stroke.width, cap = StrokeCap.Round)
        listOf(left, top, bottom).forEach { drawCircle(Accent, radius = 2.6f * unit, center = it, style = stroke) }
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

/** Shield-and-cross emblem for the Home cover, drawn in Accent hairlines. */
@Composable
internal fun HomeEmblem() {
    Canvas(Modifier.size(84.dp)) {
        val unit = size.width / 96f
        val stroke = Stroke(width = 1.2f * unit, join = StrokeJoin.Round, cap = StrokeCap.Round)
        fun shield(inset: Float, top: Float, shoulder: Float, bottom: Float) = Path().apply {
            moveTo(48f * unit, top * unit)
            lineTo((96f - inset) * unit, (top + 20f) * unit)
            lineTo((96f - inset) * unit, shoulder * unit)
            cubicTo((96f - inset) * unit, (shoulder + 18f) * unit, 72f * unit, (bottom - 6f) * unit, 48f * unit, bottom * unit)
            cubicTo(24f * unit, (bottom - 6f) * unit, inset * unit, (shoulder + 18f) * unit, inset * unit, shoulder * unit)
            lineTo(inset * unit, (top + 20f) * unit)
            close()
        }
        drawPath(shield(10f, 6f, 54f, 92f), Accent, style = stroke)
        drawPath(shield(22f, 18f, 53f, 80f), Accent, style = stroke)
        drawLine(Accent, Offset(48f * unit, 30f * unit), Offset(48f * unit, 70f * unit), strokeWidth = 1.2f * unit)
        drawLine(Accent, Offset(34f * unit, 44f * unit), Offset(62f * unit, 44f * unit), strokeWidth = 1.2f * unit)
    }
}
