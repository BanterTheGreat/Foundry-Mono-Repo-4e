package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class PowerReaderOptionsTest {
    @Test fun utilityBadgesUseAuthoredLevelsEvenWithGroupedRequirements() {
        val grouped = Mechanics(prerequisites = listOf(Prerequisite.AllOf(listOf(
            Prerequisite.Level(6), Prerequisite.Proficiency(Skill.ARCANA)))),
            powerProfile = PowerProfile(6, "ENCOUNTER", "UTILITY"))
        val utility = ContentEntry("utility", EntryCategory.POWER, Presentation("Utility"), grouped,
            Coverage(CoverageStatus.PARTIAL))
        assertEquals(6, utility.pickerPowerLevel())
        assertEquals(6, utility.copy(mechanics = grouped.copy(powerProfile = null)).pickerPowerLevel())
        assertEquals(2, utility.copy(mechanics = grouped.copy(powerProfile = PowerProfile(2, "DAILY", "UTILITY")))
            .pickerPowerLevel())
        assertNull(utility.copy(mechanics = Mechanics()).pickerPowerLevel())
    }

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

    @Test fun classOwnedFeaturesUseTheSplitReaderThroughNestedChoices() {
        val classEntry = EngineEntry("class", ChoiceSlotId("creation", "class", 0),
            requireNotNull(row("sorcerer", category = EntryCategory.CLASS).option).entry, granted = false)
        val featureEntry = EngineEntry("feature", ChoiceSlotId("class", "granted-feature", 0),
            requireNotNull(row("spell-source", category = EntryCategory.FEATURE).option).entry, granted = true)
        val nestedChoice = ChoiceSlotId("feature", "spell-source-choice", 0)
        val features = listOf(row("dragon-magic", category = EntryCategory.FEATURE))
        val entries = listOf(classEntry, featureEntry)

        assertTrue(usesClassFeatureReader(features, nestedChoice, entries))
        assertTrue(usesClassFeatureReader(features + row("power"), nestedChoice, entries))
        assertFalse(usesClassFeatureReader(features + row("feat", category = EntryCategory.FEAT), nestedChoice, entries))
        assertFalse(usesClassFeatureReader(features, nestedChoice, listOf(featureEntry)))
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
        assertEquals(blocked, catalogReaderPage(listOf(first, draft, blocked), "blocked", "draft"))
        assertEquals(draft, catalogReaderPage(listOf(first, draft), "blocked", "draft"))
        assertEquals(first, catalogReaderPage(listOf(first, draft), "removed", "removed"))
        assertNull(catalogReaderPage(emptyList(), "old", "old"))
    }

    @Test fun advancementRowTapStagesAnAvailableDifferentEntry() {
        val theme = row("theme", category = EntryCategory.THEME)
        val blocked = row("blocked", Eligibility.INELIGIBLE, EntryCategory.THEME)
        val other = row("other", category = EntryCategory.THEME)
        val rows = listOf(theme, other, blocked)

        assertEquals(blocked, catalogReaderPage(rows, "blocked", "theme"))
        assertNull(blocked.catalogReaderDraft(emptySet(), "theme"))
        assertNull(theme.catalogReaderDraft(emptySet(), "theme"))
        assertNull(theme.catalogReaderDraft(setOf("theme"), null))
        val draft = theme.catalogReaderDraft(emptySet(), null)
        assertEquals(theme.option, draft)
        assertEquals(other.option, other.catalogReaderDraft(emptySet(), draft?.entry?.entry?.id))
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

    @Test fun visibleIneligibleOptionsCanBeExplicitlyDraftedButPendingAndUnavailableRowsCannot() {
        val blocked = row("blocked", Eligibility.INELIGIBLE)
        val duplicate = row("duplicate")
        val unresolved = row("unresolved", Eligibility.UNRESOLVED, EntryCategory.THEME)
        val missing = blocked.copy(option = null)
        val unchecked = blocked.copy(checked = false)
        val taken = setOf("duplicate")

        assertEquals(blocked.option, blocked.powerDraftOnTap(taken, null, replacementReady = true, allowIneligible = true))
        assertEquals(duplicate.option, duplicate.powerDraftOnTap(taken, null, replacementReady = true, allowIneligible = true))
        assertEquals(unresolved.option, unresolved.catalogReaderDraft(taken, null, allowIneligible = true))
        assertNull(blocked.powerDraftOnTap(taken, null, replacementReady = false, allowIneligible = true))
        assertNull(blocked.powerDraftOnTap(taken, "blocked", replacementReady = true, allowIneligible = true))
        assertNull(missing.catalogReaderDraft(taken, null, allowIneligible = true))
        assertNull(unchecked.catalogReaderDraft(taken, null, allowIneligible = true))
    }

    @Test fun featTierBadgeUsesTheEarliestLevelAllowedByAccessAndPrerequisites() {
        val feat = requireNotNull(row("feat", category = EntryCategory.FEAT).option).entry.entry
        val classAccess = Prerequisite.Entry("fighter")
        val paragonAccess = Prerequisite.AllOf(listOf(classAccess, Prerequisite.Level(11)))
        val tierAlternatives = Prerequisite.AnyOf(listOf(Prerequisite.Level(21), Prerequisite.Level(11)))

        assertEquals("H", feat.featTierBadge())
        assertEquals("H", feat.copy(mechanics = Mechanics(prerequisites = listOf(
            Prerequisite.AnyOf(listOf(classAccess, Prerequisite.Level(21))),
        ))).featTierBadge())
        assertEquals("P", feat.copy(mechanics = Mechanics(access = paragonAccess)).featTierBadge())
        assertEquals("P", feat.copy(mechanics = Mechanics(prerequisites = listOf(tierAlternatives))).featTierBadge())
        assertEquals("E", feat.copy(mechanics = Mechanics(access = paragonAccess, prerequisites = listOf(
            tierAlternatives, Prerequisite.Level(21),
        ))).featTierBadge())
    }

    @Test fun searchIsCaseInsensitiveAndCannotLeaveAFilteredOutPowerSelectable() {
        val first = row("Cleave")
        val other = row("Sure Strike")
        val blocked = row("Blocked Strike", Eligibility.INELIGIBLE)
        val options = PickerOptions.Ready(listOf(first, other), listOf(blocked))
        assertEquals(listOf(other, blocked), visibleReaderPowers(options, "  STRIKE  "))
        assertEquals(other, catalogReaderPage(visibleReaderPowers(options, "strike"), "Cleave", "Cleave"))
        assertNull(catalogReaderPage(visibleReaderPowers(options, "no match"), "Cleave", "Cleave"))
        assertEquals(listOf(blocked), visibleReaderPowers(options, "blocked"))
        val definition = requireNotNull(other.option)
        val described = other.copy(option = definition.copy(entry = definition.entry.copy(
            entry = definition.entry.entry.copy(presentation = Presentation("Sure Strike", "Martial Weapon")))))
        assertEquals(listOf(described), visibleReaderPowers(PickerOptions.Ready(listOf(described), emptyList()), "weapon"))
    }
}
