package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class ProgressionOptionsTest {
    private val metadata = CatalogEntry(EntryMetadata("feat", EntryCategory.FEAT, "Feat", "chunk"), PackageRevision("standard", "1"))

    private fun row(status: Eligibility) = BuilderOptionRow(metadata, BuilderOption(
        ResolvedEntry(ContentEntry("feat", EntryCategory.FEAT, Presentation("Feat"), Mechanics(), Coverage(CoverageStatus.SUPPORTED)),
            metadata.supplier, "fingerprint"), status, emptyList()), checked = true)

    @Test fun metadataAppearsBeforeEligibilityButCannotBeSelected() {
        val pending = BuilderOptionRow(metadata)
        assertTrue(pending.pickerVisible(emptySet(), false))
        assertFalse(pending.pickerSelectable(emptySet()))
        assertFalse(pending.copy(option = row(Eligibility.ELIGIBLE).option).pickerSelectable(emptySet()))
    }

    @Test fun checkedEligibleAndIncompleteRowsRemainSelectable() {
        for (status in listOf(Eligibility.ELIGIBLE, Eligibility.INCOMPLETE)) {
            val row = row(status)
            assertTrue(row.pickerSelectable(emptySet()))
            assertTrue(row.pickerVisible(emptySet(), false))
            assertFalse(row.pickerSelectable(setOf("feat")))
            assertFalse(row.pickerVisible(setOf("feat"), false))
        }
    }

    @Test fun unavailableAndIneligibleRowsOnlyAppearWithToggleAndStayDisabled() {
        for (row in listOf(row(Eligibility.INELIGIBLE), row(Eligibility.UNRESOLVED), BuilderOptionRow(metadata, checked = true))) {
            assertFalse(row.pickerSelectable(emptySet()))
            assertFalse(row.pickerVisible(emptySet(), false))
            assertTrue(row.pickerVisible(emptySet(), true))
        }
    }
}
