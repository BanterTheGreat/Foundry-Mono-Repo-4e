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

    @Test fun browsingAnotherPowerLeavesTheDraftIndependent() {
        val a = row("chosen")
        val b = row("reading")
        val options = PickerOptions.Ready(listOf(a, b), emptyList())
        assertEquals(PowerReaderPage(a, false), powerReaderPage(options, null, "chosen", emptySet(), false))
        assertEquals(PowerReaderPage(b, true), powerReaderPage(options, "reading", "chosen", emptySet(), false))
        assertEquals(PowerReaderPage(a, false), powerReaderPage(options, null, "chosen", emptySet(), false))
        // Once explicitly drafted, the same power remains readable but cannot be chosen again.
        assertEquals(PowerReaderPage(b, false), powerReaderPage(options, "reading", "reading", emptySet(), false))
    }

    @Test fun hiddenOrRemovedReadingTargetsFallBackToTheCurrentDraftThenFirstOption() {
        val a = row("first")
        val b = row("draft")
        val blocked = row("blocked", Eligibility.INELIGIBLE)
        val options = PickerOptions.Ready(listOf(a, b), listOf(blocked))
        assertEquals(PowerReaderPage(blocked, false), powerReaderPage(options, "blocked", "draft", emptySet(), true))
        assertEquals(PowerReaderPage(b, false), powerReaderPage(options, "blocked", "draft", emptySet(), false))
        assertEquals(PowerReaderPage(a, true), powerReaderPage(options, "removed", "removed", emptySet(), false))
    }

    @Test fun duplicatesAndUnresolvedDefinitionsCannotBeChosenFromTheReader() {
        val duplicate = row("duplicate")
        val unresolved = row("unresolved", Eligibility.UNRESOLVED)
        val missing = BuilderOptionRow(row("missing").metadata, checked = true)
        val options = PickerOptions.Ready(emptyList(), listOf(duplicate, unresolved, missing))
        for (entry in options.ineligible) {
            assertFalse(requireNotNull(powerReaderPage(options, entry.metadata.metadata.id, null, setOf("duplicate"), true)).canChoose)
        }
        assertNull(powerReaderPage(options, "missing", null, emptySet(), false))
    }

    @Test fun incompleteButSelectablePowersRemainAvailable() {
        val incomplete = row("incomplete", Eligibility.INCOMPLETE)
        assertEquals(PowerReaderPage(incomplete, true), powerReaderPage(
            PickerOptions.Ready(listOf(incomplete), emptyList()), null, null, emptySet(), false))
    }

    @Test fun loadingAndEmptyListsHaveNoStaleReaderAction() {
        assertNull(powerReaderPage(PickerOptions.Loading(1, 2, 1), "old", "old", emptySet(), true))
        assertNull(powerReaderPage(PickerOptions.Ready(emptyList(), emptyList()), "old", "old", emptySet(), true))
    }

    @Test fun searchIsCaseInsensitiveAndCannotLeaveAFilteredOutPowerSelectable() {
        val first = row("Cleave")
        val other = row("Sure Strike")
        val blocked = row("Blocked Strike", Eligibility.INELIGIBLE)
        val options = PickerOptions.Ready(listOf(first, other), listOf(blocked))
        assertEquals(listOf(other), visibleReaderPowers(options, false, "  STRIKE  "))
        assertEquals(PowerReaderPage(other, true), powerReaderPage(options, "Cleave", "Cleave", emptySet(), false, "strike"))
        assertNull(powerReaderPage(options, "Cleave", "Cleave", emptySet(), false, "no match"))
        assertEquals(listOf(other, blocked), visibleReaderPowers(options, true, "strike"))
        val definition = requireNotNull(other.option)
        val described = other.copy(option = definition.copy(entry = definition.entry.copy(
            entry = definition.entry.entry.copy(presentation = Presentation("Sure Strike", "Martial Weapon")))))
        assertEquals(listOf(described), visibleReaderPowers(PickerOptions.Ready(listOf(described), emptyList()), false, "weapon"))
    }
}
