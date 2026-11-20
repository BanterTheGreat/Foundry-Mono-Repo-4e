package dev.modern4e.builder

import android.graphics.drawable.AdaptiveIconDrawable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** The manifest declares the brass cog launcher icon as an adaptive icon on the ink background. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LauncherIconTest {
    private val context get() = RuntimeEnvironment.getApplication()

    @Test
    fun theAppDeclaresALauncherIcon() {
        val info = context.packageManager.getApplicationInfo(context.packageName, 0)
        assertNotEquals(0, info.icon)
    }

    @Test
    fun theLauncherIconIsAnAdaptiveIconWithForegroundAndInkBackground() {
        val info = context.packageManager.getApplicationInfo(context.packageName, 0)
        val icon = context.resources.getDrawable(info.icon, context.theme)
        assertTrue(icon is AdaptiveIconDrawable)
        icon as AdaptiveIconDrawable
        assertNotNull(icon.foreground)
        assertNotNull(icon.background)
        assertEquals(0xFF322B25.toInt(), context.getColor(R.color.ic_launcher_background))
    }
}
