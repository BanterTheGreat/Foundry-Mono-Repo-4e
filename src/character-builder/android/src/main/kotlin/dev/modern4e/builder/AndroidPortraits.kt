package dev.modern4e.builder

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.OutputStream
import kotlin.math.max

/** Lets the user pick an image for a portrait. Resolves to null when the picker is cancelled. */
fun interface PortraitChooser {
    /** @return an open stream over the chosen image; the caller closes it. */
    suspend fun choose(): InputStream?
}

/** Picks through the system document picker; SAF grants read access to the chosen file only, so no permission is needed. */
class AndroidPortraitChooser(
    private val resolver: ContentResolver,
    private val pick: suspend () -> Uri?,
) : PortraitChooser {
    constructor(resolver: ContentResolver, picker: AndroidDocumentPicker) : this(resolver, picker::image)

    override suspend fun choose(): InputStream? {
        val uri = pick() ?: return null
        return withContext(Dispatchers.IO) { checkNotNull(resolver.openInputStream(uri)) { "Document provider returned no stream" } }
    }
}

/** Decodes with a power-of-two sample size first so a large photo never has to fit in memory at full size. */
object BitmapPortraitEncoder : PortraitEncoder {
    private const val NOT_AN_IMAGE = "That file is not an image that can be used as a portrait."

    override fun encode(source: ByteArray, maxEdge: Int, target: OutputStream) {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(source, 0, source.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { NOT_AN_IMAGE }
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) {
            sample *= 2
        }
        val decoded = try {
            BitmapFactory.decodeByteArray(source, 0, source.size, BitmapFactory.Options().apply { inSampleSize = sample })
        } catch (error: OutOfMemoryError) {
            throw IllegalArgumentException("That image is too large to use as a portrait.")
        } ?: throw IllegalArgumentException(NOT_AN_IMAGE)
        val matrix = Matrix()
        val scale = maxEdge.toFloat() / max(decoded.width, decoded.height)
        if (scale < 1f) {
            matrix.postScale(scale, scale)
        }
        matrix.postRotate(rotationDegrees(source))
        val fitted = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        try {
            check(fitted.compress(Bitmap.CompressFormat.PNG, 100, target)) { "The portrait could not be encoded." }
        } finally {
            if (fitted !== decoded) {
                fitted.recycle()
            }
            decoded.recycle()
        }
    }

    /** Camera photos record their rotation in EXIF rather than in the pixels. */
    private fun rotationDegrees(source: ByteArray): Float = try {
        when (ExifInterface(ByteArrayInputStream(source)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    } catch (error: Exception) {
        0f
    }
}
