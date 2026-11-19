package dev.modern4e.builder

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.*
import org.junit.Test

class ProgressionOptionsTest {
    @Test fun featChoicesOmitFutureTiersAtTheAcquisitionLevel() {
        fun feat(id: String, minimum: Int, status: Eligibility = Eligibility.INELIGIBLE) = row(status, id,
            mechanics = Mechanics(prerequisites = listOf(Prerequisite.Level(minimum))))
        val heroic = feat("heroic", 1, Eligibility.ELIGIBLE)
        val blockedHeroic = feat("blocked-heroic", 5)
        val paragon = feat("paragon", 11)
        val epic = feat("epic", 21)
        val rows = listOf(epic, blockedHeroic, heroic, paragon)
        fun visible(level: Int) = (pickerOptions(rows, emptySet(), featLevel = level) as PickerOptions.Ready).visible
        assertEquals(listOf(heroic, blockedHeroic), visible(1))
        assertEquals(listOf(heroic, blockedHeroic), visible(10))
        assertEquals(listOf(heroic, paragon, blockedHeroic), visible(11))
        assertEquals(listOf(heroic, paragon, blockedHeroic), visible(20))
        assertEquals(listOf(heroic, epic, paragon, blockedHeroic), visible(21))
        // Editing the creation slot of a later character still passes the slot's level, not its current level.
        assertEquals(listOf(heroic, blockedHeroic), visible(1))
        assertEquals(listOf(heroic, epic, paragon, blockedHeroic),
            (pickerOptions(rows, emptySet()) as PickerOptions.Ready).visible)
    }

    @Test fun featTierFilteringPreservesPendingAndUnavailableRowsAndOtherCategories() {
        val pending = BuilderOptionRow(metadata)
        val unavailable = BuilderOptionRow(metadata.copy(metadata = metadata.metadata.copy(id = "unavailable")), checked = true)
        val epic = row(Eligibility.INELIGIBLE, "epic", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Level(21))))
        assertEquals(PickerOptions.Loading(1, 2, 0), pickerOptions(listOf(epic, pending, unavailable), emptySet(), 1))
        val power = row(Eligibility.INELIGIBLE, "power", category = EntryCategory.POWER,
            mechanics = Mechanics(prerequisites = listOf(Prerequisite.Level(21))))
        assertEquals(listOf(power, unavailable),
            (pickerOptions(listOf(epic, power, unavailable), emptySet(), 1) as PickerOptions.Ready).visible)
    }

    private val metadata = CatalogEntry(EntryMetadata("feat", EntryCategory.FEAT, "Feat", "chunk"), PackageRevision("standard", "1"))

    private fun row(status: Eligibility, id: String = "feat", title: String = "Feat",
        category: EntryCategory = EntryCategory.FEAT, mechanics: Mechanics = Mechanics()): BuilderOptionRow {
        val catalogEntry = metadata.copy(metadata = metadata.metadata.copy(id = id, title = title, category = category))
        return BuilderOptionRow(catalogEntry, BuilderOption(
            ResolvedEntry(ContentEntry(id, category, Presentation(title), mechanics, Coverage(CoverageStatus.SUPPORTED)),
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
        assertFalse(row(Eligibility.INELIGIBLE).pickerSelectable(emptySet()))
        assertFalse(row(Eligibility.UNRESOLVED).pickerSelectable(emptySet()))
        assertFalse(BuilderOptionRow(metadata, checked = true).pickerSelectable(emptySet()))
        assertFalse(row(Eligibility.ELIGIBLE).copy(checked = false).pickerSelectable(emptySet()))
    }

    @Test fun featDetailsUseTheSameAuthoredPrerequisitesForEligibleAndIneligibleRows() {
        val titles = mapOf("ranger" to "Ranger", "rogue" to "Rogue")
        for (status in listOf(Eligibility.ELIGIBLE, Eligibility.INELIGIBLE)) {
            val option = checkNotNull(row(status).option)
            val entry = option.entry.entry.copy(
                mechanics = Mechanics(access = Prerequisite.AnyOf(listOf(
                    Prerequisite.Entry("ranger"), Prerequisite.Entry("rogue"),
                ))),
                sharedData = buildJsonObject { put("runtimeRequirementText", "11th level") },
            )
            assertEquals("(Ranger or Rogue), 11th level", entry.featPrerequisiteText(titles))
            assertEquals("Ranger or Rogue", entry.copy(sharedData = null).featPrerequisiteText(titles))
            assertNull(option.entry.entry.featPrerequisiteText(titles))
        }
    }

    @Test fun completeResultsKeepEligibleOptionsFirstAndSortWithinGroups() {
        val ineligible = row(Eligibility.INELIGIBLE, "ineligible")
        val eligible = row(Eligibility.ELIGIBLE, "eligible")
        val unresolved = row(Eligibility.UNRESOLVED, "unresolved")
        val incomplete = row(Eligibility.INCOMPLETE, "incomplete")
        val unavailable = BuilderOptionRow(metadata, checked = true)
        val duplicate = row(Eligibility.ELIGIBLE, "duplicate")
        val all = listOf(ineligible, eligible, unresolved, incomplete, unavailable, duplicate)
        assertEquals(PickerOptions.Ready(listOf(eligible, incomplete), listOf(duplicate, ineligible, unresolved, unavailable)),
            pickerOptions(all, setOf("duplicate")))
        assertEquals(PickerOptions.Ready(emptyList(), emptyList()), pickerOptions(emptyList(), emptySet()))
    }

    @Test fun featsSortByDescendingTierThenCaseInsensitiveNameAndStableIdentity() {
        fun feat(id: String, title: String, minimum: Int, status: Eligibility = Eligibility.ELIGIBLE) =
            row(status, id, title, mechanics = Mechanics(prerequisites = listOf(Prerequisite.Level(minimum))))
        val heroic = feat("heroic", "Aardvark", 1)
        val paragon = feat("paragon", "Alpha", 11)
        val epicZebra = feat("epic-zebra", "Zebra", 21)
        val epicAlphaB = feat("epic-b", "alpha", 21)
        val epicAlphaA = feat("epic-a", "Alpha", 21)
        val blockedHeroic = feat("blocked-heroic", "Aardvark", 1, Eligibility.INELIGIBLE)
        val blockedEpic = feat("blocked-epic", "Zebra", 21, Eligibility.INELIGIBLE)
        val result = pickerOptions(listOf(heroic, blockedHeroic, epicZebra, epicAlphaB,
            paragon, blockedEpic, epicAlphaA), emptySet()) as PickerOptions.Ready
        assertEquals(listOf(epicAlphaA, epicAlphaB, epicZebra, paragon, heroic), result.eligible)
        assertEquals(listOf(blockedEpic, blockedHeroic), result.ineligible)
        assertEquals(listOf(epicAlphaA, epicAlphaB, epicZebra, paragon, heroic, blockedEpic, blockedHeroic), result.visible)
    }

    @Test fun powersSortByDescendingLevelThenNameWithUnknownLevelsLast() {
        fun power(id: String, title: String, level: Int?, status: Eligibility = Eligibility.ELIGIBLE) = row(status, id, title,
            EntryCategory.POWER, Mechanics(powerProfile = level?.let { PowerProfile(it, "ENCOUNTER", "ATTACK") }))
        val low = power("low", "Aardvark", 1)
        val highZebra = power("high-zebra", "Zebra", 19)
        val highAlphaB = power("high-b", "alpha", 19)
        val highAlphaA = power("high-a", "Alpha", 19)
        val middle = power("middle", "Beta", 13)
        val unknownZebra = power("unknown-zebra", "Zebra", null)
        val unknownAlpha = power("unknown-alpha", "Alpha", null)
        val blockedHigh = power("blocked-high", "Beta", 19, Eligibility.INELIGIBLE)
        val blockedLow = power("blocked-low", "Zebra", 1, Eligibility.INELIGIBLE)
        val result = pickerOptions(listOf(unknownZebra, low, highZebra, highAlphaB,
            unknownAlpha, middle, highAlphaA, blockedHigh, blockedLow), emptySet()) as PickerOptions.Ready
        assertEquals(listOf(highAlphaA, highAlphaB, highZebra, middle, low, unknownAlpha, unknownZebra), result.eligible)
        assertEquals(listOf(highAlphaA, highAlphaB, highZebra, middle, low, unknownAlpha, unknownZebra, blockedHigh, blockedLow),
            result.visible)
    }

    @Test fun otherAndMixedCatalogsRetainTheirAuthoredOrder() {
        val zebra = row(Eligibility.ELIGIBLE, "zebra", "Zebra", EntryCategory.FEATURE)
        val alpha = row(Eligibility.ELIGIBLE, "alpha", "Alpha", EntryCategory.FEATURE)
        val feat = row(Eligibility.ELIGIBLE, "feat", "Aardvark")
        assertEquals(listOf(zebra, alpha), (pickerOptions(listOf(zebra, alpha), emptySet()) as PickerOptions.Ready).eligible)
        assertEquals(listOf(zebra, feat, alpha),
            (pickerOptions(listOf(zebra, feat, alpha), emptySet()) as PickerOptions.Ready).eligible)
    }
}
