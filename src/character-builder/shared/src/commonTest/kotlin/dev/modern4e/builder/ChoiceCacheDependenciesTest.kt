package dev.modern4e.builder

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChoiceCacheDependenciesTest {
    private val categories = mapOf("fighter" to EntryCategory.CLASS, "wizard" to EntryCategory.CLASS,
        "elf" to EntryCategory.ANCESTRY, "old-feat" to EntryCategory.FEAT, "other-feat" to EntryCategory.FEAT)

    private fun feat(id: String, vararg requirements: Prerequisite) = ContentEntry(id, EntryCategory.FEAT,
        Presentation(id), Mechanics(version = 2, prerequisites = requirements.toList(), maximumSelections = 1),
        Coverage(CoverageStatus.SUPPORTED))

    private fun power(id: String, usage: String, kind: String = "ATTACK", vararg requirements: Prerequisite) =
        feat(id, *requirements).copy(category = EntryCategory.POWER,
            mechanics = Mechanics(version = 2, prerequisites = requirements.toList(), maximumSelections = 1,
                powerProfile = PowerProfile(1, usage, kind)))

    private fun retains(candidate: ContentEntry, vararg changes: ContentEntry) =
        ChoiceCacheDependencies.canRetain(candidate, changes.toList(), categories)

    @Test fun passiveFeatChangeKeepsIndependentRowsButNotRepeatOrReferenceChecks() {
        val changed = feat("old-feat")
        assertTrue(retains(feat("independent", Prerequisite.Level(4)), changed))
        assertFalse(retains(changed, changed))
        assertFalse(retains(feat("dependent", Prerequisite.Entry(changed.id)), changed))
        assertTrue(retains(feat("other", Prerequisite.Entry("other-feat")), changed))
    }

    @Test fun groupedRequirementsKeepTheirDependencyOnAnyAffectedLeaf() {
        val candidate = feat("candidate", Prerequisite.AnyOf(listOf(Prerequisite.Level(11),
            Prerequisite.AllOf(listOf(Prerequisite.Entry("old-feat"), Prerequisite.Level(4))))))
        assertFalse(retains(candidate, feat("old-feat")))
        assertTrue(retains(candidate, feat("unrelated")))
    }

    @Test fun proficiencyGrantsRefreshOnlyRowsReadingThatSkill() {
        val changed = feat("training").copy(mechanics = Mechanics(version = 2,
            grants = listOf(Grant.Proficiency("training", Skill.ACROBATICS))))
        assertFalse(retains(feat("acrobat", Prerequisite.Proficiency(Skill.ACROBATICS)), changed))
        assertTrue(retains(feat("athlete", Prerequisite.Proficiency(Skill.ATHLETICS)), changed))
        assertTrue(retains(feat("fighter-feat", Prerequisite.Entry("fighter")), changed))
        val indirect = changed.copy(mechanics = changed.mechanics.copy(grants = listOf(Grant.Entry("child", "unknown-child"))))
        assertFalse(retains(feat("athlete", Prerequisite.Proficiency(Skill.ATHLETICS)), indirect))
    }

    @Test fun multiclassAccessRefreshesClassAndSelectedFeatRequirements() {
        val changed = feat("multiclass").copy(mechanics = Mechanics(version = 2, multiclassFor = "fighter"))
        assertFalse(retains(feat("fighter-feat", Prerequisite.Entry("fighter")), changed))
        assertTrue(retains(feat("wizard-feat", Prerequisite.Entry("wizard")), changed))
        assertFalse(retains(feat("multiclass-feat", Prerequisite.Selected(EntryCategory.FEAT,
            SelectedFilters(multiclass = true, classSpecific = true))), changed))
        assertFalse(retains(feat("martial", Prerequisite.ClassPowerSource("MARTIAL")), changed))
        assertTrue(retains(feat("general", Prerequisite.Level(4)), changed))
    }

    @Test fun activeAndLegacyCandidatesOrPowerChangesRequireFreshEvaluation() {
        val base = feat("candidate")
        val changed = feat("changed")
        val active = base.copy(mechanics = base.mechanics.copy(grants = listOf(Grant.Proficiency("skill", Skill.ARCANA))))
        assertFalse(retains(active, changed))
        assertFalse(retains(base.copy(mechanics = base.mechanics.copy(version = 1)), changed))
        assertFalse(retains(base, changed.copy(mechanics = changed.mechanics.copy(version = 1))))
        val activePower = power("active", "DAILY").copy(mechanics = Mechanics(version = 2,
            powerProfile = PowerProfile(1, "DAILY", "ATTACK"), grants = listOf(Grant.Entry("child", "feature"))))
        assertFalse(retains(base, activePower))
        assertFalse(retains(base, changed.copy(category = EntryCategory.FEATURE)))
    }

    @Test fun attackUsagesStaySeparateAndUtilitiesRemainOneFamily() {
        val daily = power("daily", "DAILY")
        assertFalse(retains(daily, power("other-daily", "DAILY")))
        assertTrue(retains(daily, power("encounter", "ENCOUNTER")))
        assertTrue(retains(daily, power("utility", "DAILY", "UTILITY")))
        assertFalse(retains(power("utility-a", "AT_WILL", "UTILITY"), power("utility-b", "DAILY", "UTILITY")))
        assertFalse(retains(daily, daily))
    }

    @Test fun selectedAndNamedPowerRequirementsRefreshOnlyForRelevantPowers() {
        val encounterRequired = feat("selected-power", Prerequisite.Selected(EntryCategory.POWER,
            SelectedFilters(usage = "ENCOUNTER", hasLevel = true)))
        assertFalse(retains(encounterRequired, power("encounter", "ENCOUNTER")))
        assertTrue(retains(encounterRequired, power("daily", "DAILY")))
        val named = feat("named-power", Prerequisite.Entry("required-power"))
        assertFalse(retains(named, power("required-power", "DAILY")))
        assertTrue(retains(named, power("unrelated-power", "DAILY")))
    }

    @Test fun unknownReferencesAndPoolOverridesDoNotClaimIndependence() {
        assertFalse(retains(feat("unknown", Prerequisite.Entry("unknown-entry")), feat("changed")))
        val override = feat("override").copy(mechanics = Mechanics(version = 2,
            selectionModifiers = listOf(SelectionModifier("pool", 1))))
        assertFalse(retains(feat("candidate"), override))
    }

    @Test fun abilityEquipmentAndSizeFactsRefreshTheirReaders() {
        val changed = feat("ability").copy(mechanics = Mechanics(version = 2,
            modifiers = listOf(TypedModifier(ModifierTarget(Statistic.ABILITY_POINTS, ability = Ability.STRENGTH),
                ModifierOperation.ADD, 1))))
        assertFalse(retains(feat("strong", Prerequisite.AbilityPoints(Ability.STRENGTH, 2)), changed))
        assertTrue(retains(feat("wise", Prerequisite.AbilityPoints(Ability.WISDOM, 2)), changed))
        val equipment = feat("armor").copy(mechanics = Mechanics(version = 2, equipmentProficiencies = listOf("plate")))
        assertFalse(retains(feat("plate", Prerequisite.EquipmentProficiency("plate")), equipment))
        assertTrue(retains(feat("shield", Prerequisite.EquipmentProficiency("shield")), equipment))
        val sized = feat("size").copy(mechanics = Mechanics(version = 2, size = CreatureSize.SMALL))
        assertFalse(retains(feat("small", Prerequisite.Size(CreatureSize.SMALL)), sized))
    }
}
