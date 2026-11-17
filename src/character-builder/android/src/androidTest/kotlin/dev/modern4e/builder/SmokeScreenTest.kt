package dev.modern4e.builder

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.*
import org.junit.Rule
import org.junit.Test

/** Native route, semantic controls and persistence checks against the actual shared engine. */
class SmokeScreenTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun waitFor(text: String) {
        compose.waitUntil(15_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        compose.waitForIdle()
    }
    @Test fun overviewEditsCancelPersistAndReopenWithProgressionStub() {
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("Your Characters").fetchSemanticsNodes().any {
                !it.config.contains(androidx.compose.ui.semantics.SemanticsProperties.Disabled)
            }
        }
        compose.onNodeWithText("Your Characters").performClick()
        waitFor("Create a proof character")
        compose.onNodeWithText("Create a proof character").performClick()
        waitFor("Level 1")
        compose.onNodeWithContentDescription("Character portrait placeholder").assertExists()
        compose.onNodeWithContentDescription("Strength: 4").assertExists()
        listOf("Gender", "Age", "Deity", "Languages").forEach {
            compose.onNodeWithContentDescription("Edit $it").assertExists()
        }
        compose.onNodeWithText("Overview").assertExists()
        compose.onNodeWithText("Equipment").assertDoesNotExist()
        compose.onNodeWithText("Manual adjustments").assertDoesNotExist()
        compose.onNodeWithText("Ability and proficiency choices → Progression").assertDoesNotExist()
        compose.onNodeWithContentDescription("Edit Deity").performClick()
        compose.onNode(hasSetTextAction()).performTextReplacement("Erathis")
        compose.onNodeWithText("Save").performClick()
        waitFor("Erathis")
        compose.onNodeWithText("Erathis").assertExists()
        compose.onNodeWithContentDescription("Edit character name").performClick()
        compose.onNode(hasSetTextAction()).performTextReplacement("Cancelled edit")
        compose.onNodeWithText("Cancel").performClick()
        compose.onNodeWithContentDescription("Edit character name").assertTextEquals("New character")
        compose.onNodeWithContentDescription("Edit character name").performClick()
        compose.onNode(hasSetTextAction()).performTextReplacement("Android overview test")
        compose.onNodeWithText("Save").performClick()
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("Save").fetchSemanticsNodes().isEmpty()
        }
        compose.onNodeWithContentDescription("Edit character name").assertTextEquals("Android overview test")
        compose.onNodeWithContentDescription("Character tabs").performTouchInput { swipeLeft() }
        waitFor("Build editing is coming later.")
        compose.onNodeWithContentDescription("Character tabs").performTouchInput { swipeLeft() }
        compose.onNode(hasText("Validation") and hasClickAction()).assertIsSelected()
        compose.onNodeWithContentDescription("Character tabs").performTouchInput { swipeRight() }
        waitFor("Build editing is coming later.")
        compose.onNodeWithContentDescription("Character tabs").performTouchInput { swipeRight() }
        waitFor("Level 1")
        compose.onNodeWithContentDescription("Back").performClick()
        compose.onNodeWithContentDescription("Delete Android overview test").performClick()
        waitFor("Delete character?")
        compose.onNodeWithText("Cancel").performClick()
        compose.onNodeWithText("Android overview test", useUnmergedTree = true).performClick()
        waitFor("Level 1")
        compose.onNodeWithContentDescription("Edit character name").assertTextEquals("Android overview test")
    }
}
