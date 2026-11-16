package dev.modern4e.builder

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import org.junit.Rule
import org.junit.Test

class SmokeScreenTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun displaysSharedFixture() {
        compose.onNodeWithText("Shared core is ready.").assertIsDisplayed()
        compose.onNodeWithText("shared-core-v1").assertIsDisplayed()
    }
}
