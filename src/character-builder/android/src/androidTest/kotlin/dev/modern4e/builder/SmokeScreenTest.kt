package dev.modern4e.builder

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.*
import androidx.lifecycle.ViewModelProvider
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test

/** Native route, semantic controls and persistence checks against the actual shared engine. */
class SmokeScreenTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun waitFor(text: String) {
        compose.waitUntil(15_000) {
            !ViewModelProvider(compose.activity)[BuilderSession::class.java].busy &&
                compose.onAllNodesWithText(text, ignoreCase = true).fetchSemanticsNodes().isNotEmpty()
        }
        compose.waitForIdle()
    }
    @Test fun overviewEditsCancelPersistAndReopenWithProgression() {
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
            !ViewModelProvider(compose.activity)[BuilderSession::class.java].busy &&
                compose.onAllNodesWithText("Save").fetchSemanticsNodes().isEmpty()
        }
        compose.onNodeWithContentDescription("Edit character name").assertTextEquals("Android overview test")
        compose.onNodeWithContentDescription("Character tabs").performTouchInput { swipeLeft() }
        waitFor("Ability Scores")
        compose.onNodeWithContentDescription("Character tabs").performTouchInput { swipeLeft() }
        compose.onNode(hasText("Validation") and hasClickAction()).assertIsSelected()
        compose.onNodeWithContentDescription("Character tabs").performTouchInput { swipeRight() }
        waitFor("Ability Scores")
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

    @Test fun structuredLanguageSheetSavesAndReopensItsDecision() {
        compose.waitUntil(15_000) {
            compose.onAllNodesWithText("Your Characters").fetchSemanticsNodes().isNotEmpty()
        }
        val model = ViewModelProvider(compose.activity)[BuilderSession::class.java]
        runBlocking {
            model.create()
            model.edit(BuilderEdit.Entry(1, ChoiceSlotId("creation", "feat", 0), "modern4e.feat.linguist", "ui-linguist"))
        }
        check(model.errors.isEmpty()) { model.errors.toString() }
        val id = model.current!!.document.id
        waitFor("Level 1")
        compose.onNode(hasText("Progression", substring = true) and hasClickAction()).performClick()
        waitFor("Ability Scores")
        compose.onNodeWithContentDescription("Edit Linguist: language 1")
            .performScrollTo().performClick()
        waitFor("Deep Speech")
        compose.onNodeWithText("Deep Speech").performClick()
        compose.onNodeWithText("Save").performClick()
        compose.waitUntil(15_000) {
            !model.busy && model.current?.document?.levels?.flatMap { it.values }?.any { it.value == "DEEP_SPEECH" } == true
        }
        runBlocking { model.load(id) }
        waitFor("Level 1")
        compose.onNode(hasText("Progression", substring = true) and hasClickAction()).performClick()
        compose.onNodeWithText("Deep Speech").performScrollTo().assertIsDisplayed()
        check(model.current!!.rules.facts.any { it.kind == FactKind.LANGUAGE && it.value == "DEEP_SPEECH" })
    }
}
