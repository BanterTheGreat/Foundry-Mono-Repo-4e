package dev.modern4e.builder

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream

/**
 * The real decoder behind portraits: large images are downscaled, small ones kept. Robolectric's
 * bitmap shadow decodes any bytes, so rejection of non-images is covered through the encoder seam
 * in [PortraitStoreTest] instead.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BitmapPortraitEncoderTest {
    private fun png(width: Int, height: Int): ByteArray {
        val out = ByteArrayOutputStream()
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, out)
        return out.toByteArray()
    }

    @Test fun largeImagesAreScaledToTheMaximumEdgeKeepingTheirShape() {
        val out = ByteArrayOutputStream()
        BitmapPortraitEncoder.encode(png(2000, 1000), 512, out)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size(), bounds)
        assertEquals(512, bounds.outWidth)
        assertEquals(256, bounds.outHeight)
    }

    @Test fun smallImagesAreNotEnlarged() {
        val out = ByteArrayOutputStream()
        BitmapPortraitEncoder.encode(png(100, 80), 512, out)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size(), bounds)
        assertEquals(100, bounds.outWidth)
        assertEquals(80, bounds.outHeight)
    }
}
