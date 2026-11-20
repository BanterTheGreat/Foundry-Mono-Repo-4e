package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.OpenChoiceRegistry
import dev.modern4e.builder.ui.screens.openChoiceScrollTarget
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OpenChoiceScrollTest {
    @Test
    fun theHighestFlaggedRowWinsWhateverOrderRowsRegisteredIn() {
        val registry = OpenChoiceRegistry()
        registry.register("feat") { 900f }
        registry.register("class") { 340f }
        registry.register("skill") { 620f }
        assertEquals(340f, registry.firstTop())
    }

    @Test
    fun rowsThatAreNoLongerFlaggedOrLaidOutAreIgnored() {
        val registry = OpenChoiceRegistry()
        registry.register("detached") { null }
        registry.register("filled") { 100f }
        registry.register("open") { 500f }
        registry.unregister("filled")
        assertEquals(500f, registry.firstTop())
        registry.unregister("open")
        assertNull(registry.firstTop())
    }

    @Test
    fun aRowThatMovesIsReadAtRequestTimeNotAtRegistration() {
        val registry = OpenChoiceRegistry()
        var top = 800f
        registry.register("row") { top }
        top = 120f
        assertEquals(120f, registry.firstTop())
    }

    @Test
    fun scrollTargetPutsTheRowJustBelowTheViewportTop() {
        // Scrolled 200 px, row currently 1,000 px below the viewport top: its content offset is 1,200 px.
        assertEquals(1188, openChoiceScrollTarget(scroll = 200, rowTop = 1100f, viewportTop = 100f, margin = 12f, max = 5000))
    }

    @Test
    fun scrollTargetStaysInsideTheScrollableRange() {
        assertEquals(0, openChoiceScrollTarget(scroll = 0, rowTop = 105f, viewportTop = 100f, margin = 12f, max = 5000))
        assertEquals(800, openChoiceScrollTarget(scroll = 700, rowTop = 900f, viewportTop = 100f, margin = 12f, max = 800))
    }

    @Test
    fun aRowAboveTheViewportScrollsBackUp() {
        assertEquals(188, openChoiceScrollTarget(scroll = 600, rowTop = -300f, viewportTop = 100f, margin = 12f, max = 5000))
    }
}
