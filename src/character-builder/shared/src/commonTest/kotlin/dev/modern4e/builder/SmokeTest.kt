package dev.modern4e.builder

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotSame

class SmokeTest {
    @Test
    fun fixtureHasStableCrossPlatformValues() {
        assertEquals(SmokeResult("shared-core-v1", "Shared core is ready."), smokeFixture())
    }

    @Test
    fun callsAreIndependentAndDeterministic() {
        val first = smokeFixture()
        val second = smokeFixture()
        assertEquals(first, second)
        assertNotSame(first, second)
    }
}
