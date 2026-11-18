package dev.modern4e.builder

import kotlin.test.*

/** Prerequisites use explicit acquisition facts, never titles or prose. */
class StructuredPrerequisiteTest {
    private val multiclass = Prerequisite.Selected(EntryCategory.FEAT, SelectedFilters(multiclass = true, classSpecific = true))
    private val encounter = Prerequisite.Selected(EntryCategory.POWER, SelectedFilters(usage = "ENCOUNTER", hasLevel = true))
    private fun entry(id: String, category: EntryCategory, mechanics: Mechanics = Mechanics(version = 2)) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))
    private fun slot(source: String, choice: String) = ChoiceSlotId(source, choice, 0)
    private fun saved(entry: ContentEntry) = SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry))
    private fun selected(entry: ContentEntry, instance: String, source: String, choice: String) =
        EntryChoice(instance, slot(source, choice), saved(entry))
    private fun evaluate(requirement: Prerequisite, ancestry: ContentEntry? = null, earlier: ContentEntry? = null,
        power: ContentEntry? = null, candidateMechanics: Mechanics = Mechanics(version = 2), candidateAtOne: Boolean = false, powerAtTwo: Boolean = false): EngineResult {
        val fighter = entry("class", EntryCategory.CLASS, Mechanics(version = 2,
            choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH))) +
                if (power == null) emptyList() else listOf(ChoiceDefinition.Entries("power", 1, listOf(power.id), atLevel = if (powerAtTwo) 2 else 1))))
        val candidate = entry("candidate", EntryCategory.FEAT, candidateMechanics.copy(prerequisites = listOf(requirement)))
        val first = listOf(selected(fighter, "class", "creation", "class")) +
            listOfNotNull(ancestry?.let { selected(it, "ancestry", "creation", "ancestry") },
                earlier?.let { selected(it, "earlier", "creation", "feat") },
                power?.takeUnless { powerAtTwo }?.let { selected(it, "power", "class", "power") })
        val chosen = selected(candidate, "candidate", if (candidateAtOne) "creation" else "advancement.2", "feat")
        val document = CharacterDocument(id = "predicates", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Predicates"),
            packages = emptyList(), level = 2,
            abilities = AbilityAllocation(slot("class", "main"), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.CONSTITUTION to 2, Ability.DEXTERITY to 2, Ability.INTELLIGENCE to 1)),
            levels = listOf(LevelDecisions(1, first + if (candidateAtOne) listOf(chosen) else emptyList()),
                LevelDecisions(2, (if (candidateAtOne) emptyList() else listOf(chosen)) +
                    listOfNotNull(power?.takeIf { powerAtTwo }?.let { selected(it, "power", "class", "power") }))))
        val definitions = listOfNotNull(fighter, candidate, ancestry, earlier, power).associateBy { it.id }
        fun resolved(entry: ContentEntry) = ContractResult.Available(ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry)))
        return RulesEngine.evaluate(document, RulesContent(definitions.mapValues { resolved(it.value) },
            document.levels.flatMap { it.entries }.associate { it.selection to resolved(definitions.getValue(it.selection.entryId)) }))
    }

    @Test
    fun sizeUsesStructuredAncestryFactsAndKeepsMissingSizeIncomplete() {
        for (size in listOf(CreatureSize.SMALL, CreatureSize.NORMAL)) {
            val ancestry = entry("ancestry", EntryCategory.ANCESTRY, Mechanics(version = 2, size = size))
            assertEquals(if (size == CreatureSize.SMALL) Eligibility.ELIGIBLE else Eligibility.INELIGIBLE,
                evaluate(Prerequisite.Size(CreatureSize.SMALL), ancestry).entryEligibility.getValue("candidate").status)
        }
        val prose = entry("Small ancestry", EntryCategory.ANCESTRY)
        assertEquals(Eligibility.INCOMPLETE, evaluate(Prerequisite.Size(CreatureSize.SMALL), prose).entryEligibility.getValue("candidate").status)
        assertEquals(Eligibility.INCOMPLETE, evaluate(Prerequisite.Size(CreatureSize.SMALL)).entryEligibility.getValue("candidate").status)
    }

    @Test
    fun explicitClassSpecificMulticlassQualifiesButTitleAndCandidateBenefitDoNot() {
        val feat = entry("Student", EntryCategory.FEAT, Mechanics(version = 2, multiclassFor = "another-class"))
        assertEquals(Eligibility.ELIGIBLE, evaluate(multiclass, earlier = feat).entryEligibility.getValue("candidate").status)
        assertEquals(Eligibility.INELIGIBLE, evaluate(multiclass, earlier = entry("Multiclass", EntryCategory.FEAT))
            .entryEligibility.getValue("candidate").status)
        assertEquals(Eligibility.INELIGIBLE, evaluate(multiclass, candidateMechanics = Mechanics(version = 2, multiclassFor = "another-class"))
            .entryEligibility.getValue("candidate").status)
    }

    @Test
    fun selectedEncounterRequiresAnExplicitLeveledEncounterProfile() {
        for (usage in listOf("ENCOUNTER", "AT_WILL", "DAILY")) {
            val power = entry("power", EntryCategory.POWER, Mechanics(version = 2, powerProfile = PowerProfile(1, usage, "ATTACK")))
            assertEquals(if (usage == "ENCOUNTER") Eligibility.ELIGIBLE else Eligibility.INELIGIBLE,
                evaluate(encounter, power = power).entryEligibility.getValue("candidate").status)
        }
        assertEquals(Eligibility.INELIGIBLE, evaluate(encounter).entryEligibility.getValue("candidate").status)
        assertEquals(Eligibility.INCOMPLETE, evaluate(encounter, power = entry("Encounter 1", EntryCategory.POWER))
            .entryEligibility.getValue("candidate").status)
    }

    @Test
    fun laterEncounterSelectionCannotQualifyAnEarlierFeat() {
        val power = entry("power", EntryCategory.POWER, Mechanics(version = 2, powerProfile = PowerProfile(1, "ENCOUNTER", "ATTACK")))
        assertEquals(Eligibility.INELIGIBLE, evaluate(encounter, power = power, candidateAtOne = true, powerAtTwo = true)
            .entryEligibility.getValue("candidate").status)
    }

    @Test
    fun closedPredicatesRoundTripAndRejectUnreviewedQueries() {
        for (condition in listOf(multiclass, encounter, Prerequisite.Size(CreatureSize.SMALL))) {
            assertEquals(condition, ContractCodec.json.decodeFromString<Prerequisite>(
                ContractCodec.json.encodeToString(Prerequisite.serializer(), condition)))
        }
        assertFailsWith<IllegalArgumentException> { Prerequisite.Selected(EntryCategory.POWER, SelectedFilters(usage = "DAILY", hasLevel = true)) }
        assertFailsWith<IllegalArgumentException> { Prerequisite.Selected(EntryCategory.FEAT, SelectedFilters(multiclass = true)) }
    }
}
