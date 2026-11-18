package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class FolioScrollbarTest {
    @Test fun shortOrUnmeasuredContentHasNoScrollbar() {
        assertNull(scrollbarThumb(100f, 0, 0, 100f, 28f))
        assertNull(scrollbarThumb(0f, 100, 0, 100f, 28f))
        assertNull(scrollbarThumb(100f, Int.MAX_VALUE, 0, 100f, 28f))
        assertNull(scrollbarThumb(100f, 100, 0, 0f, 28f))
    }

    @Test fun thumbTracksStartMiddleAndEndProportionally() {
        val start = scrollbarThumb(100f, 100, 0, 100f, 28f)!!
        val middle = scrollbarThumb(100f, 100, 50, 100f, 28f)!!
        val end = scrollbarThumb(100f, 100, 100, 100f, 28f)!!
        assertEquals(50f, start.height, .001f)
        assertEquals(0f, start.top, .001f)
        assertEquals(25f, middle.top, .001f)
        assertEquals(100f, end.top + end.height, .001f)
    }

    @Test fun veryLongContentKeepsThumbVisibleAndWithinTrack() {
        val end = scrollbarThumb(100f, 100_000, 100_000, 92f, 28f)!!
        assertEquals(28f, end.height, .001f)
        assertEquals(92f, end.top + end.height, .001f)
        val tiny = scrollbarThumb(20f, 1000, 1000, 12f, 28f)!!
        assertEquals(12f, tiny.height, .001f)
        assertEquals(0f, tiny.top, .001f)
    }

    @Test fun overscrollValuesClampToTrackEnds() {
        assertEquals(0f, scrollbarThumb(100f, 100, -10, 100f, 28f)!!.top, .001f)
        val end = scrollbarThumb(100f, 100, 110, 100f, 28f)!!
        assertEquals(100f, end.top + end.height, .001f)
    }

    @Test fun lazyRowsTrackFractionalVisibilityWithoutMeasuringWholeList() {
        assertNull(lazyScrollbarThumb(0, 0f, 0f, 100f, 28f))
        assertNull(lazyScrollbarThumb(4, 0f, 4f, 100f, 28f))
        assertNull(lazyScrollbarThumb(10, 2f, 2f, 100f, 28f))
        val first = lazyScrollbarThumb(100, 0f, 5.5f, 100f, 28f)!!
        val middle = lazyScrollbarThumb(100, 47.25f, 52.75f, 100f, 28f)!!
        val end = lazyScrollbarThumb(100, 94.5f, 100f, 100f, 28f)!!
        assertEquals(28f, first.height, .001f)
        assertEquals(0f, first.top, .001f)
        assertEquals(36f, middle.top, .001f)
        assertEquals(100f, end.top + end.height, .001f)
    }
}
