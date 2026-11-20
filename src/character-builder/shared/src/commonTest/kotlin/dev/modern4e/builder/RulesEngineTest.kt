package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class RulesEngineTest {
    private val mainSlot = ChoiceSlotId("fighter", "main", 0)
    private fun slot(source: String, choice: String = "skill", ordinal: Int = 0) = ChoiceSlotId(source, choice, ordinal)
    private fun entry(id: String, category: EntryCategory = EntryCategory.FEAT, mechanics: Mechanics = Mechanics(), coverage: Coverage = Coverage(CoverageStatus.SUPPORTED)) =
        ContentEntry(id, category, Presentation(id), mechanics, coverage)
    private fun resolved(entry: ContentEntry) = ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry))
    private fun choice(entry: ContentEntry, instance: String = entry.id, slot: ChoiceSlotId = slot("creation", "feat")) =
        EntryChoice(instance, slot, SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry)))
    private val fighter = entry("fighter", EntryCategory.CLASS,
        Mechanics(choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH, Ability.INTELLIGENCE)))))
    private fun character(vararg additions: EntryChoice): CharacterDocument = CharacterDocument(
        id = "engine-proof", savedAt = "2026-11-16T22:00:00Z", identity = CharacterIdentity("Proof"), packages = emptyList(), level = 1,
        abilities = AbilityAllocation(mainSlot, Ability.STRENGTH, mapOf(Ability.STRENGTH to 4, Ability.DEXTERITY to 2,
            Ability.CONSTITUTION to 2, Ability.INTELLIGENCE to 1, Ability.WISDOM to 0, Ability.CHARISMA to 0)),
        levels = listOf(LevelDecisions(1, entries = listOf(choice(fighter, slot = slot("creation", "class"))) + additions,
            proficiencies = listOf(ProficiencyChoice(slot("background.environment.urban"), Skill.SOCIETY),
                ProficiencyChoice(slot("background.upbringing.labor"), Skill.CRAFTING),
                ProficiencyChoice(slot("creation", "free-skill"), Skill.MEDICINE),
                ProficiencyChoice(slot("creation", "free-skill", 1), Skill.RELIGION)))),
    )
    private fun content(document: CharacterDocument, vararg definitions: ContentEntry): RulesContent {
        val all = (listOf(fighter) + definitions).associateBy { it.id }
        return RulesContent(all.mapValues { ContractResult.Available(resolved(it.value)) },
            document.levels.flatMap { it.entries }.associate { decision -> decision.selection to
                (all[decision.selection.entryId]?.let { ContractResult.Available(resolved(it)) }
                    ?: ContractResult.Unavailable(listOf(Diagnostic("test.missing", DiagnosticKind.UNRESOLVED_CONTENT, "Missing definition")))) })
    }
    private fun total(result: ContractResult<CalculatedValue>) = assertIs<ContractResult.Available<CalculatedValue>>(result).value.total
    private fun evaluate(document: CharacterDocument = character(), vararg definitions: ContentEntry) = RulesEngine.evaluate(document, content(document, *definitions))

    @Test
    fun overviewShowsDefaultsAndKnownModifiersWhileRequiredChoicesAreOpen() {
        val original = character()
        val empty = original.copy(abilities = original.abilities.copy(points = emptyMap()), levels = emptyList())
        val emptyOverview = evaluate(empty)
        assertEquals(Ability.entries.associateWith { 0 }, emptyOverview.overviewAbilityTotals)
        assertEquals(0, total(emptyOverview.displayedSkill(Skill.ATHLETICS)))

        val classOnly = original.copy(abilities = empty.abilities)
        val classOverview = evaluate(classOnly)
        assertEquals(4, classOverview.overviewAbilityTotals.getValue(Ability.STRENGTH))
        assertEquals(0, classOverview.overviewAbilityTotals.getValue(Ability.DEXTERITY))
        assertEquals(4, total(classOverview.displayedSkill(Skill.ATHLETICS)))
        assertEquals(5, total(classOverview.displayedSkill(Skill.MEDICINE)))

        val abilityTarget = ModifierTarget(Statistic.ABILITY_POINTS, ability = Ability.DEXTERITY)
        val bonus = entry("bonus", mechanics = Mechanics(
            modifiers = listOf(TypedModifier(abilityTarget, ModifierOperation.ADD, 1))))
        val pending = entry("pending", mechanics = Mechanics(
            choices = listOf(ChoiceDefinition.Entries("bonus", 1, listOf(bonus.id)))))
        val known = entry("known", category = EntryCategory.THEME, mechanics = Mechanics(modifiers = listOf(
            TypedModifier(abilityTarget, ModifierOperation.ADD, 2),
            TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.MEDICINE), ModifierOperation.ADD, 2))))
        val result = evaluate(character(choice(pending), choice(known, slot = slot("creation", "theme"))),
            pending, known, bonus)
        assertTrue(result.diagnostics.any { it.code == "engine.missingChoice" })
        assertEquals(4, result.overviewAbilityTotals.getValue(Ability.DEXTERITY))
        assertIs<ContractResult.Unavailable>(result.ability(Ability.DEXTERITY))
        assertEquals(4, total(result.displayedSkill(Skill.ACROBATICS)))
        assertEquals(8, total(result.displayedSkill(Skill.MEDICINE)))
        val draftSlot = slot("creation", "free-skill")
        assertEquals(9, total(result.displayedSkill(Skill.ACROBATICS, draftSlot)))
        assertEquals(3, total(result.displayedSkill(Skill.MEDICINE, proficiencySource = null)))
        assertIs<ContractResult.Unavailable>(result.skill(Skill.MEDICINE))
    }

    @Test
    fun displayedVitalsAndSpeedUseCurrentInputsWithUnfilledChoices() {
        val constitution = mapOf(Ability.CONSTITUTION to 1)
        val profile = ClassProfile("DEFENDER", listOf("MARTIAL"), listOf(Ability.STRENGTH), emptyList(),
            listOf("armor", "shields", "weapons", "implements").associateWith { emptyList() },
            mapOf(Statistic.HIT_POINTS to ClassFormula(10, 6, constitution),
                Statistic.HEALING_SURGES to ClassFormula(9, abilities = constitution),
                Statistic.FORTITUDE to ClassFormula(10), Statistic.REFLEX to ClassFormula(10), Statistic.WILL to ClassFormula(10)))
        val warrior = entry("warrior", EntryCategory.CLASS, Mechanics(classProfile = profile,
            choices = listOf(ChoiceDefinition.Entries("feature", 1, listOf("pending-feature"))),
            progression = listOf(ClassProgression(2, modifiers = listOf(
                TypedModifier(ModifierTarget(Statistic.HIT_POINTS), ModifierOperation.ADD, 4))))))
        val ancestry = entry("ancestry", EntryCategory.ANCESTRY, Mechanics(modifiers = listOf(
            TypedModifier(ModifierTarget(Statistic.SPEED), ModifierOperation.SET, 6))))
        val selected = listOf(choice(warrior, slot = slot("creation", "class")), choice(ancestry, slot = slot("creation", "ancestry")))
        val initial = character()
        val document = initial.copy(abilities = initial.abilities.copy(source = slot(warrior.id, "main")),
            levels = listOf(initial.levels.single().copy(entries = selected)))
        val result = evaluate(document, warrior, ancestry)
        assertIs<ContractResult.Unavailable>(result.statistics.getValue(ModifierTarget(Statistic.HIT_POINTS)).value)
        assertEquals(18, total(result.displayedStatistic(Statistic.HIT_POINTS)))
        assertEquals(11, total(result.displayedStatistic(Statistic.HEALING_SURGES)))
        assertEquals(6, total(result.displayedStatistic(Statistic.SPEED)))

        val classOnly = evaluate(document.copy(levels = listOf(document.levels.single().copy(entries = selected.take(1)))),
            warrior, ancestry)
        assertEquals(18, total(classOnly.displayedStatistic(Statistic.HIT_POINTS)))
        assertIs<ContractResult.Unavailable>(classOnly.displayedStatistic(Statistic.SPEED))
        val ancestryOnly = evaluate(document.copy(levels = listOf(document.levels.single().copy(entries = selected.drop(1)))),
            warrior, ancestry)
        assertEquals(6, total(ancestryOnly.displayedStatistic(Statistic.SPEED)))
        assertIs<ContractResult.Unavailable>(ancestryOnly.displayedStatistic(Statistic.HIT_POINTS))

        val raised = evaluate(document.copy(level = 2, levels = document.levels + LevelDecisions(2)), warrior, ancestry)
        assertEquals(28, total(raised.displayedStatistic(Statistic.HIT_POINTS)))
    }

    @Test
    fun modernAbilityAndSkillGoldenHasExplainedProficiencyWithoutHalfLevel() {
        val result = evaluate()
        assertEquals(4, total(result.ability(Ability.STRENGTH)))
        assertEquals(6, total(result.skill(Skill.MEDICINE)))
        assertEquals(6, total(result.skill(Skill.CRAFTING)))
        assertEquals(6, total(result.skill(Skill.SOCIETY)))
        assertEquals(5, total(result.skill(Skill.RELIGION)))
        assertEquals(2, total(result.skill(Skill.ACROBATICS)))
        assertEquals(16, result.statistics.keys.count { it.statistic == Statistic.SKILL_CHECK })
        for (skill in Skill.entries) {
            assertEquals(total(result.ability(skill.ability)) + if (skill in result.proficiencies) 5 else 0, total(result.skill(skill)))
        }
        val medicine = assertIs<ContractResult.Available<CalculatedValue>>(result.skill(Skill.MEDICINE)).value
        assertEquals(listOf(1, 5), medicine.contributors.map { it.value })
        assertEquals(slot("creation", "free-skill"), medicine.contributors.last().source)
        assertEquals(4, result.choices.count { it.skills.isNotEmpty() })
        val (missingRoots, other) = result.diagnostics.partition { it.code == "engine.missingRootChoice" }
        assertEquals(listOf("ancestry", "theme", "feat"), missingRoots.map { it.slot?.choiceId })
        assertTrue(other.isEmpty(), other.toString())
    }

    @Test
    fun allocationValidatesCurrentBudgetCapsTradeoffAndMainChoice() {
        val original = character()
        val trade = original.copy(abilities = original.abilities.copy(points = original.abilities.points +
            (Ability.DEXTERITY to 3) + (Ability.CHARISMA to -1)))
        assertEquals(3, total(evaluate(trade).ability(Ability.DEXTERITY)))
        for (points in listOf(
            original.abilities.points + (Ability.DEXTERITY to 3),
            original.abilities.points + (Ability.INTELLIGENCE to 2),
            original.abilities.points + (Ability.STRENGTH to 3),
            trade.abilities.points + (Ability.WISDOM to -1) + (Ability.CONSTITUTION to 3),
            trade.abilities.points + (Ability.DEXTERITY to 4) + (Ability.CONSTITUTION to 1),
        )) {
            val result = evaluate(original.copy(abilities = original.abilities.copy(points = points)))
            assertIs<ContractResult.Unavailable>(result.ability(Ability.STRENGTH))
            assertIs<ContractResult.Unavailable>(result.skill(Skill.ATHLETICS))
            assertTrue(result.diagnostics.any { it.code == "engine.abilityAllocation" })
        }
        val changed = original.copy(abilities = original.abilities.copy(mainAbility = Ability.INTELLIGENCE,
            points = original.abilities.points + (Ability.STRENGTH to 1) + (Ability.INTELLIGENCE to 4)))
        assertEquals(9, total(evaluate(changed).skill(Skill.MEDICINE)))
        assertEquals(1, total(evaluate(changed).skill(Skill.ATHLETICS)))
        assertIs<ContractResult.Unavailable>(evaluate(changed.copy(abilities = changed.abilities.copy(mainAbility = Ability.WISDOM))).ability(Ability.WISDOM))
    }

    @Test
    fun duplicateProficiencyKeepsSourcesAndOneBonusWithoutInventingReplacement() {
        val trained = entry("training", mechanics = Mechanics(grants = listOf(Grant.Proficiency("medicine", Skill.MEDICINE),
            Grant.Proficiency("medicine-again", Skill.MEDICINE))))
        val result = evaluate(character(choice(trained)), trained)
        assertEquals(6, total(result.skill(Skill.MEDICINE)))
        assertEquals(3, result.proficiencies.getValue(Skill.MEDICINE).size)
        assertTrue(result.diagnostics.any { it.code == "engine.duplicateProficiency" && it.kind == DiagnosticKind.INCOMPLETE_AUTOMATION })
        assertEquals(2, result.entries.size)
    }

    @Test
    fun backgroundAndFreeSlotsAreSeparateAndInvalidSkillsRemainStored() {
        val original = character()
        val invalid = original.copy(levels = listOf(original.levels.single().copy(proficiencies =
            original.levels.single().proficiencies.map { if (it.slot.sourceInstanceId.contains("environment")) it.copy(skill = Skill.ATHLETICS) else it })))
        val result = evaluate(invalid)
        assertTrue(result.diagnostics.any { it.code == "engine.choiceOption" && it.slot == slot("background.environment.urban") })
        assertEquals(4, invalid.levels.single().proficiencies.size)
        assertFalse(Skill.ATHLETICS in result.proficiencies)
        assertEquals(2, result.choices.count { it.slot.sourceInstanceId == "creation" && it.slot.choiceId == "free-skill" })
        val changed = original.copy(levels = listOf(original.levels.single().copy(proficiencies = original.levels.single().proficiencies.map {
            if (it.slot.sourceInstanceId.contains("environment")) it.copy(slot = slot("background.environment.rural")) else it
        })))
        assertTrue(evaluate(changed).diagnostics.any { it.code == "engine.choiceOption" })
    }

    @Test
    fun grantsAndRepeatedChoicesHaveStableSourceInstancesAndSelectionDiagnostics() {
        val power = entry("power", EntryCategory.POWER)
        val feature = entry("feature", EntryCategory.FEATURE, Mechanics(choices = listOf(ChoiceDefinition.Entries("power", 1, listOf("power")))))
        val parent = fighter.copy(mechanics = fighter.mechanics.copy(grants = listOf(Grant.Entry("first", "feature"), Grant.Entry("second", "feature"))))
        val first = ModernCreation.grantInstance("fighter", "first")
        val second = ModernCreation.grantInstance("fighter", "second")
        val original = character().let { doc -> doc.copy(levels = listOf(doc.levels.single().copy(entries =
            listOf(choice(parent, "fighter", slot("creation", "class")), choice(power, "power-a", slot(first, "power")), choice(power, "power-b", slot(second, "power")))))) }
        val result = evaluate(original, parent, feature, power)
        assertEquals(5, result.entries.size)
        assertEquals(setOf(first, second), result.entries.filter { it.granted }.map { it.instanceId }.toSet())
        assertEquals(setOf(slot(first, "power"), slot(second, "power")), result.choices.filter { it.entries.isNotEmpty() }.map { it.slot }.toSet())
        assertEquals(result, evaluate(original, parent, feature, power))
        val missing = original.copy(levels = listOf(original.levels.single().copy(entries = original.levels.single().entries.dropLast(1))))
        assertTrue(evaluate(missing, parent, feature, power).diagnostics.any { it.code == "engine.missingChoice" && it.slot == slot(second, "power") })
    }

    @Test
    fun eligibilityDistinguishesLegalIllegalUnadaptedAndUnresolvedCandidates() {
        val legal = entry("legal", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Level(1), Prerequisite.AbilityPoints(Ability.STRENGTH, 4), Prerequisite.Proficiency(Skill.MEDICINE))))
        val illegal = entry("illegal", mechanics = Mechanics(prerequisites = listOf(Prerequisite.AbilityPoints(Ability.WISDOM, 2))))
        val unadapted = entry("unadapted", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Unadapted("Str 15"))))
        val requiresAbsent = entry("requires-absent", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Entry("absent"))))
        val partial = entry("partial", coverage = Coverage(CoverageStatus.PARTIAL, listOf("Unimplemented benefit")))
        val parent = fighter.copy(mechanics = fighter.mechanics.copy(choices = fighter.mechanics.choices +
            ChoiceDefinition.Entries("feat", 1, listOf("legal", "illegal", "unadapted", "missing", "requires-absent", "partial"))))
        val document = character().let { doc -> doc.copy(levels = listOf(doc.levels.single().copy(entries =
            listOf(choice(parent, "fighter", slot("creation", "class")), choice(illegal, slot = slot("fighter", "feat")))))) }
        val result = evaluate(document, parent, legal, illegal, unadapted, requiresAbsent, partial)
        assertEquals(listOf(Eligibility.ELIGIBLE, Eligibility.INELIGIBLE, Eligibility.INCOMPLETE, Eligibility.UNRESOLVED, Eligibility.UNRESOLVED, Eligibility.INCOMPLETE),
            result.choices.single { it.slot == slot("fighter", "feat") }.entries.map { it.status })
        assertTrue(result.choices.single { it.slot == slot("fighter", "feat") }.entries.last().diagnostics.any { it.code == "engine.coverage" })
        assertTrue(result.diagnostics.any { it.code == "engine.prerequisite" && it.entryId == "illegal" && it.slot == slot("fighter", "feat") })
        assertEquals("illegal", document.levels.single().entries.last().selection.entryId)
    }

    @Test
    fun unadaptedSelectedPrerequisitesAndPartialCoverageSurviveManualAdjustment() {
        val unsupported = entry("unsupported", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Unadapted("Str 15"))),
            coverage = Coverage(CoverageStatus.UNIMPLEMENTED, listOf("Needs adaptation")))
        val document = character(choice(unsupported)).copy(manualAdjustments = listOf(ManualAdjustment("manual",
            TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.MEDICINE), ModifierOperation.ADD, 2))))
        val result = evaluate(document, unsupported)
        assertEquals(8, total(result.skill(Skill.MEDICINE)))
        val contributors = assertIs<ContractResult.Available<CalculatedValue>>(result.skill(Skill.MEDICINE)).value.contributors
        assertEquals("Manual Adjustment", contributors.last().label)
        assertTrue(result.diagnostics.any { it.code == "engine.unadaptedPrerequisite" })
        assertTrue(result.diagnostics.any { it.code == "engine.coverage" })
        assertEquals(CoverageStatus.UNIMPLEMENTED, result.coverage.getValue("unsupported").status)
    }

    @Test
    fun missingDefinitionsGrantsAndCyclesCannotMasqueradeAsZeroOrBeFixedBySet() {
        val unknown = entry("unknown")
        val document = character(choice(unknown)).copy(manualAdjustments = listOf(ManualAdjustment("manual",
            TypedModifier(ModifierTarget(Statistic.ABILITY_POINTS, ability = Ability.STRENGTH), ModifierOperation.SET, 20))))
        val missing = evaluate(document)
        assertIs<ContractResult.Unavailable>(missing.skill(Skill.MEDICINE))
        assertIs<ContractResult.Unavailable>(missing.ability(Ability.STRENGTH))
        val grant = entry("grant", mechanics = Mechanics(grants = listOf(Grant.Entry("missing", "unknown"))))
        assertIs<ContractResult.Unavailable>(evaluate(character(choice(grant)), grant).skill(Skill.MEDICINE))
        val cyclic = entry("cyclic", mechanics = Mechanics(grants = listOf(Grant.Entry("self", "cyclic"))))
        val cycle = evaluate(character(choice(cyclic)), cyclic)
        assertTrue(cycle.diagnostics.any { it.code == "engine.grantCycle" })
        assertIs<ContractResult.Unavailable>(cycle.skill(Skill.MEDICINE))
    }

    @Test
    fun duplicatesAndOrphansDoNotApplySilentExtraBenefits() {
        val document = character()
        val doubled = document.copy(levels = listOf(document.levels.single().copy(entries = document.levels.single().entries.repeatTwice())))
        assertIs<ContractResult.Unavailable>(evaluate(doubled).skill(Skill.MEDICINE))
        assertTrue(evaluate(doubled).diagnostics.any { it.code == "engine.duplicateSlot" })
        val orphan = entry("orphan", mechanics = Mechanics(modifiers = listOf(TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.MEDICINE), ModifierOperation.ADD, 100))))
        val result = evaluate(character(choice(orphan, slot = slot("missing-source", "feat"))), orphan)
        assertEquals(6, total(result.skill(Skill.MEDICINE)))
        assertTrue(result.diagnostics.any { it.code == "engine.orphanEntry" })
    }

    @Test
    fun levelTwoProgressionAddsSlotsAndHalfLevelOnlyToArmorClass() {
        val utility = entry("utility", EntryCategory.POWER)
        val parent = fighter.copy(mechanics = fighter.mechanics.copy(progression = listOf(ClassProgression(2,
            choices = listOf(ChoiceDefinition.Entries("utility", 1, listOf("utility"))),
            modifiers = listOf(TypedModifier(ModifierTarget(Statistic.HIT_POINTS), ModifierOperation.SET, 30))))))
        val document = character().let { doc -> doc.copy(level = 2, levels = listOf(doc.levels.single().copy(entries =
            listOf(choice(parent, "fighter", slot("creation", "class")))), LevelDecisions(2, entries = listOf(choice(utility, slot = slot("fighter", "utility")))))) }
        val result = evaluate(document, parent, utility)
        assertEquals(6, total(result.skill(Skill.MEDICINE)))
        assertEquals(30, total(result.statistics.getValue(ModifierTarget(Statistic.HIT_POINTS)).value))
        assertEquals(2, result.entries.size)
        assertEquals(14, total(result.statistics.getValue(ModifierTarget(Statistic.AC)).value))
    }

    @Test
    fun selfGrantedPrerequisitesAndHistoricalPrerequisitesAreExplicitlyIncomplete() {
        val self = entry("self", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Proficiency(Skill.ATHLETICS)),
            grants = listOf(Grant.Proficiency("athletics", Skill.ATHLETICS))))
        val result = evaluate(character(choice(self)), self)
        assertTrue(result.diagnostics.any { it.code == "engine.prerequisiteDependency" && it.entryId == "self" })
        val historical = entry("historical", mechanics = Mechanics(prerequisites = listOf(Prerequisite.AbilityPoints(Ability.STRENGTH, 4))))
        assertTrue(evaluate(character(choice(historical)).copy(level = 2), historical).diagnostics.any { it.code == "engine.prerequisiteDependency" })
        val late = entry("late", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Level(2))))
        assertTrue(evaluate(character(choice(late)).copy(level = 2), late).diagnostics.any { it.code == "engine.prerequisite" && it.kind == DiagnosticKind.INVALID_SELECTION })
    }

    @Test
    fun catalogSnapshotKeepsSavedSupplierProtectionAndFindsTransitiveDependencies() {
        val child = entry("child", EntryCategory.FEATURE, Mechanics(grants = listOf(Grant.Proficiency("train", Skill.ATHLETICS))))
        val parent = fighter.copy(mechanics = fighter.mechanics.copy(grants = listOf(Grant.Entry("child", "child"))))
        val document = character().let { doc -> doc.copy(levels = listOf(doc.levels.single().copy(entries = listOf(choice(parent, "fighter", slot("creation", "class")))))) }
        val source = object : ContentSource {
            override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(id = "standard", revision = "1", title = "standard", indexes = listOf("index"), chunks = listOf("chunk"))))
            override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(listOf(parent, child).map { EntryMetadata(it.id, it.category, it.presentation.title, "chunk") }))
            override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(EntryChunk("chunk", listOf(parent, child)))
        }
        synchronous {
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, "standard", emptyList())).value
            val snapshot = RulesContent.load(document, catalog)
            assertTrue("child" in snapshot.entries)
            assertEquals(9, total(RulesEngine.evaluate(document, snapshot).skill(Skill.ATHLETICS)))
            val lost = document.copy(levels = listOf(document.levels.single().copy(entries = document.levels.single().entries.map { it.copy(selection = it.selection.copy(supplierPackageId = "missing-custom")) })))
            val result = RulesEngine.evaluate(lost, RulesContent.load(lost, catalog))
            assertIs<ContractResult.Unavailable>(result.skill(Skill.ATHLETICS))
            assertTrue(result.diagnostics.any { it.code == "catalog.expectedSupplier" })
        }
    }

    @Test
    fun malformedGrantChoiceDefinitionsAndDuplicateInstancesBlockTotals() {
        val malformed = entry("malformed", mechanics = Mechanics(grants = listOf(Grant.Proficiency("same", Skill.ATHLETICS),
            Grant.Proficiency("same", Skill.ENDURANCE)), choices = listOf(ChoiceDefinition.Entries("bad-count", -1, emptyList()))))
        val result = evaluate(character(choice(malformed)), malformed)
        assertTrue(result.diagnostics.any { it.code == "engine.grantDefinition" })
        assertTrue(result.diagnostics.any { it.code == "engine.choiceDefinition" })
        assertIs<ContractResult.Unavailable>(result.skill(Skill.ATHLETICS))
        val feat = entry("feat")
        val duplicate = evaluate(character(choice(feat, "fighter")), feat)
        assertTrue(duplicate.diagnostics.any { it.code == "engine.duplicateInstance" })
        assertIs<ContractResult.Unavailable>(duplicate.ability(Ability.STRENGTH))
    }

    @Test
    fun skillProficiencyUsesTypedStackingAndOverflowRemainsExplicit() {
        val target = ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.MEDICINE)
        val original = character().copy(manualAdjustments = listOf(ManualAdjustment("proficiency",
            TypedModifier(target, ModifierOperation.ADD, 5, BonusType.PROFICIENCY))))
        assertEquals(6, total(evaluate(original).skill(Skill.MEDICINE)))
        val overflow = original.copy(manualAdjustments = listOf(ManualAdjustment("extreme",
            TypedModifier(ModifierTarget(Statistic.ABILITY_POINTS, ability = Ability.INTELLIGENCE), ModifierOperation.SET, Int.MAX_VALUE))))
        assertIs<ContractResult.Unavailable>(evaluate(overflow).skill(Skill.MEDICINE))
        assertTrue(evaluate(overflow).diagnostics.any { it.code == "engine.overflow" })
    }

    @Test
    fun provenEntryRequirementFailsWhenDefinitionExistsButWasNotSelected() {
        val available = entry("available")
        val requires = entry("requires", mechanics = Mechanics(prerequisites = listOf(Prerequisite.Entry("available"))))
        val result = evaluate(character(choice(requires)), requires, available)
        assertTrue(result.diagnostics.any { it.code == "engine.prerequisite" && it.entryId == "requires" })
        assertFalse(result.diagnostics.any { it.code == "engine.prerequisiteUnavailable" })
        val invalidAllocation = character(choice(requires)).let { it.copy(abilities = it.abilities.copy(points = emptyMap())) }
        val abilityRequirement = requires.copy(mechanics = Mechanics(prerequisites = listOf(Prerequisite.AbilityPoints(Ability.STRENGTH, 4))))
        val invalid = evaluate(invalidAllocation, abilityRequirement)
        assertTrue(invalid.diagnostics.any { it.code == "engine.abilityAllocation" && it.entryId == "requires" && it.kind == DiagnosticKind.INVALID_SELECTION })
        assertFalse(invalid.diagnostics.any { it.code == "engine.prerequisiteUnavailable" })
    }

    private fun <T> List<T>.repeatTwice() = this + this
    private fun synchronous(block: suspend () -> Unit) {
        var finished = false
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) { result.getOrThrow(); finished = true }
        })
        assertTrue(finished)
    }
}
