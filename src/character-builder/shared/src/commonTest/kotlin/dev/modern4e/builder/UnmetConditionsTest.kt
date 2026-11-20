package dev.modern4e.builder

import kotlin.test.*

/** Eligibility carries typed unmet conditions beside its presentation diagnostics, on JVM and JavaScript. */
class UnmetConditionsTest {
    private val mainSlot = ChoiceSlotId("fighter", "main", 0)
    private val featSlot = ChoiceSlotId("creation", "feat", 0)
    private fun entry(id: String, category: EntryCategory = EntryCategory.FEAT, mechanics: Mechanics = Mechanics()) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))
    private fun resolved(entry: ContentEntry) = ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry))
    private fun choice(entry: ContentEntry, instance: String = entry.id, slot: ChoiceSlotId = featSlot) =
        EntryChoice(instance, slot, SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry)))
    private val fighter = entry("fighter", EntryCategory.CLASS,
        Mechanics(choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH)))))
    private fun character(vararg additions: EntryChoice) = CharacterDocument(
        id = "unmet", savedAt = "2026-11-20T12:00:00Z", identity = CharacterIdentity("Unmet"), packages = emptyList(), level = 1,
        abilities = AbilityAllocation(mainSlot, Ability.STRENGTH, mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2,
            Ability.CONSTITUTION to 2, Ability.INTELLIGENCE to 1)),
        levels = listOf(LevelDecisions(1, entries = listOf(choice(fighter, slot = ChoiceSlotId("creation", "class", 0))) + additions,
            proficiencies = listOf(ProficiencyChoice(ChoiceSlotId("background.environment.urban", "skill", 0), Skill.SOCIETY),
                ProficiencyChoice(ChoiceSlotId("background.upbringing.labor", "skill", 0), Skill.CRAFTING),
                ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 0), Skill.MEDICINE),
                ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 1), Skill.RELIGION)))),
    )
    private fun evaluate(document: CharacterDocument, vararg definitions: ContentEntry): EngineResult {
        val all = (listOf(fighter) + definitions).associateBy { it.id }
        return RulesEngine.evaluate(document, RulesContent(all.mapValues { ContractResult.Available(resolved(it.value)) },
            document.levels.flatMap { it.entries }.associate { it.selection to ContractResult.Available(resolved(all.getValue(it.selection.entryId))) }))
    }

    /** The selected feat's typed conditions, checked against the diagnostic code that still presents each one. */
    private fun unmet(prerequisite: Prerequisite, code: String, vararg others: ContentEntry): List<UnmetCondition> {
        val feat = entry("feat", mechanics = Mechanics(prerequisites = listOf(prerequisite)))
        val result = evaluate(character(choice(feat)), feat, *others)
        assertTrue(result.diagnostics.any { it.code == code && it.entryId == "feat" }, "$code remains the presentation")
        return result.entryEligibility.getValue("feat").unmet
    }

    @Test fun provenFailuresCarryTheirLeafAndSatisfiedAlternativesHideFailedSiblings() {
        val available = entry("available")
        val required = Prerequisite.Entry("available")
        assertEquals(listOf(UnmetCondition.Failed(required)), unmet(required, "engine.prerequisite", available))
        val athletics = Prerequisite.Proficiency(Skill.ATHLETICS)
        val satisfied = entry("feat", mechanics = Mechanics(prerequisites = listOf(
            Prerequisite.AnyOf(listOf(required, Prerequisite.Proficiency(Skill.MEDICINE))))))
        val eligible = evaluate(character(choice(satisfied)), satisfied, available).entryEligibility.getValue("feat")
        assertEquals(Eligibility.ELIGIBLE, eligible.status)
        assertTrue(eligible.unmet.isEmpty())
        assertEquals(listOf(UnmetCondition.Failed(required), UnmetCondition.Failed(athletics)),
            unmet(Prerequisite.AnyOf(listOf(required, athletics)), "engine.prerequisite", available))
    }

    @Test fun campaignUnresolvedAndUnadaptedConditionsKeepTheirAuthoredLeaf() {
        val unavailable = Prerequisite.Unavailable("Revenant", "Not in this campaign")
        // A campaign exclusion is also a proven failure, exactly as its two diagnostics report it.
        assertEquals(listOf(UnmetCondition.Unavailable(unavailable), UnmetCondition.Failed(unavailable)),
            unmet(unavailable, "engine.unavailableCondition"))
        val unresolved = Prerequisite.Unresolved("Patron", "Needs GM approval")
        assertEquals(listOf(UnmetCondition.Unresolved(unresolved)), unmet(unresolved, "engine.unresolvedCondition"))
        val unadapted = Prerequisite.Unadapted("Str 15")
        assertEquals(listOf(UnmetCondition.Unadapted(unadapted)), unmet(unadapted, "engine.unadaptedPrerequisite"))
    }

    @Test fun everyUncheckedCauseIsTyped() {
        fun unchecked(reason: UncheckedReason) = listOf(UnmetCondition.Unchecked(reason))
        assertEquals(unchecked(UncheckedReason.DEFINITIONS_UNAVAILABLE),
            unmet(Prerequisite.Entry("missing"), "engine.prerequisiteUnavailable"))
        assertEquals(unchecked(UncheckedReason.CLASS_FACTS_UNAVAILABLE),
            unmet(Prerequisite.ClassPowerSource("MARTIAL"), "engine.classFactsUnavailable"))
        assertEquals(unchecked(UncheckedReason.SIZE_FACTS_UNAVAILABLE),
            unmet(Prerequisite.Size(CreatureSize.MEDIUM), "engine.sizeFactsUnavailable"))

        val self = entry("feat", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Proficiency(Skill.ATHLETICS)),
            grants = listOf(Grant.Proficiency("athletics", Skill.ATHLETICS))))
        val dependent = evaluate(character(choice(self)), self)
        assertTrue(dependent.diagnostics.any { it.code == "engine.prerequisiteDependency" })
        assertEquals(unchecked(UncheckedReason.DEPENDENCY), dependent.entryEligibility.getValue("feat").unmet)

        val bare = entry("bare", EntryCategory.POWER)
        val picker = entry("picker", mechanics = Mechanics(choices = listOf(ChoiceDefinition.Entries("power", 1, listOf(bare.id)))))
        val theme = entry("theme", EntryCategory.THEME, Mechanics(prerequisites = listOf(Prerequisite.Selected(EntryCategory.POWER,
            SelectedFilters(usage = "ENCOUNTER", hasLevel = true)))))
        val selected = evaluate(character(choice(picker), choice(bare, slot = ChoiceSlotId("picker", "power", 0)),
            choice(theme, slot = ChoiceSlotId("creation", "theme", 0))), picker, bare, theme)
        assertTrue(selected.diagnostics.any { it.code == "engine.selectedFactsUnavailable" })
        assertEquals(unchecked(UncheckedReason.SELECTED_FACTS_UNAVAILABLE), selected.entryEligibility.getValue("theme").unmet)
    }

    @Test fun selectionTimeSnapshotsAndThePassiveFeatFastPathReportTheSameConditions() {
        val athletics = Prerequisite.Proficiency(Skill.ATHLETICS)
        val modern = entry("feat", mechanics = Mechanics(version = 2, prerequisites = listOf(athletics)))
        assertEquals(listOf(UnmetCondition.Failed(athletics)),
            evaluate(character(choice(modern)), modern).entryEligibility.getValue("feat").unmet)

        val document = character().copy(level = 2, levels = character().levels + LevelDecisions(2))
        val laterSlot = ChoiceSlotId("advancement.2", "feat", 0)
        val late = Prerequisite.Level(3)
        for ((prerequisite, expected) in listOf(late to UnmetCondition.Failed(late),
            Prerequisite.Entry("missing") to UnmetCondition.Unchecked(UncheckedReason.DEFINITIONS_UNAVAILABLE))) {
            val passive = resolved(entry("passive", mechanics = Mechanics(version = 2, prerequisites = listOf(prerequisite))))
            val saved = SavedSelection(passive.entry.id, passive.entry.presentation.title, "standard", passive.fingerprint)
            val content = RulesContent(mapOf(fighter.id to ContractResult.Available(resolved(fighter))), (document.levels.flatMap { it.entries }
                .associate { it.selection to ContractResult.Available(resolved(fighter)) } + (saved to ContractResult.Available(passive))))
            val fast = assertNotNull(RulesEngine.prepareFeatChoices(document, 2, laterSlot).check(passive, content, "candidate"))
            assertEquals(listOf(expected), fast.eligibility.unmet)
        }
    }
}
