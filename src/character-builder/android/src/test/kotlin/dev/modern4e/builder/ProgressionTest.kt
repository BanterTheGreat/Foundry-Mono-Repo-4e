package dev.modern4e.builder

import org.junit.Assert.*
import org.junit.Test

class ProgressionTest {
    @Test fun ancestryLanguagesUseAncestryLabelAndFeatLanguagesKeepTheirNumber() {
        assertEquals("Ancestry Language",
            Progression.valueChoiceLabel(FactKind.LANGUAGE, 0, "Human", EntryCategory.ANCESTRY))
        assertEquals("Linguist: language 2",
            Progression.valueChoiceLabel(FactKind.LANGUAGE, 1, "Linguist", EntryCategory.FEAT))
    }

    @Test fun directAncestryLanguagesAreAvailableForTheLevelZeroSection() {
        val ancestry = entry("ancestry", EntryCategory.ANCESTRY, Mechanics(choices = listOf(
            ChoiceDefinition.Values("language", 1, FactKind.LANGUAGE, listOf(ValueOption("ELVEN", "Elven"))),
            ChoiceDefinition.Values("damage", 1, FactKind.DAMAGE_TYPE, listOf(ValueOption("FIRE", "Fire"))),
        )))
        val feat = entry("feat", EntryCategory.FEAT, Mechanics(choices = listOf(
            ChoiceDefinition.Values("language", 1, FactKind.LANGUAGE, listOf(ValueOption("GIANT", "Giant"))),
        )))
        val bonusLanguage = ChoiceSlotId(ancestry.id, "language", 0)
        val state = evaluated(level = 1, selections = listOf(
            entryChoice(ancestry, ChoiceSlotId("creation", "ancestry", 0)),
            entryChoice(feat, ChoiceSlotId("creation", "feat", 0)),
        ), definitions = listOf(ancestry, feat), values = listOf(ValueChoice(bonusLanguage, "ELVEN")))

        val choices = Progression.ancestryLanguageChoices(state)
        assertEquals(listOf(bonusLanguage), choices.map { it.slot })
        assertTrue(state.rules.facts.any { it.kind == FactKind.LANGUAGE && it.value == "ELVEN" && it.source == bonusLanguage })
        assertTrue(Progression.levelChoices(state, 1).containsAll(choices))
        val otherSlots = Progression.levelChoices(state, 1).filterNot { it in choices }.map { it.slot }.toSet()
        assertTrue(ChoiceSlotId(ancestry.id, "damage", 0) in otherSlots)
        assertTrue(ChoiceSlotId(feat.id, "language", 0) in otherSlots)
    }

    @Test fun onlyStartingAncestryPowerChoicesMoveIntoCreation() {
        val power = entry("ancestry-power", EntryCategory.POWER)
        val feature = entry("ancestry-feature", EntryCategory.FEATURE)
        val trait = entry("ancestry-trait", EntryCategory.FEATURE, Mechanics(choices = listOf(
            ChoiceDefinition.Entries("power", 1, listOf(power.id)),
            ChoiceDefinition.Entries("feature", 1, listOf(feature.id)),
            ChoiceDefinition.Entries("later", 1, listOf(power.id), atLevel = 2),
        )))
        val ancestry = entry("ancestry", EntryCategory.ANCESTRY,
            Mechanics(grants = listOf(Grant.Entry("trait", trait.id))))
        val state = evaluated(2, listOf(entryChoice(ancestry, ChoiceSlotId("creation", "ancestry", 0))),
            listOf(ancestry, trait, power, feature))

        val choice = Progression.ancestryPowerChoices(state, setOf(power.id)).single()
        val traitInstance = state.rules.entries.single { it.definition.entry.id == trait.id }.instanceId
        assertEquals(ChoiceSlotId(traitInstance, "power", 0), choice.slot)
    }

    @Test fun automaticGrantsUseAcquisitionLevelAndExcludeEditableChoiceBranches() {
        val classFeature = entry("class-feature", EntryCategory.FEATURE)
        val classPower = entry("class-power", EntryCategory.POWER)
        val classSubstitute = entry("class-substitute", EntryCategory.FEATURE)
        val nestedPower = entry("nested-power", EntryCategory.POWER)
        val chosenFeature = entry("chosen-feature", EntryCategory.FEATURE,
            Mechanics(grants = listOf(Grant.Entry("nested", nestedPower.id))))
        val fighter = entry("fighter", EntryCategory.CLASS, Mechanics(
            grants = listOf(Grant.Entry("always", classFeature.id), Grant.Entry("power", classPower.id),
                Grant.Entry("editable", classSubstitute.id, replacementEntryIds = listOf(chosenFeature.id))),
            choices = listOf(ChoiceDefinition.Entries("feature", 1, listOf(chosenFeature.id))),
        ))
        val themeFeature = entry("theme-feature", EntryCategory.FEATURE)
        val themePower = entry("theme-power", EntryCategory.POWER)
        val laterFeature = entry("later-feature", EntryCategory.FEATURE)
        val laterPower = entry("later-power", EntryCategory.POWER)
        val theme = entry("theme", EntryCategory.THEME, Mechanics(
            grants = listOf(Grant.Entry("feature", themeFeature.id), Grant.Entry("power", themePower.id)),
            progression = listOf(ClassProgression(5, grants = listOf(Grant.Entry("later", laterFeature.id), Grant.Entry("later-power", laterPower.id)))),
        ))
        val replacement = entry("replacement", EntryCategory.THEME)
        val definitions = listOf(fighter, classFeature, classPower, classSubstitute, nestedPower, chosenFeature,
            theme, themeFeature, themePower, laterFeature, laterPower, replacement)
        val classSelections = listOf(entryChoice(fighter, ChoiceSlotId("creation", "class", 0)),
            entryChoice(chosenFeature, ChoiceSlotId(fighter.id, "feature", 0)))
        val themeSlot = ChoiceSlotId("creation", "theme", 0)
        val selections = classSelections + entryChoice(theme, themeSlot)
        fun grants(level: Int, choices: List<EntryChoice> = selections) =
            Progression.automaticGrants(evaluated(level, choices, definitions)).associate { it.entry.id to (it.level to it.label) }

        val classGrants = mapOf(classFeature.id to (0 to "Class Feature"), classPower.id to (0 to "Class Power"))
        val initial = classGrants + mapOf(themeFeature.id to (1 to "Theme Feature"), themePower.id to (0 to "Theme Power"))
        assertEquals(initial, grants(1))
        assertEquals(initial + mapOf(laterFeature.id to (5 to "Theme Feature"), laterPower.id to (5 to "Theme Power")), grants(5))
        assertEquals(classGrants, grants(5, classSelections + entryChoice(replacement, themeSlot)))
    }

    @Test fun startingAncestryGrantsAppearAtLevelZeroAndLaterGrantsKeepTheirLevel() {
        val power = entry("ancestry-power", EntryCategory.POWER)
        val feature = entry("ancestry-feature", EntryCategory.FEATURE,
            Mechanics(grants = listOf(Grant.Entry("power", power.id))))
        val later = entry("later", EntryCategory.FEATURE)
        val ancestry = entry("ancestry", EntryCategory.ANCESTRY, Mechanics(grants = listOf(
            Grant.Entry("feature", feature.id), Grant.Entry("later", later.id, atLevel = 2),
        )))
        val selected = entryChoice(ancestry, ChoiceSlotId("creation", "ancestry", 0))
        val definitions = listOf(ancestry, feature, power, later)
        val state = evaluated(level = 2, selections = listOf(selected), definitions = definitions)
        assertEquals(mapOf(feature.id to (0 to "Ancestry Feature"), power.id to (0 to "Ancestry Power"),
            later.id to (2 to "Ancestry Feature")),
            Progression.automaticGrants(state).associate { it.entry.id to (it.level to it.label) })
        assertTrue(Progression.automaticGrants(evaluated(2, emptyList(), definitions)).isEmpty())
    }

    @Test fun grantDisplayHidesIntroAndSummaryCardsButKeepsOwnedChoicesAndGrantedPowers() {
        val option = entry("option", EntryCategory.FEATURE)
        val choice = ChoiceDefinition.Entries("style", 1, listOf(option.id))
        val introduction = entry("introduction", EntryCategory.FEATURE, Mechanics(choices = listOf(choice))).copy(
            presentation = Presentation("Introduction", "Choose a style.", grantDisplay = GrantDisplay.CHOICE_INTRODUCTION),
        )
        val standalone = entry("standalone", EntryCategory.FEATURE, Mechanics(choices = listOf(choice)))
        val classEntry = entry("class", EntryCategory.CLASS, Mechanics(grants = listOf(
            Grant.Entry("introduction", introduction.id), Grant.Entry("standalone", standalone.id),
        )))
        val childPower = entry("child-power", EntryCategory.POWER)
        val independentPower = entry("independent-power", EntryCategory.POWER)
        val summary = entry("summary", EntryCategory.FEATURE, Mechanics(grants = listOf(
            Grant.Entry("child-power", childPower.id),
        ))).copy(presentation = Presentation("Summary", grantDisplay = GrantDisplay.GRANT_SUMMARY))
        val theme = entry("theme", EntryCategory.THEME, Mechanics(grants = listOf(
            Grant.Entry("summary", summary.id), Grant.Entry("independent-power", independentPower.id),
        )))
        val state = evaluated(
            level = 1,
            selections = listOf(
                entryChoice(classEntry, ChoiceSlotId("creation", "class", 0)),
                entryChoice(theme, ChoiceSlotId("creation", "theme", 0)),
            ),
            definitions = listOf(option, introduction, standalone, classEntry, childPower, independentPower, summary, theme),
        )

        val cards = Progression.automaticGrants(state).associate { it.entry.id to it.label }
        assertEquals(mapOf(
            standalone.id to "Class Feature", childPower.id to "Theme Power", independentPower.id to "Theme Power",
        ), cards)
        val choices = Progression.levelChoices(state, 1)
        val introOwner = state.rules.entries.single { it.definition.entry.id == introduction.id }
        val standaloneOwner = state.rules.entries.single { it.definition.entry.id == standalone.id }
        val introSlot = choices.single { it.slot.sourceInstanceId == introOwner.instanceId }.slot
        val standaloneSlot = choices.single { it.slot.sourceInstanceId == standaloneOwner.instanceId }.slot
        assertEquals("Choose a style.", Progression.choiceIntroduction(state, introSlot))
        assertNull(Progression.choiceIntroduction(state, standaloneSlot))
        assertNull(Progression.choiceIntroduction(state, introSlot.copy(choiceId = "unowned")))
    }

    @Test fun spellSourceAndPactIntroductionsStopBeforeChoiceInstructions() {
        val examples = mapOf(
            "modern4e.choice.sorcerer-spell-source" to "Choose either Dragon Magic or Wild Magic.",
            "modern4e.choice.warlock-eldritch-pact" to "Choose one pact. The options include Fey Pact.",
        )
        val option = entry("option", EntryCategory.FEATURE)
        for ((choiceId, instructions) in examples) {
            val choice = ChoiceDefinition.Entries(choiceId, 1, listOf(option.id))
            val introduction = entry("introduction", EntryCategory.FEATURE, Mechanics(choices = listOf(choice))).copy(
                presentation = Presentation(
                    "Introduction", "You gain arcane powers. $instructions", grantDisplay = GrantDisplay.CHOICE_INTRODUCTION,
                ),
            )
            val classEntry = entry("class", EntryCategory.CLASS, Mechanics(grants = listOf(
                Grant.Entry("introduction", introduction.id),
            )))
            val state = evaluated(
                level = 1,
                selections = listOf(entryChoice(classEntry, ChoiceSlotId("creation", "class", 0))),
                definitions = listOf(classEntry, introduction, option),
            )
            val slot = Progression.levelChoices(state, 1).single { it.slot.choiceId == choiceId }.slot
            assertEquals("You gain arcane powers.", Progression.choiceIntroduction(state, slot))
        }
    }

    @Test fun scheduleMatchesPrintedMilestones() {
        assertEquals(mapOf("At-will" to 2, "Encounter" to 1, "Daily" to 2), Progression.tally(1))
        assertEquals(mapOf("At-will" to 2, "Encounter" to 6, "Daily" to 4, "Utility" to 5), Progression.tally(20))
        assertEquals(mapOf("At-will" to 2, "Encounter" to 7, "Daily" to 4, "Utility" to 7), Progression.tally(30))
        assertEquals(19, (1..30).count { Progression.level(it).feat })
        assertEquals(listOf(9, 15, 19, 23, 25, 29), (1..30).filter { Progression.level(it).replacement != null })
    }

    @Test fun levelOneMovesEveryPowerSlotInOrderAndLeavesOtherChoicesInRows() {
        fun choice(id: String, ordinal: Int, vararg options: String) = EngineChoice(
            ChoiceSlotId("fighter", id, ordinal),
            entries = options.map { EntryEligibility(it, Eligibility.ELIGIBLE, emptyList()) },
        )
        val atWill = choice("at-will", 0, "cleave")
        val secondAtWill = choice("at-will", 1, "cleave")
        val encounter = choice("encounter", 0, "passing-attack")
        val daily = choice("daily", 0, "brute-strike")
        val secondDaily = choice("daily", 1, "brute-strike")
        val feature = choice("feature", 0, "combat-superiority")
        val mixed = choice("mixed", 0, "cleave", "combat-superiority")
        val empty = choice("empty", 0)
        val slots = listOf(atWill, feature, secondAtWill, encounter, mixed, daily, secondDaily, empty)
        val powerIds = setOf("cleave", "passing-attack", "brute-strike")

        assertEquals(
            listOf(atWill, secondAtWill, encounter, daily, secondDaily) to listOf(feature, mixed, empty),
            Progression.partitionLevelChoices(1, slots, powerIds),
        )
        assertEquals(emptyList<EngineChoice>() to slots, Progression.partitionLevelChoices(2, slots, powerIds))
    }

    @Test fun onlyCurrentMissingRequiredOrIllegalSavedChoicesNeedAttention() {
        assertTrue(Progression.choiceNeedsAttention(reached = true, optional = false, filled = false, invalid = false))
        assertTrue(Progression.choiceNeedsAttention(reached = true, optional = true, filled = true, invalid = true))
        assertFalse(Progression.choiceNeedsAttention(reached = true, optional = true, filled = false, invalid = false))
        assertFalse(Progression.choiceNeedsAttention(reached = true, optional = false, filled = true, invalid = false))
        assertFalse(Progression.choiceNeedsAttention(reached = false, optional = false, filled = false, invalid = false))
    }

    @Test fun invalidChoiceSlotsUseScopedRulesFailuresAndDuplicateSkills() {
        val power = ChoiceSlotId("fighter", "power", 0)
        val skill = ChoiceSlotId("creation", "free-skill", 0)
        val unimplemented = ChoiceSlotId("advancement.3", "power", 0)
        val rules = EngineResult(emptyMap(), emptyList(), emptyList(), emptyMap(), emptyMap(), listOf(
            Diagnostic("engine.choiceOption", DiagnosticKind.INVALID_SELECTION, "Illegal power", power),
            Diagnostic("engine.duplicateProficiency", DiagnosticKind.INCOMPLETE_AUTOMATION, "Duplicate skill", skill),
            Diagnostic("engine.replacementTiming", DiagnosticKind.INCOMPLETE_AUTOMATION, "Unverified timing", unimplemented),
        ))

        assertEquals(setOf(power, skill), Progression.invalidChoiceSlots(rules))
    }

    @Test fun allocationRequiresBudgetAndSingleTradeoff() {
        val base = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.WISDOM to 1))
        assertTrue(Progression.validAllocation(base))
        assertTrue(Progression.validAllocation(base.copy(points = base.points + (Ability.CHARISMA to -1) + (Ability.DEXTERITY to 3))))
        assertFalse(Progression.validAllocation(base.copy(points = base.points + (Ability.DEXTERITY to 3))))
        assertFalse(Progression.validAllocation(base.copy(points = base.points + (Ability.STRENGTH to 3))))
    }
    @Test fun switchingMainAfterEditingKeepsACompleteTradeoffSaveable() {
        val initial = AbilityAllocation(
            ChoiceSlotId("cleric", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.WISDOM to 2, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 1),
        )
        val switched = Progression.changeMainAbility(initial, Ability.WISDOM)
        assertTrue(Progression.canAdjustAbility(switched, Ability.CHARISMA, -1))
        val lowered = switched.copy(points = switched.points + (Ability.CHARISMA to -1))
        assertTrue(Progression.canAdjustAbility(lowered, Ability.CONSTITUTION, 1))
        val edited = lowered.copy(points = lowered.points + (Ability.CONSTITUTION to 2))

        val switchedBack = Progression.changeMainAbility(edited, Ability.STRENGTH)
        assertEquals(0, Progression.remainingPoints(switchedBack))
        assertTrue(Progression.validAllocation(switchedBack))
    }

    @Test fun allocationCounterExcludesFixedMainAndSupportsTradeoffs() {
        val base = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4))
        assertEquals(5, Progression.remainingPoints(base))
        assertEquals(0, Progression.remainingPoints(base.copy(points = base.points +
            mapOf(Ability.DEXTERITY to 3, Ability.CONSTITUTION to 2, Ability.WISDOM to 1, Ability.CHARISMA to -1))))
        assertEquals(-1, Progression.remainingPoints(base.copy(points = base.points +
            mapOf(Ability.DEXTERITY to 3, Ability.CONSTITUTION to 3))))
        assertEquals(6, Progression.remainingPoints(base.copy(points = base.points + (Ability.CHARISMA to -1))))
    }

    @Test fun skillLabelsAreCompactAndKeepOtherSources() {
        Ability.entries.forEach { ability ->
            assertEquals(ability.name.readable(), Progression.skillContributorLabel("${ability.name} points"))
        }
        assertNull(Progression.skillContributorLabel("Proficiency"))
        assertEquals("Manual Adjustment", Progression.skillContributorLabel("Manual Adjustment"))
    }
    @Test fun steppersEnforceSinglePairedTradeoff() {
        val base = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH,
            mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2))
        assertFalse(Progression.canAdjustAbility(base, Ability.DEXTERITY, 1))
        assertTrue(Progression.canAdjustAbility(base, Ability.CHARISMA, -1))
        val negative = base.copy(points = base.points + (Ability.CHARISMA to -1))
        assertFalse(Progression.canAdjustAbility(negative, Ability.WISDOM, -1))
        assertTrue(Progression.canAdjustAbility(negative, Ability.DEXTERITY, 1))
        val paired = negative.copy(points = negative.points + (Ability.DEXTERITY to 3))
        assertFalse(Progression.canAdjustAbility(paired, Ability.CONSTITUTION, 1))
        assertFalse(Progression.canAdjustAbility(paired, Ability.CHARISMA, 1))
        assertTrue(Progression.canAdjustAbility(paired, Ability.DEXTERITY, -1))
        assertTrue(Progression.canAdjustAbility(negative, Ability.CHARISMA, 1))
        assertFalse(Progression.canAdjustAbility(paired, Ability.DEXTERITY, 1))
        assertFalse(Progression.canAdjustAbility(negative, Ability.CHARISMA, -1))
        assertFalse(Progression.canAdjustAbility(base, Ability.STRENGTH, -1))
        assertFalse(Progression.canAdjustAbility(base, Ability.STRENGTH, 1))
        assertTrue(Progression.canAdjustAbility(base, Ability.WISDOM, 1))
    }
    @Test fun filledStructuredChoicesReduceRequiredBadgeAndOptionalGrantsDoNotAddRequirements() {
        val slot = ChoiceSlotId("linguist", "language", 0)
        val optional = ChoiceSlotId("feature", "technique", 0)
        val doc = CharacterDocument(id = "badge", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Badge"),
            packages = emptyList(), level = 1, abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.WISDOM to 1)),
            levels = listOf(LevelDecisions(1)))
        val rules = EngineResult(emptyMap(), emptyList(), listOf(EngineChoice(slot, values = listOf(ValueOption("ELVEN", "Elven")), valueKind = FactKind.LANGUAGE)),
            emptyMap(), emptyMap(), emptyList())
        val missing = Progression.missing(BuilderState(doc, rules))
        val filled = doc.copy(levels = listOf(LevelDecisions(1, values = listOf(ValueChoice(slot, "ELVEN")))))
        assertEquals(missing - 1, Progression.missing(BuilderState(filled, rules)))
        assertEquals(missing - 1, Progression.missing(BuilderState(filled, rules.copy(choices = rules.choices + EngineChoice(optional, optional = true)))))
    }

    @Test fun completingRequiredLevelOneChoicesClearsTheBadgeOnlyAfterChoosingATheme() {
        val origins = listOf("ancestry", "class", "feat").map { kind ->
            EntryChoice(kind, ChoiceSlotId("creation", kind, 0), SavedSelection(kind, kind, "proof", "fingerprint"))
        }
        val doc = CharacterDocument(
            id = "badge", savedAt = "2026-11-18T12:00:00Z",
            identity = CharacterIdentity("Badge", environment = "urban", upbringing = "academic"),
            packages = emptyList(), level = 1,
            abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.WISDOM to 1)),
            levels = listOf(LevelDecisions(1, entries = origins)),
        )
        val rules = EngineResult(emptyMap(), emptyList(), emptyList(), emptyMap(), emptyMap(), emptyList())
        assertEquals(1, Progression.missing(BuilderState(doc, rules)))
        val theme = entryChoice(entry("theme", EntryCategory.THEME), ChoiceSlotId("creation", "theme", 0))
        val complete = BuilderState(doc.copy(levels = listOf(LevelDecisions(1, entries = origins + theme))), rules)
        assertEquals(0, Progression.missing(complete))
        assertEquals(1, Progression.missing(complete.copy(document = complete.document.copy(identity = doc.identity.copy(environment = "")))))
    }

    private fun entry(id: String, category: EntryCategory, mechanics: Mechanics = Mechanics()) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))

    private fun entryChoice(entry: ContentEntry, slot: ChoiceSlotId) =
        EntryChoice(entry.id, slot, SavedSelection(entry.id, entry.presentation.title, "proof", ContractCodec.fingerprint(entry)))

    private fun evaluated(
        level: Int,
        selections: List<EntryChoice>,
        definitions: List<ContentEntry>,
        values: List<ValueChoice> = emptyList(),
    ): BuilderState {
        val entries = definitions.associate { entry ->
            entry.id to ContractResult.Available(ResolvedEntry(entry, PackageRevision("proof", "1"), ContractCodec.fingerprint(entry)))
        }
        val content = RulesContent(entries, selections.associate { it.selection to entries.getValue(it.selection.entryId) })
        val document = CharacterDocument(
            id = "progression", savedAt = "2026-11-19T00:00:00Z", identity = CharacterIdentity("Progression"),
            packages = emptyList(), level = level,
            abilities = AbilityAllocation(ChoiceSlotId("fighter", "main", 0), Ability.STRENGTH, emptyMap()),
            levels = listOf(LevelDecisions(1, entries = selections, values = values)),
        )
        return BuilderState(document, RulesEngine.evaluate(document, content))
    }
}
