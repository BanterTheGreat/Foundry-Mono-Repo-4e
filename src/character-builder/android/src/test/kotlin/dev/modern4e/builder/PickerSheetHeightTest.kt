package dev.modern4e.builder

import androidx.compose.ui.unit.dp
import dev.modern4e.builder.ui.screens.pickerSheetHeight
import org.junit.Assert.assertEquals
import org.junit.Test

class PickerSheetHeightTest {
    @Test fun roomyScreensUseTheSameFixedHeight() {
        assertEquals(710.dp, pickerSheetHeight(800))
        assertEquals(710.dp, pickerSheetHeight(1200))
    }

    @Test fun shortScreensShrinkToFit() {
        assertEquals(546.dp, pickerSheetHeight(600))
    }
}
