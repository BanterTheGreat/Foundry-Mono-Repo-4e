package dev.modern4e.builder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BuildChannelTest {
    @Test
    fun debugBuildShowsTheNotice() {
        assertEquals("Debug build", buildChannelNotice(debug = true))
    }

    @Test
    fun releaseBuildShowsNothing() {
        assertNull(buildChannelNotice(debug = false))
    }

    @Test
    fun unitTestsRunAgainstTheDebugBuild() {
        assertTrue(BuildConfig.DEBUG)
        assertEquals(DebugBuildNotice, buildChannelNotice())
    }
}
