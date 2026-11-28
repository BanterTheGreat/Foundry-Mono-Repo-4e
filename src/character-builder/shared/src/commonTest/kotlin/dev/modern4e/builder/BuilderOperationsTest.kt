package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class BuilderOperationsTest {
    private val main = ChoiceSlotId("fighter", "main", 0)
    private val fighter = ContentEntry("fighter", EntryCategory.CLASS, Presentation("Fighter"), Mechanics(
        choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH)),
            ChoiceDefinition.Entries("powers", 2, listOf("power"))),
        progression = listOf(
            ClassProgression(2, choices = listOf(ChoiceDefinition.Entries("utility", 1, listOf("power")))),
            ClassProgression(4, choices = listOf(
                ChoiceDefinition.Proficiencies("skill", 1, listOf(Skill.ACROBATICS)),
                ChoiceDefinition.Values("language", 1, FactKind.LANGUAGE, listOf(ValueOption("elven", "Elven"))))))),
        Coverage(CoverageStatus.SUPPORTED))
    private val power = ContentEntry("power", EntryCategory.POWER, Presentation("Power"), Mechanics(), Coverage(CoverageStatus.SUPPORTED))
    private val feat = ContentEntry("feat", EntryCategory.FEAT, Presentation("Feat"),
        Mechanics(prerequisites = listOf(Prerequisite.Level(2))), Coverage(CoverageStatus.SUPPORTED))
    private val trained = ContentEntry("trained", EntryCategory.FEAT, Presentation("Trained"),
        Mechanics(prerequisites = listOf(Prerequisite.Proficiency(Skill.MEDICINE))), Coverage(CoverageStatus.SUPPORTED))
    private val incomplete = ContentEntry("incomplete", EntryCategory.FEAT, Presentation("Unadapted"),
        Mechanics(prerequisites = listOf(Prerequisite.Unadapted("Strength 13"))), Coverage(CoverageStatus.PARTIAL))
    private val theme = ContentEntry("theme", EntryCategory.THEME, Presentation("Theme"),
        Mechanics(grants = listOf(Grant.Entry("theme-power", power.id))), Coverage(CoverageStatus.SUPPORTED))
    private val definitions = listOf(fighter, power, feat, trained, incomplete, theme)
    private val allocation = AbilityAllocation(main, Ability.STRENGTH, mapOf(Ability.STRENGTH to 4,
        Ability.DEXTERITY to 2, Ability.CONSTITUTION to 2, Ability.INTELLIGENCE to 1))

    private fun run(block: suspend () -> Unit) {
        var result: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) { result = value }
        })
        checkNotNull(result).getOrThrow()
    }
    private suspend fun operations(): BuilderOperations {
        val source = object : ContentSource {
            override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(
                id = "standard", revision = "1", title = "Standard", indexes = listOf("index"), chunks = listOf("chunk"))))
            override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
                definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, "chunk") }))
            override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(EntryChunk("chunk", definitions))
        }
        return BuilderOperations(assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, "standard", emptyList())).value)
    }
    private suspend fun create(ops: BuilderOperations, level: Int = 1) = ops.create("stable-id", "2026-11-17T00:00:00Z",
        CharacterIdentity("Proof"), emptyList(), allocation, level).document
    private suspend fun select(ops: BuilderOperations, doc: CharacterDocument, level: Int, slot: ChoiceSlotId, id: String, instance: String) =
        ops.apply(doc, BuilderEdit.Entry(level, slot, id, instance)).also { assertTrue(it.applied, it.diagnostics.toString()) }.state.document

    @Test fun themeIsRequiredForCompletionAndSelectionPersistsOnReopen() = run {
        val ops = operations()
        val slot = ChoiceSlotId("creation", "theme", 0)
        val draft = create(ops)
        assertEquals("Choose a Theme.", ops.evaluate(draft).rules.diagnostics.single { it.slot == slot }.message)
        val selected = select(ops, draft, 1, slot, theme.id, "theme")
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(selected))).value
        val state = operations().evaluate(reopened)
        assertEquals(selected, state.document)
        assertTrue(state.rules.diagnostics.none { it.slot == slot })
        assertTrue(state.rules.entries.any { it.granted && it.definition.entry.id == power.id })
    }

    @Test fun progressionAndDirectCreationPreserveRepeatedChoiceIdentities() = run {
        val ops = operations()
        suspend fun fill(start: CharacterDocument): CharacterDocument {
            var doc = select(ops, start, 1, ChoiceSlotId("creation", "class", 0), "fighter", "fighter")
            for (ordinal in 0..1) {
                doc = select(ops, doc, 1, ChoiceSlotId("fighter", "powers", ordinal), "power", "power-$ordinal")
            }
            doc = ops.apply(doc, BuilderEdit.Level(2)).state.document
            doc = select(ops, doc, 2, ChoiceSlotId("fighter", "utility", 0), "power", "utility")
            return select(ops, doc, 2, ChoiceSlotId("advancement.2", "feat", 0), "feat", "feat")
        }
        val progressed = fill(create(ops))
        val direct = fill(create(ops, 2))
        assertEquals(progressed, direct)
        assertEquals("stable-id", progressed.id)
        assertEquals(3, ops.evaluate(progressed).rules.entries.count { it.definition.entry.id == "power" })
        val slot = ChoiceSlotId("fighter", "powers", 0)
        val edited = select(ops, progressed, 1, slot, "power", "ignored-new-id")
        assertEquals("power-0", edited.levels.first().entries.single { it.slot == slot }.instanceId)
        val lowered = ops.apply(progressed, BuilderEdit.Level(1))
        assertTrue(lowered.applied)
        assertEquals(progressed.levels, lowered.state.document.levels)
        assertEquals(2, lowered.state.rules.entries.count { it.definition.entry.id == "power" })
        val raisedAgain = ops.apply(lowered.state.document, BuilderEdit.Level(2))
        assertEquals(progressed, raisedAgain.state.document)
        assertEquals(3, raisedAgain.state.rules.entries.count { it.definition.entry.id == "power" })
    }

    @Test fun futureChoicesUseTheirAcquisitionLevelAndWaitToAffectRules() = run {
        val ops = operations()
        val doc = select(ops, create(ops), 1, ChoiceSlotId("creation", "class", 0), "fighter", "fighter")
        val currentRules = ops.evaluate(doc).rules
        val featSlot = ChoiceSlotId("advancement.2", "feat", 0)
        val utilitySlot = ChoiceSlotId("fighter", "utility", 0)
        assertTrue(ops.options(doc, 2, featSlot).any { it.entry.entry.id == feat.id })
        assertTrue(ops.options(doc, 2, utilitySlot).any { it.entry.entry.id == power.id })
        val plannedFeat = select(ops, doc, 2, featSlot, feat.id, "level-2-feat")
        val plannedPower = select(ops, plannedFeat, 2, utilitySlot, power.id, "utility")
        val training = ProficiencyChoice(ChoiceSlotId("fighter", "skill", 0), Skill.ACROBATICS)
        val language = ValueChoice(ChoiceSlotId("fighter", "language", 0), "elven")
        val increase = AbilityAdvancement(AdvancementRules.abilitySlot(8), mapOf(Ability.DEXTERITY to 1, Ability.STRENGTH to 1))
        val planned = ops.apply(plannedPower, BuilderEdit.Batch(listOf(
            BuilderEdit.Proficiency(4, training), BuilderEdit.Value(4, language), BuilderEdit.Advancement(8, increase))))
        assertTrue(planned.applied, planned.diagnostics.toString())
        assertEquals(1, planned.state.document.level)
        assertEquals(currentRules, planned.state.rules)
        assertFalse(ops.apply(plannedPower, BuilderEdit.Value(3, language)).applied)

        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(planned.state.document))).value
        assertEquals(planned.state.document, reopened)
        val levelTwo = ops.apply(reopened, BuilderEdit.Level(2))
        assertTrue(levelTwo.state.rules.entries.any { it.slot == utilitySlot })
        assertTrue(levelTwo.state.rules.entries.any { it.slot == featSlot })
        assertFalse(Skill.ACROBATICS in levelTwo.state.rules.proficiencies)
        val levelFour = ops.apply(reopened, BuilderEdit.Level(4))
        assertTrue(Skill.ACROBATICS in levelFour.state.rules.proficiencies)
        assertTrue(levelFour.state.rules.facts.any { it.kind == FactKind.LANGUAGE && it.value == "elven" })
        assertEquals(currentRules.overviewAbilityTotals.getValue(Ability.DEXTERITY) + 1,
            ops.apply(reopened, BuilderEdit.Level(8)).state.rules.overviewAbilityTotals.getValue(Ability.DEXTERITY))
    }

    @Test fun proficiencyEditsKeepTheirAcquisitionLevelAfterAdvancing() = run {
        val ops = operations()
        val doc = create(ops, 19)
        val choice = ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 0), Skill.ATHLETICS)
        val late = ops.apply(doc, BuilderEdit.Proficiency(19, choice))
        assertFalse(late.applied)
        assertEquals(doc, late.state.document)
        val original = ops.apply(doc, BuilderEdit.Proficiency(1, choice))
        assertTrue(original.applied, original.diagnostics.toString())
        assertEquals(choice, original.state.document.levels.first { it.level == 1 }.proficiencies.single())
    }

    @Test fun levelChangesStayWithinBoundsAndPadNewDecisions() = run {
        val ops = operations()
        val base = create(ops)
        val raised = ops.apply(base, BuilderEdit.Level(5))
        assertTrue(raised.applied, raised.diagnostics.toString())
        assertEquals(5, raised.state.document.level)
        assertEquals((1..5).toList(), raised.state.document.levels.map { it.level }.sorted())
        assertTrue(raised.state.document.levels.filter { it.level > 1 }.all { it.entries.isEmpty() && it.abilityAdvancements.isEmpty() })
        assertFalse(raised.state.rules.diagnostics.any { it.code == "engine.missingAdvancement" })
        assertIs<ContractResult.Available<String>>(ContractCodec.encodeChecked(raised.state.document))
        val same = ops.apply(raised.state.document, BuilderEdit.Level(5))
        assertTrue(same.applied)
        assertEquals(raised.state.document.levels, same.state.document.levels)
        val top = ops.apply(raised.state.document, BuilderEdit.Level(30))
        assertTrue(top.applied, top.diagnostics.toString())
        assertEquals((1..30).toList(), top.state.document.levels.map { it.level }.sorted())
        assertEquals(listOf(8, 14, 28).map(AdvancementRules::abilitySlot),
            top.state.rules.diagnostics.filter { it.code == "engine.missingAdvancement" }.map { it.slot })
        assertFalse(ops.apply(raised.state.document, BuilderEdit.Level(0)).applied)
        assertFalse(ops.apply(top.state.document, BuilderEdit.Level(31)).applied)
        assertEquals(29, ops.apply(top.state.document, BuilderEdit.Level(29)).state.document.level)
        val decided = ops.apply(raised.state.document, BuilderEdit.LaterDecisions(LevelDecisions(3)))
        assertTrue(decided.applied, decided.diagnostics.toString())
    }

    @Test fun laterAdvancementEditsValidateAndMissingMilestonesRemainVisible() = run {
        val ops = operations()
        var document = create(ops, 19)
        document = select(ops, document, 1, ChoiceSlotId("creation", "class", 0), "fighter", "fighter")
        val increase = AbilityAdvancement(AdvancementRules.abilitySlot(8), mapOf(Ability.DEXTERITY to 1, Ability.STRENGTH to 1))
        val changed = ops.apply(document, BuilderEdit.Advancement(8, increase))
        assertTrue(changed.applied)
        assertEquals(listOf(increase), changed.state.document.levels.single { it.level == 8 }.abilityAdvancements)
        assertFalse(ops.apply(document, BuilderEdit.Advancement(8, increase.copy(increases = mapOf(Ability.STRENGTH to 2)))).applied)
        assertFalse(ops.apply(document, BuilderEdit.Advancement(14, increase)).applied)
        val cleared = ops.apply(changed.state.document, BuilderEdit.Advancement(8, null))
        assertTrue(cleared.applied)
        assertTrue(cleared.state.rules.diagnostics.any { it.code == "engine.missingAdvancement" && it.slot == increase.slot })
        for (at in (1..19).filter(AdvancementRules::replacesDailyAttack)) {
            assertTrue(cleared.state.rules.diagnostics.any { it.code == "engine.missingRootChoice" && it.slot == ChoiceSlotId("advancement.$at", "replacement", 0) })
        }
        assertTrue(ops.options(document, 12, ChoiceSlotId("advancement.11", "paragon-path", 0), true).isEmpty())
    }

    @Test fun eligibleDefaultAndForcedInvalidSelectionSurviveExport() = run {
        val ops = operations()
        val doc = create(ops)
        val slot = ChoiceSlotId("creation", "feat", 0)
        assertTrue(ops.options(doc, 1, slot).isEmpty())
        assertEquals(Eligibility.INELIGIBLE, ops.options(doc, 1, slot, true).first { it.entry.entry.id == "feat" }.eligibility)
        assertFalse(ops.apply(doc, BuilderEdit.Entry(1, slot, "feat", "feat")).applied)
        val forced = ops.apply(doc, BuilderEdit.Entry(1, slot, "feat", "feat", true))
        assertTrue(forced.applied)
        assertTrue(forced.state.rules.diagnostics.any { it.code == "engine.prerequisite" })
        assertIs<ContractResult.Available<String>>(ContractCodec.encodeChecked(forced.state.document))
        assertFalse(ops.apply(doc, BuilderEdit.Entry(1, slot, "missing", "missing", true)).applied)
    }

    @Test fun allocationAndUnrelatedMissingContentEditsKeepDecisions() = run {
        val ops = operations()
        var doc = create(ops)
        doc = select(ops, doc, 1, ChoiceSlotId("creation", "class", 0), "fighter", "fighter")
        val invalid = ops.apply(doc, BuilderEdit.Allocation(allocation.copy(points = allocation.points + (Ability.DEXTERITY to 3))))
        assertTrue(invalid.applied)
        assertTrue(invalid.state.rules.diagnostics.any { it.code == "engine.abilityAllocation" })
        val trade = ops.apply(doc, BuilderEdit.Allocation(allocation.copy(points = allocation.points +
            (Ability.DEXTERITY to 3) + (Ability.CHARISMA to -1))))
        assertFalse(trade.state.rules.diagnostics.any { it.code == "engine.abilityAllocation" })
        val missing = SavedSelection("lost", "Lost title", "missing-package", "old")
        doc = doc.copy(equipment = listOf(EquipmentSelection("lost-item", missing, equipped = true)))
        val renamed = ops.apply(doc, BuilderEdit.Identity(CharacterIdentity("Renamed")))
        assertEquals(doc.equipment, renamed.state.document.equipment)
        assertEquals("Renamed", renamed.state.document.identity.name)
        assertTrue(renamed.state.rules.diagnostics.any { it.kind == DiagnosticKind.UNRESOLVED_CONTENT })
        assertEquals(renamed.state.document, assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(renamed.state.document))).value)
    }
    @Test fun proficiencyEquipmentAndManualAdjustmentsRecalculateAndRemoveExplicitly() = run {
        val ops = operations()
        var doc = select(ops, create(ops), 1, ChoiceSlotId("creation", "class", 0), "fighter", "fighter")
        // Fill the class choices so missing grants cannot obscure calculated values.
        for (ordinal in 0..1) {
            doc = select(ops, doc, 1, ChoiceSlotId("fighter", "powers", ordinal), "power", "power-$ordinal")
        }
        for ((ordinal, skill) in listOf(Skill.MEDICINE, Skill.RELIGION, Skill.CRAFTING).withIndex()) {
            val edit = ops.apply(doc, BuilderEdit.Proficiency(1, ProficiencyChoice(ChoiceSlotId("creation", "free-skill", ordinal), skill)))
            assertTrue(edit.applied)
            doc = edit.state.document
        }
        assertEquals(3, assertIs<ContractResult.Available<CalculatedValue>>(ops.evaluate(doc).rules.skill(Skill.MEDICINE)).value.total)
        val adjustment = ManualAdjustment("manual", TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.MEDICINE),
            ModifierOperation.ADD, 2, BonusType.FEAT))
        val adjusted = ops.apply(doc, BuilderEdit.Adjustment(adjustment))
        val value = assertIs<ContractResult.Available<CalculatedValue>>(adjusted.state.rules.skill(Skill.MEDICINE)).value
        assertEquals(5, value.total)
        assertTrue(value.contributors.any { it.label == "Manual Adjustment" })
        assertEquals(doc, ops.apply(adjusted.state.document, BuilderEdit.RemoveAdjustment("manual")).state.document)
        val item = EquipmentSelection("inventory", SavedSelection("unknown", "Unknown", "standard", "old"),
            quantity = 2, configuration = mapOf("weapon" to "axe"))
        val equipped = ops.apply(doc, BuilderEdit.Equipment(item))
        assertEquals(item, equipped.state.document.equipment.single())
        assertEquals(doc, ops.apply(equipped.state.document, BuilderEdit.RemoveEquipment("inventory")).state.document)
        val removed = ops.apply(doc, BuilderEdit.RemoveEntry(ChoiceSlotId("creation", "class", 0)))
        assertTrue(removed.state.document.levels.first().entries.any { it.instanceId == "power-0" })
        assertTrue(removed.state.rules.diagnostics.any { it.code == "engine.orphanEntry" })
        assertTrue(removed.state.rules.diagnostics.any { it.code == "engine.missingRootChoice" })
    }

    @Test fun changedSkillInvalidatesFeatWithoutDeletingItAndIncompleteNeedsExplicitAcceptance() = run {
        val ops = operations()
        var doc = create(ops)
        val slot = ChoiceSlotId("creation", "feat", 0)
        val incompleteOption = ops.options(doc, 1, slot, true).first { it.entry.entry.id == "incomplete" }
        assertEquals(Eligibility.INCOMPLETE, incompleteOption.eligibility)
        assertFalse(ops.apply(doc, BuilderEdit.Entry(1, slot, "incomplete", "feat")).applied)
        val accepted = ops.apply(doc, BuilderEdit.Entry(1, slot, "incomplete", "feat", true))
        assertTrue(accepted.applied)
        assertTrue(accepted.state.rules.diagnostics.any { it.code == "engine.unadaptedPrerequisite" })
        doc = select(ops, doc, 1, ChoiceSlotId("creation", "class", 0), "fighter", "fighter")
        for (ordinal in 0..1) {
            doc = select(ops, doc, 1, ChoiceSlotId("fighter", "powers", ordinal), "power", "power-$ordinal")
        }
        doc = ops.apply(doc, BuilderEdit.Background(BackgroundKind.ENVIRONMENT, "urban", Skill.SOCIETY)).state.document
        doc = ops.apply(doc, BuilderEdit.Background(BackgroundKind.UPBRINGING, "labor", Skill.CRAFTING)).state.document
        val free = ChoiceSlotId("creation", "free-skill", 0)
        doc = ops.apply(doc, BuilderEdit.Proficiency(1, ProficiencyChoice(free, Skill.MEDICINE))).state.document
        doc = ops.apply(doc, BuilderEdit.Proficiency(1, ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 1), Skill.RELIGION))).state.document
        doc = select(ops, doc, 1, slot, "trained", "trained")
        val changed = ops.apply(doc, BuilderEdit.Proficiency(1, ProficiencyChoice(free, Skill.STEALTH)))
        assertTrue(changed.applied)
        assertEquals("trained", changed.state.document.levels.first().entries.single { it.slot == slot }.selection.entryId)
        assertTrue(changed.state.rules.diagnostics.any { it.entryId == "trained" && it.code == "engine.prerequisite" })
        val changedMain = ops.apply(doc, BuilderEdit.Allocation(allocation.copy(mainAbility = Ability.INTELLIGENCE)))
        assertTrue(changedMain.state.rules.diagnostics.any { it.code == "engine.mainAbility" })
    }

}
