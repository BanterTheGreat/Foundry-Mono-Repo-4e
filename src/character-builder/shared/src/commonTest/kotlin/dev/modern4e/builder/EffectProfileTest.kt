package dev.modern4e.builder

import kotlin.test.Test
import kotlin.test.assertEquals

class EffectProfileTest {
    private val profile = PowerProfile(1, "ENCOUNTER", "ATTACK")

    private fun entry(category: EntryCategory, mechanics: Mechanics) =
        ContentEntry("subject", category, Presentation("Subject"), mechanics, Coverage(CoverageStatus.SUPPORTED))

    private fun feat(mechanics: Mechanics) = entry(EntryCategory.FEAT, mechanics)

    private val bare = Mechanics(version = 2, prerequisites = listOf(Prerequisite.Level(4)),
        access = Prerequisite.Entry("fighter"), maximumSelections = 1, unsupported = listOf("Combat text"))

    @Test fun kindsSeparatePassivePlainPowersAndActiveMechanics() {
        val cases = listOf(
            "requirements and limits only" to feat(bare) to EffectKind.PASSIVE,
            "power with a profile" to entry(EntryCategory.POWER, bare.copy(powerProfile = profile)) to EffectKind.PLAIN_POWER,
            "power without a profile" to entry(EntryCategory.POWER, bare) to EffectKind.PASSIVE,
            "legacy version" to feat(bare.copy(version = 1)) to EffectKind.ACTIVE,
            "modifier" to feat(bare.copy(modifiers = listOf(TypedModifier(ModifierTarget(Statistic.SPEED),
                ModifierOperation.ADD, 1)))) to EffectKind.ACTIVE,
            "class profile" to feat(bare.copy(classProfile = fighterProfile())) to EffectKind.ACTIVE,
            "power with a grant" to entry(EntryCategory.POWER, bare.copy(powerProfile = profile,
                grants = listOf(Grant.Proficiency("g", Skill.NATURE)))) to EffectKind.ACTIVE,
        )
        for ((named, expected) in cases) {
            assertEquals(expected, EffectProfile.of(named.second).kind, named.first)
        }
    }

    @Test fun suppliedFactsFollowEachMechanic() {
        val cases = listOf(
            "bare" to feat(bare) to setOf(),
            "power profile" to entry(EntryCategory.POWER, bare.copy(powerProfile = profile)) to
                setOf(SuppliedFact.POWER_PROFILE),
            "feat profile is not a selected power" to feat(bare.copy(powerProfile = profile)) to setOf(),
            "entry grant" to feat(bare.copy(grants = listOf(Grant.Entry("g", "child")))) to setOf(SuppliedFact.ENTRIES),
            "progression" to feat(bare.copy(progression = listOf(ClassProgression(2)))) to setOf(SuppliedFact.ENTRIES),
            "entry choice" to feat(bare.copy(choices = listOf(ChoiceDefinition.Entries("c", 1, listOf("a"))))) to
                setOf(SuppliedFact.ENTRIES),
            "class profile" to feat(bare.copy(classProfile = fighterProfile())) to setOf(SuppliedFact.ENTRIES),
            "value choice" to feat(bare.copy(choices = listOf(ChoiceDefinition.Values("v", 1, FactKind.LANGUAGE,
                listOf(ValueOption("elven", "Elven")))))) to setOf(SuppliedFact.FACTS),
            "facts" to feat(bare.copy(facts = listOf(FactGrant(FactKind.LANGUAGE, listOf("elven"))))) to setOf(SuppliedFact.FACTS),
            "proficiency" to feat(bare.copy(grants = listOf(Grant.Proficiency("g", Skill.NATURE)))) to
                setOf(SuppliedFact.PROFICIENCIES),
            "ability points" to feat(bare.copy(modifiers = listOf(TypedModifier(ModifierTarget(Statistic.ABILITY_POINTS,
                ability = Ability.WISDOM), ModifierOperation.ADD, 1)))) to setOf(SuppliedFact.ABILITY_POINTS),
            "equipment" to feat(bare.copy(equipmentProficiencies = listOf("scale"))) to
                setOf(SuppliedFact.EQUIPMENT_PROFICIENCY),
            "multiclass" to feat(bare.copy(multiclassFor = "wizard")) to setOf(SuppliedFact.CLASS_ACCESS),
            "size" to feat(bare.copy(size = CreatureSize.SMALL)) to setOf(SuppliedFact.SIZE),
            "pool rules" to feat(bare.copy(selectionModifiers = listOf(SelectionModifier("c", 1)))) to
                setOf(SuppliedFact.POOL_RULES),
        )
        for ((named, expected) in cases) {
            assertEquals(expected + SuppliedFact.IDENTITY, EffectProfile.of(named.second).supplies, named.first)
        }
    }

    @Test fun requirementLeavesAreAffectedOnlyByMatchingSupplies() {
        val passive = feat(bare)
        val power = entry(EntryCategory.POWER, bare.copy(powerProfile = profile))
        val proficiency = feat(bare.copy(grants = listOf(Grant.Proficiency("g", Skill.NATURE))))
        val cascading = feat(bare.copy(grants = listOf(Grant.Entry("g", "child"))))
        val multiclass = feat(bare.copy(multiclassFor = "wizard"))
        val selectedFeat = Prerequisite.Selected(EntryCategory.FEAT, SelectedFilters(multiclass = true, classSpecific = true))
        val selectedPower = Prerequisite.Selected(EntryCategory.POWER, SelectedFilters(usage = "ENCOUNTER", hasLevel = true))
        val cases = listOf(
            Triple(passive, Prerequisite.Level(11), null) to false,
            Triple(passive, Prerequisite.Entry("subject"), null) to true,
            Triple(passive, Prerequisite.Entry("other"), EntryCategory.FEAT) to false,
            Triple(cascading, Prerequisite.Entry("other"), EntryCategory.FEAT) to true,
            Triple(cascading, Prerequisite.Entry("other"), null) to true,
            Triple(cascading, Prerequisite.Entry("fighter"), EntryCategory.CLASS) to true,
            Triple(multiclass, Prerequisite.Entry("wizard"), EntryCategory.CLASS) to true,
            Triple(multiclass, Prerequisite.Entry("fighter"), EntryCategory.CLASS) to false,
            Triple(multiclass, selectedFeat, null) to true,
            Triple(multiclass, Prerequisite.ClassPowerSource("ARCANE"), null) to true,
            Triple(passive, selectedFeat, null) to false,
            Triple(power, selectedPower, null) to true,
            Triple(passive, selectedPower, null) to false,
            Triple(proficiency, Prerequisite.Proficiency(Skill.NATURE), null) to true,
            Triple(proficiency, Prerequisite.Proficiency(Skill.ARCANA), null) to false,
            Triple(cascading, Prerequisite.Proficiency(Skill.ARCANA), null) to true,
            Triple(feat(bare.copy(equipmentProficiencies = listOf("scale"))),
                Prerequisite.EquipmentProficiency("chain"), null) to false,
            Triple(feat(bare.copy(size = CreatureSize.SMALL)), Prerequisite.Size(CreatureSize.SMALL), null) to true,
            Triple(passive, Prerequisite.AnyOf(listOf(Prerequisite.Level(1))), null) to true,
        )
        for ((case, expected) in cases) {
            val (subject, leaf, category) = case
            assertEquals(expected, EffectProfile.of(subject).canAffect(leaf, category), "$leaf from ${subject.mechanics}")
        }
    }

    private fun fighterProfile() = ClassProfile("DEFENDER", listOf("MARTIAL"), listOf(Ability.STRENGTH), emptyList(),
        listOf("armor", "shields", "weapons", "implements").associateWith { emptyList() },
        listOf(Statistic.FORTITUDE, Statistic.REFLEX, Statistic.WILL, Statistic.HIT_POINTS, Statistic.HEALING_SURGES)
            .associateWith { ClassFormula(10) })
}
