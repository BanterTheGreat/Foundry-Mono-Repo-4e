package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class PowerRequirementsTest {
    private fun row(mechanics: Mechanics, diagnostics: List<Diagnostic> = emptyList(),
        category: EntryCategory = EntryCategory.POWER): BuilderOptionRow {
        val supplier = PackageRevision("standard", "1")
        val entry = ContentEntry("utility", category, Presentation("Utility"), mechanics,
            Coverage(CoverageStatus.PARTIAL))
        val metadata = CatalogEntry(EntryMetadata(entry.id, entry.category, "Utility", "powers"), supplier)
        return BuilderOptionRow(metadata, BuilderOption(ResolvedEntry(entry, supplier, "fingerprint"),
            if (diagnostics.isEmpty()) Eligibility.ELIGIBLE else Eligibility.INELIGIBLE, diagnostics), checked = true)
    }

    @Test fun utilityShowsRequiredSkillAndTheActualFailedRequirementWithoutCoverageNoise() {
        val skill = Prerequisite.Proficiency(Skill.ARCANA)
        val classAccess = Prerequisite.Entry("modern4e.class.wizard")
        val diagnostics = listOf(
            Diagnostic("engine.prerequisite", DiagnosticKind.INVALID_SELECTION, "Unsatisfied prerequisite: $skill"),
            Diagnostic("engine.coverage", DiagnosticKind.INCOMPLETE_AUTOMATION, "Long automation limitation"),
            Diagnostic("engine.selectionRemaining", DiagnosticKind.INVALID_SELECTION, "Select another power"),
        )
        val preview = powerRequirementPreview(row(Mechanics(version = 2, access = classAccess,
            prerequisites = listOf(skill), powerProfile = PowerProfile(2, "ENCOUNTER", "UTILITY")), diagnostics),
            mapOf("modern4e.class.wizard" to "Wizard"), setOf("modern4e.class.wizard"))
        assertEquals("Proficient in Arcana", preview.requirements)
        assertEquals(listOf("Proficient in Arcana"), preview.unmet)
        assertFalse(preview.requirements!!.contains("modern4e"))
    }

    @Test fun groupedRequirementsPreserveAlternativeAndCombinedRoutes() {
        val access = Prerequisite.AnyOf(listOf(Prerequisite.ClassPowerSource("ARCANE"),
            Prerequisite.AllOf(listOf(Prerequisite.Entry("class.druid"), Prerequisite.Proficiency(Skill.NATURE)))))
        val mechanics = Mechanics(version = 2, access = access,
            prerequisites = listOf(Prerequisite.Level(6), Prerequisite.AbilityPoints(Ability.WISDOM, 2)),
            powerProfile = PowerProfile(6, "DAILY", "UTILITY"))
        val preview = powerRequirementPreview(row(mechanics), mapOf("class.druid" to "Druid"))
        assertEquals("(Arcane power source or (Druid and Proficient in Nature)); Wisdom 2+", preview.requirements)
        assertTrue(preview.unmet.isEmpty())
    }

    @Test fun failuresUseTheCheckedCandidateRatherThanPresentDayCharacterFacts() {
        val wisdom = Prerequisite.AbilityPoints(Ability.WISDOM, 3)
        val preview = powerRequirementPreview(row(Mechanics(version = 2, prerequisites = listOf(wisdom)), listOf(
            Diagnostic("engine.prerequisite", DiagnosticKind.INVALID_SELECTION, "Unsatisfied prerequisite: $wisdom"))), emptyMap())
        assertEquals(listOf("Wisdom 3+"), preview.unmet)
        assertFalse(preview.unmet.single().contains("AbilityPoints"))
    }

    @Test fun unmetAlternativesAreTakenFromEngineFailuresWithoutClaimingSatisfiedBranchesFailed() {
        val arcana = Prerequisite.Proficiency(Skill.ARCANA)
        val nature = Prerequisite.Proficiency(Skill.NATURE)
        val mechanics = Mechanics(version = 2, prerequisites = listOf(Prerequisite.AnyOf(listOf(arcana, nature))))
        val preview = powerRequirementPreview(row(mechanics, listOf(
            Diagnostic("engine.prerequisite", DiagnosticKind.INVALID_SELECTION, "Unsatisfied prerequisite: $nature"))), emptyMap())
        assertEquals("(Proficient in Arcana or Proficient in Nature)", preview.requirements)
        assertEquals(listOf("Proficient in Nature"), preview.unmet)
    }

    @Test fun unknownRequirementFactsStayCompactAndUnavailableDefinitionsHaveNoInventedRequirements() {
        val preview = powerRequirementPreview(row(Mechanics(version = 2), listOf(
            Diagnostic("engine.prerequisiteUnavailable", DiagnosticKind.UNRESOLVED_CONTENT, "Very long internal diagnostics"))), emptyMap())
        assertNull(preview.requirements)
        assertEquals(listOf("Some requirements could not be checked."), preview.unmet)
        val unavailable = row(Mechanics()).copy(option = null)
        assertEquals(PowerRequirementPreview(null, emptyList()), powerRequirementPreview(unavailable, emptyMap()))
    }

    @Test fun powerLevelAndUnconditionalAlternativeRequirementsAreNotRepeated() {
        val mechanics = Mechanics(version = 2,
            access = Prerequisite.AnyOf(listOf(Prerequisite.Always, Prerequisite.Level(11))),
            powerProfile = PowerProfile(2, "ENCOUNTER", "UTILITY"))
        assertNull(powerRequirementPreview(row(mechanics), emptyMap()).requirements)
        val nested = mechanics.copy(access = Prerequisite.AnyOf(listOf(
            Prerequisite.AllOf(listOf(Prerequisite.Always)), Prerequisite.Proficiency(Skill.ARCANA))))
        assertNull(powerRequirementPreview(row(nested), emptyMap()).requirements)
    }

    @Test fun powersOmitOnlyClassEntriesAndLevelsWhileKeepingFeatureAndSourceRequirements() {
        val wizard = Prerequisite.Entry("class.wizard")
        val level = Prerequisite.Level(6)
        val feature = Prerequisite.Entry("feature.staff-defense")
        val source = Prerequisite.ClassPowerSource("ARCANE")
        val conditions = listOf(wizard, level, feature, source)
        val diagnostics = conditions.map {
            Diagnostic("engine.prerequisite", DiagnosticKind.INVALID_SELECTION, "Unsatisfied prerequisite: $it")
        }
        val preview = entryRequirementPreview(row(Mechanics(version = 2, prerequisites = conditions), diagnostics),
            mapOf("class.wizard" to "Wizard", "feature.staff-defense" to "Staff of Defense"), setOf("class.wizard"))
        assertEquals("Staff of Defense; Arcane power source", preview.requirements)
        assertEquals(listOf("Staff of Defense", "Arcane power source"), preview.unmet)
    }

    @Test fun omittedClassRoutesDoNotMakeAlternativeSkillRequirementsLookMandatory() {
        val wizard = Prerequisite.Entry("class.wizard")
        val skill = Prerequisite.Proficiency(Skill.ARCANA)
        val mechanics = Mechanics(version = 2, access = Prerequisite.AnyOf(listOf(
            Prerequisite.AllOf(listOf(wizard, Prerequisite.Level(6))), skill)))
        val preview = entryRequirementPreview(row(mechanics), mapOf("class.wizard" to "Wizard"), setOf("class.wizard"))
        assertNull(preview.requirements)
        assertTrue(preview.unmet.isEmpty())
    }

    @Test fun advancementEntriesShowAllAuthoredRequirementsAndActualMissingConditions() {
        val wizard = Prerequisite.Entry("class.wizard")
        val level = Prerequisite.Level(11)
        val skill = Prerequisite.Proficiency(Skill.ARCANA)
        val conditions = listOf(wizard, level, skill)
        val missing = listOf(wizard, skill).map {
            Diagnostic("engine.prerequisite", DiagnosticKind.INVALID_SELECTION, "Unsatisfied prerequisite: $it")
        }
        for (category in listOf(EntryCategory.THEME, EntryCategory.PARAGON_PATH, EntryCategory.EPIC_DESTINY)) {
            val preview = entryRequirementPreview(row(Mechanics(version = 2, prerequisites = conditions), missing, category),
                mapOf("class.wizard" to "Wizard"), setOf("class.wizard"))
            assertEquals("Wizard; Level 11+; Proficient in Arcana", preview.requirements)
            assertEquals(listOf("Wizard", "Proficient in Arcana"), preview.unmet)
        }
    }
}
