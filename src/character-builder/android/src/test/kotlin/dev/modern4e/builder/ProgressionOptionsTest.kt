package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class ProgressionOptionsTest {
    private val metadata = CatalogEntry(EntryMetadata("feat", EntryCategory.FEAT, "Feat", "chunk"), PackageRevision("standard", "1"))

    private fun row(status: Eligibility, id: String = "feat"): BuilderOptionRow {
        val catalogEntry = metadata.copy(metadata = metadata.metadata.copy(id = id))
        return BuilderOptionRow(catalogEntry, BuilderOption(
            ResolvedEntry(ContentEntry(id, EntryCategory.FEAT, Presentation("Feat"), Mechanics(), Coverage(CoverageStatus.SUPPORTED)),
                catalogEntry.supplier, "fingerprint"), status, emptyList()), checked = true)
    }

    @Test fun unfinishedChecksExposeCountsInsteadOfPartialResults() {
        assertEquals(PickerOptions.Loading(), pickerOptions(null, emptySet()))
        val pending = BuilderOptionRow(metadata)
        val eligible = row(Eligibility.ELIGIBLE, "eligible")
        val duplicate = row(Eligibility.ELIGIBLE, "duplicate")
        val ineligible = row(Eligibility.INELIGIBLE, "ineligible")
        val incomplete = row(Eligibility.INCOMPLETE, "incomplete")
        assertEquals(PickerOptions.Loading(0, 1, 0), pickerOptions(listOf(pending), emptySet()))
        assertEquals(PickerOptions.Loading(4, 5, 1),
            pickerOptions(listOf(pending, eligible, duplicate, ineligible, incomplete), setOf("duplicate")))
    }

    @Test fun checkedEligibleAndIncompleteRowsRemainSelectable() {
        for (status in listOf(Eligibility.ELIGIBLE, Eligibility.INCOMPLETE)) {
            val row = row(status)
            assertTrue(row.pickerSelectable(emptySet()))
            assertFalse(row.pickerSelectable(setOf("feat")))
        }
    }

    @Test fun completeResultsKeepEligibleOptionsFirstWithoutReorderingWithinGroups() {
        val ineligible = row(Eligibility.INELIGIBLE, "ineligible")
        val eligible = row(Eligibility.ELIGIBLE, "eligible")
        val unresolved = row(Eligibility.UNRESOLVED, "unresolved")
        val incomplete = row(Eligibility.INCOMPLETE, "incomplete")
        val unavailable = BuilderOptionRow(metadata, checked = true)
        val duplicate = row(Eligibility.ELIGIBLE, "duplicate")
        val all = listOf(ineligible, eligible, unresolved, incomplete, unavailable, duplicate)
        assertEquals(PickerOptions.Ready(listOf(eligible, incomplete), listOf(ineligible, unresolved, unavailable, duplicate)),
            pickerOptions(all, setOf("duplicate")))
        assertEquals(PickerOptions.Ready(emptyList(), emptyList()), pickerOptions(emptyList(), emptySet()))
    }
}
