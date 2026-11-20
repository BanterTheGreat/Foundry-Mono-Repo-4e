package dev.modern4e.builder

import dev.modern4e.builder.ui.components.FooterStatus
import dev.modern4e.builder.ui.components.characterHeaderSubtitle
import dev.modern4e.builder.ui.components.footerStatus
import dev.modern4e.builder.ui.components.footerTabIndex
import dev.modern4e.builder.ui.components.footerTabLabel
import org.junit.Assert.assertEquals
import org.junit.Test

class FolioChromeTest {
    private fun document(level: Int = 1, className: String? = "Fighter") = CharacterDocument(
        id = "chrome", savedAt = "2026-11-20T00:00:00Z", identity = CharacterIdentity("Mara Vey"),
        packages = emptyList(), level = level,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()),
        levels = listOfNotNull(className?.let {
            LevelDecisions(1, entries = listOf(EntryChoice("class-instance", AdvancementRules.classSlot,
                SavedSelection("modern4e.class.fighter", it, "modern4e", "fingerprint"))))
        }),
    )

    @Test
    fun subtitleNamesLevelAndClassWhenNothingIsInProgress() {
        assertEquals("Level 1 · Fighter", characterHeaderSubtitle(document(), loading = false, saving = false, exporting = false))
        assertEquals("Level 4 · Fighter", characterHeaderSubtitle(document(level = 4), loading = false, saving = false, exporting = false))
    }

    @Test
    fun subtitleOmitsAnUnchosenClassInsteadOfLeavingADanglingSeparator() {
        assertEquals("Level 1", characterHeaderSubtitle(document(className = null), loading = false, saving = false, exporting = false))
    }

    @Test
    fun subtitleSaysLoadingWhileTheSessionIsBusyOrHasNoCharacterYet() {
        assertEquals("Loading…", characterHeaderSubtitle(document(), loading = true, saving = false, exporting = false))
        assertEquals("Loading…", characterHeaderSubtitle(null, loading = false, saving = false, exporting = false))
    }

    @Test
    fun savingAndExportingOutrankTheLevelLineAndExportingOutranksSaving() {
        assertEquals("Saving…", characterHeaderSubtitle(document(), loading = false, saving = true, exporting = false))
        assertEquals("Saving…", characterHeaderSubtitle(document(), loading = true, saving = true, exporting = false))
        assertEquals("Exporting…", characterHeaderSubtitle(document(), loading = false, saving = true, exporting = true))
    }

    @Test
    fun footerStripCountsRequiredChoicesAndLeadsToLevels() {
        assertEquals(FooterStatus("3 required choices left", "Continue →", "progression", false), footerStatus(3))
        assertEquals("1 required choice left", footerStatus(1).text)
    }

    @Test
    fun footerStripOffersValidationOnceNothingIsLeft() {
        assertEquals(FooterStatus("All choices complete", "Validate", "validation", true), footerStatus(0))
    }

    @Test
    fun footerTabsKeepTheirLabelsAndValidationMarksNoTab() {
        assertEquals(listOf("About", "Levels", "Stats"), CharacterNavigationTabs.map(::footerTabLabel))
        assertEquals(listOf(0, 1, 2), CharacterNavigationTabs.map(::footerTabIndex))
        assertEquals(-1, footerTabIndex("validation"))
    }
}
