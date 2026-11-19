package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class PowerReaderOptionsTest {
    private fun row(id: String, eligibility: Eligibility = Eligibility.ELIGIBLE, category: EntryCategory = EntryCategory.POWER): BuilderOptionRow {
        val supplier = PackageRevision("standard", "1")
        val metadata = CatalogEntry(EntryMetadata(id, category, id, "powers"), supplier)
        return BuilderOptionRow(metadata, BuilderOption(
            ResolvedEntry(ContentEntry(id, category, Presentation(id), Mechanics(), Coverage(CoverageStatus.SUPPORTED)),
                supplier, "fingerprint"), eligibility, emptyList()), checked = true)
    }

    @Test fun onlyPowerCatalogsUseTheReader() {
        assertFalse(usesPowerReader(null))
        assertFalse(usesPowerReader(emptyList()))
        assertFalse(usesPowerReader(listOf(row("power"), row("feat", category = EntryCategory.FEAT))))
        assertTrue(usesPowerReader(listOf(row("power"))))
    }

    @Test fun lastEligibleTapDraftsThePower() {
        val first = row("first")
        val last = row("last")
        val initial = first.powerDraftOnTap(emptySet(), null, replacementReady = true)
        val draft = last.powerDraftOnTap(emptySet(), initial?.entry?.entry?.id, replacementReady = true)
        assertEquals(first.option, initial)
        assertEquals(last.option, draft)
        assertNull(last.powerDraftOnTap(emptySet(), "last", replacementReady = true))
    }

    @Test fun previewFallsBackToDraftThenFirstWithoutChangingTheDraft() {
        val first = row("first")
        val draft = row("draft")
        val blocked = row("blocked", Eligibility.INELIGIBLE)
        assertEquals(blocked, powerReaderPage(listOf(first, draft, blocked), "blocked", "draft"))
        assertEquals(draft, powerReaderPage(listOf(first, draft), "blocked", "draft"))
        assertEquals(first, powerReaderPage(listOf(first, draft), "removed", "removed"))
        assertNull(powerReaderPage(emptyList(), "old", "old"))
    }

    @Test fun blockedTapsAndMissingReplacementTargetsCannotChangeDraft() {
        val duplicate = row("duplicate")
        val unresolved = row("unresolved", Eligibility.UNRESOLVED)
        val missing = BuilderOptionRow(row("missing").metadata, checked = true)
        val blocked = row("blocked", Eligibility.INELIGIBLE)
        for (entry in listOf(duplicate, unresolved, missing, blocked)) {
            assertNull(entry.powerDraftOnTap(setOf("duplicate"), "draft", replacementReady = true))
        }
        val incomplete = row("incomplete", Eligibility.INCOMPLETE)
        assertNull(incomplete.powerDraftOnTap(emptySet(), "draft", replacementReady = false))
        assertEquals(incomplete.option, incomplete.powerDraftOnTap(emptySet(), "draft", replacementReady = true))
    }

    @Test fun searchIsCaseInsensitiveAndCannotLeaveAFilteredOutPowerSelectable() {
        val first = row("Cleave")
        val other = row("Sure Strike")
        val blocked = row("Blocked Strike", Eligibility.INELIGIBLE)
        val options = PickerOptions.Ready(listOf(first, other), listOf(blocked))
        assertEquals(listOf(other), visibleReaderPowers(options, false, "  STRIKE  "))
        assertEquals(other, powerReaderPage(visibleReaderPowers(options, false, "strike"), "Cleave", "Cleave"))
        assertNull(powerReaderPage(visibleReaderPowers(options, false, "no match"), "Cleave", "Cleave"))
        assertEquals(listOf(other, blocked), visibleReaderPowers(options, true, "strike"))
        val definition = requireNotNull(other.option)
        val described = other.copy(option = definition.copy(entry = definition.entry.copy(
            entry = definition.entry.entry.copy(presentation = Presentation("Sure Strike", "Martial Weapon")))))
        assertEquals(listOf(described), visibleReaderPowers(PickerOptions.Ready(listOf(described), emptyList()), false, "weapon"))
    }
}
