package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Exact Python-compiled Fighter package is consumed identically by JVM and JS. */
class SharedClassTest {
    private val chunk = ContractCodec.json.decodeFromString<EntryChunk>(contractFixtures.getValue("shared-fighter-chunk.json"))
    private val definitions = chunk.entries.associateBy { it.id }
    private val supplier = PackageRevision("modern4e.classes", "1")
    private val fighter get() = definitions.getValue("modern4e.class.fighter")
    private val root = ChoiceSlotId("creation", "class", 0)
    private val main = ChoiceSlotId("fighter", "main", 0)
    private fun feature(name: String) = definitions.getValue("modern4e.feature.$name")
    private fun resolved(entry: ContentEntry) = ResolvedEntry(entry, supplier, ContractCodec.fingerprint(entry))
    private fun decision(entry: ContentEntry, instance: String, slot: ChoiceSlotId) = EntryChoice(instance, slot,
        SavedSelection(entry.id, entry.presentation.title, supplier.packageId, ContractCodec.fingerprint(entry)))
    private fun ownedChoice(name: String) = ChoiceSlotId(ModernCreation.grantInstance("fighter", name), "modern4e.choice.$name", 0)
    private fun character(reactivity: String = "combat-reactivity", specialization: String = "one-handed-weapon-talent") = CharacterDocument(
        id = "shared-fighter", savedAt = "2026-11-17T22:00:00Z", identity = CharacterIdentity("Fighter"), packages = listOf(supplier), level = 1,
        abilities = AbilityAllocation(main, Ability.STRENGTH, mapOf(Ability.STRENGTH to 4, Ability.CONSTITUTION to 2,
            Ability.DEXTERITY to 2, Ability.INTELLIGENCE to 1)),
        levels = listOf(LevelDecisions(1, entries = listOf(decision(fighter, "fighter", root),
            decision(feature(reactivity), "reactivity", ownedChoice("fighter-reactivity")),
            decision(feature(specialization), "specialization", ownedChoice("fighter-specialization"))),
            proficiencies = listOf(
                ProficiencyChoice(ChoiceSlotId("background.environment.urban", "skill", 0), Skill.SOCIETY),
                ProficiencyChoice(ChoiceSlotId("background.upbringing.labor", "skill", 0), Skill.CRAFTING),
                ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 0), Skill.MEDICINE),
                ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 1), Skill.RELIGION)))),
    )
    private fun content(document: CharacterDocument, replacements: List<ContentEntry> = emptyList()): RulesContent {
        val all = definitions + replacements.associateBy { it.id }
        return RulesContent(all.mapValues { ContractResult.Available(resolved(it.value)) },
            document.levels.flatMap { it.entries }.associate { it.selection to ContractResult.Available(resolved(all.getValue(it.selection.entryId))) })
    }
    private fun evaluate(document: CharacterDocument = character(), replacements: List<ContentEntry> = emptyList()) =
        RulesEngine.evaluate(document, content(document, replacements))
    private fun calculation(result: EngineResult, statistic: Statistic) =
        assertIs<ContractResult.Available<CalculatedValue>>(result.statistics.getValue(ModifierTarget(statistic)).value).value

    @Test
    fun fighterHasLocalFormulaGoldensIndependentChoicesAndThreeAutomaticPowers() {
        val result = evaluate()
        for ((statistic, expected) in mapOf(Statistic.HIT_POINTS to 29, Statistic.HEALING_SURGES to 11,
            Statistic.FORTITUDE to 19, Statistic.REFLEX to 14, Statistic.WILL to 11)) {
            val value = calculation(result, statistic)
            assertEquals(expected, value.total)
            assertEquals(expected, value.contributors.sumOf { it.value })
        }
        assertEquals(3, result.entries.count { it.granted && it.definition.entry.category == EntryCategory.POWER })
        assertEquals(2, result.choices.count { it.entries.isNotEmpty() })
        assertTrue(result.choices.flatMap { it.entries }.all { it.status == Eligibility.ELIGIBLE })
        assertEquals(CombatCondition.ONE_HANDED_WEAPON, result.conditionalModifiers.single().benefit.condition)
        assertEquals(Ability.CONSTITUTION, feature("melee-weapon-mastery").mechanics.weaponAbilities[WeaponGroup.AXE])
        assertIs<ContractResult.Unavailable>(result.statistics.getValue(ModifierTarget(Statistic.ATTACK)).value)
        assertTrue(result.diagnostics.any { it.code == "engine.coverage" })
        assertFalse(result.diagnostics.any { it.kind == DiagnosticKind.INVALID_SELECTION || it.kind == DiagnosticKind.UNRESOLVED_CONTENT }, result.diagnostics.toString())
    }

    @Test
    fun bothBuildChoicesRecalculateWithoutInventingCombatSuperiorityAbilityChoice() {
        for (reactivity in listOf("combat-reactivity", "combat-superiority")) {
            for (specialization in listOf("one-handed-weapon-talent", "two-handed-weapon-talent", "battlerager-vigor")) {
                val result = evaluate(character(reactivity, specialization))
                assertEquals(if (reactivity == "combat-reactivity") 3 else 1,
                    result.entries.count { it.granted && it.definition.entry.category == EntryCategory.POWER })
                assertEquals(29, calculation(result, Statistic.HIT_POINTS).total)
                assertEquals(if (specialization == "battlerager-vigor") 0 else 1, result.conditionalModifiers.size)
                assertEquals(2, result.choices.count { it.entries.isNotEmpty() })
            }
        }
        val doc = character()
        val changed = doc.copy(abilities = doc.abilities.copy(points = doc.abilities.points + (Ability.CONSTITUTION to 1) + (Ability.WISDOM to 1)))
        assertEquals(27, calculation(evaluate(changed), Statistic.HIT_POINTS).total)
        assertEquals(10, calculation(evaluate(changed), Statistic.HEALING_SURGES).total)
        assertEquals(12, calculation(evaluate(changed), Statistic.WILL).total)
    }

    @Test
    fun acquisitionLevelIsIndependentOfPrerequisitesAndGrantsNeverConsumeSelectedSlots() {
        val late = feature("combat-reactivity").copy(mechanics = feature("combat-reactivity").mechanics.copy(
            prerequisites = listOf(Prerequisite.Level(20))))
        val updated = fighter.copy(mechanics = fighter.mechanics.copy(grants = fighter.mechanics.grants + Grant.Entry("late", late.id, 2)))
        val initial = character("combat-superiority")
        assertFalse(evaluate(initial, listOf(updated, late)).entries.any { it.instanceId == ModernCreation.grantInstance("fighter", "late") })
        val later = initial.copy(level = 2, levels = initial.levels + LevelDecisions(2))
        val result = evaluate(later, listOf(updated, late))
        assertTrue(result.entries.any { it.instanceId == ModernCreation.grantInstance("fighter", "late") && it.granted })
        assertFalse(result.diagnostics.any { it.code == "engine.prerequisite" && it.entryId == late.id })
        assertEquals(36, calculation(result, Statistic.HIT_POINTS).total)
        assertEquals(2, result.choices.count { it.entries.isNotEmpty() })
    }

    @Test
    fun duplicateAndCyclicGrantsAndMissingDependenciesBlockTotalsWithoutDroppingDecisions() {
        val doc = character()
        val cyclic = fighter.copy(mechanics = fighter.mechanics.copy(grants = fighter.mechanics.grants + Grant.Entry("cycle", fighter.id)))
        assertTrue(evaluate(doc, listOf(cyclic)).diagnostics.any { it.code == "engine.grantCycle" })
        val duplicate = fighter.copy(mechanics = fighter.mechanics.copy(grants = fighter.mechanics.grants + fighter.mechanics.grants.first()))
        assertTrue(evaluate(doc, listOf(duplicate)).diagnostics.any { it.code == "engine.grantDefinition" })
        val missing = content(doc).copy(entries = content(doc).entries - "modern4e.power.combat-challenge")
        val result = RulesEngine.evaluate(doc, missing)
        assertIs<ContractResult.Unavailable>(result.statistics.getValue(ModifierTarget(Statistic.HIT_POINTS)).value)
        assertEquals(doc, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(doc))).value)
    }

    @Test
    fun repeatedGrantsKeepSeparateOccurrencesAndStableChildProvenanceAcrossReopen() {
        val late = feature("combat-reactivity")
        val updated = fighter.copy(mechanics = fighter.mechanics.copy(grants = fighter.mechanics.grants +
            Grant.Entry("repeat-one", late.id) + Grant.Entry("repeat-two", late.id)))
        val doc = character()
        val before = evaluate(doc, listOf(updated))
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(doc))).value
        val after = evaluate(reopened, listOf(updated))
        assertEquals(before.entries.map { it.instanceId to it.slot }, after.entries.map { it.instanceId to it.slot })
        assertEquals(7, before.entries.count { it.definition.entry.category == EntryCategory.POWER })
        assertEquals(7, before.entries.filter { it.definition.entry.category == EntryCategory.POWER }.map { it.instanceId }.distinct().size)
        assertEquals(29, calculation(before, Statistic.HIT_POINTS).total)
    }

    @Test
    fun explicitAcquisitionAndClassFormulaWorkAtLaterLevelsWithGeneralProgressionDiagnostic() {
        val late = feature("combat-reactivity")
        val updated = fighter.copy(mechanics = fighter.mechanics.copy(grants = fighter.mechanics.grants + Grant.Entry("late-five", late.id, 5)))
        val doc = character("combat-superiority").copy(level = 5)
        val result = evaluate(doc, listOf(updated))
        assertEquals(57, calculation(result, Statistic.HIT_POINTS).total)
        assertTrue(result.entries.any { it.instanceId == ModernCreation.grantInstance("fighter", "late-five") })
        assertTrue(result.diagnostics.any { it.code == "engine.progressionUnsupported" })
    }

    @Test
    fun formulaOverflowConflictingClassesAndConflictingDefinitionsRemainUnavailable() {
        val stats = fighter.mechanics.classProfile!!.statistics + (Statistic.HIT_POINTS to ClassFormula(Int.MAX_VALUE, 1))
        val overflow = fighter.copy(mechanics = fighter.mechanics.copy(classProfile = fighter.mechanics.classProfile!!.copy(statistics = stats)))
        val result = evaluate(replacements = listOf(overflow))
        assertIs<ContractResult.Unavailable>(result.statistics.getValue(ModifierTarget(Statistic.HIT_POINTS)).value)
        assertTrue(result.diagnostics.any { it.code == "engine.formulaOverflow" })
        val other = fighter.copy(id = "other-class", mechanics = fighter.mechanics.copy(grants = emptyList()))
        val conflict = fighter.copy(mechanics = fighter.mechanics.copy(grants = fighter.mechanics.grants + Grant.Entry("another-class", other.id)))
        assertTrue(evaluate(replacements = listOf(conflict, other)).diagnostics.any { it.code == "engine.conflictingClasses" })
        val doc = character()
        val different = feature("combat-reactivity").copy(presentation = Presentation("Conflicting definition"))
        val repeated = fighter.copy(mechanics = fighter.mechanics.copy(grants = fighter.mechanics.grants + Grant.Entry("conflicting", different.id)))
        val original = content(doc, listOf(repeated))
        val conflicting = original.copy(entries = original.entries + (different.id to ContractResult.Available(resolved(different))))
        assertTrue(RulesEngine.evaluate(doc, conflicting).diagnostics.any { it.code == "engine.conflictingDefinitions" })
    }

    @Test
    fun classChangesKeepDependentDecisionsAndPortableProvenance() {
        val doc = character()
        val replacement = fighter.copy(id = "replacement", mechanics = fighter.mechanics.copy(grants = emptyList()))
        val changed = doc.copy(levels = doc.levels.map { level -> level.copy(entries = level.entries.map {
            if (it.slot == root) decision(replacement, it.instanceId, it.slot) else it
        }) })
        val result = evaluate(changed, listOf(replacement))
        assertEquals(2, result.diagnostics.count { it.code == "engine.orphanEntry" })
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(changed))).value
        assertEquals(changed, reopened)
        assertEquals(doc.levels.single().entries.drop(1), reopened.levels.single().entries.drop(1))
    }

    @Test
    fun structuredAccessRetainsOrBranchesClassQualificationAndUnresolvedFacts() {
        val candidate = feature("one-handed-weapon-talent")
        val conditions = listOf(
            Prerequisite.AnyOf(listOf(Prerequisite.Level(20), Prerequisite.ClassPowerSource("MARTIAL"))),
            Prerequisite.AnyOf(listOf(Prerequisite.Level(20), Prerequisite.Unresolved("unknown", "needs adaptation"))),
            Prerequisite.AllOf(listOf(Prerequisite.ClassPowerSource("DIVINE"), Prerequisite.Level(1))),
            Prerequisite.EquipmentProficiency("SCALE"),
        )
        val expected = listOf(Eligibility.ELIGIBLE, Eligibility.INCOMPLETE, Eligibility.INELIGIBLE, Eligibility.ELIGIBLE)
        for ((index, condition) in conditions.withIndex()) {
            val changed = candidate.copy(mechanics = candidate.mechanics.copy(access = condition))
            val result = evaluate(replacements = listOf(changed))
            val option = result.choices.single { it.slot == ownedChoice("fighter-specialization") }.entries.single { it.entryId == candidate.id }
            assertEquals(expected[index], option.status)
            if (option.status == Eligibility.INCOMPLETE) {
                assertFalse(option.diagnostics.any { it.kind == DiagnosticKind.INVALID_SELECTION })
            }
        }
    }

    @Test
    fun candidateCannotEstablishEligibilityUsingItsOwnModifiersOrGrants() {
        val candidate = feature("one-handed-weapon-talent")
        val changed = candidate.copy(mechanics = candidate.mechanics.copy(prerequisites = listOf(Prerequisite.AbilityPoints(Ability.WISDOM, 2)),
            modifiers = listOf(TypedModifier(ModifierTarget(Statistic.ABILITY_POINTS, ability = Ability.WISDOM), ModifierOperation.ADD, 2))))
        val result = evaluate(replacements = listOf(changed))
        val option = result.choices.single { it.slot == ownedChoice("fighter-specialization") }.entries.single { it.entryId == candidate.id }
        assertEquals(Eligibility.INELIGIBLE, option.status)
        assertTrue(option.diagnostics.any { it.code == "engine.prerequisite" })
    }

    @Test
    fun independentAllocationFactsRemainUsableWhileAnUnrelatedNestedChoiceIsUnfilled() {
        val doc = character().let { it.copy(levels = it.levels.map { level -> level.copy(entries =
            level.entries.filterNot { choice -> choice.instanceId == "reactivity" }) }) }
        val talent = feature("one-handed-weapon-talent")
        val qualified = talent.copy(mechanics = talent.mechanics.copy(prerequisites = listOf(Prerequisite.AbilityPoints(Ability.CONSTITUTION, 2))))
        val result = evaluate(doc, listOf(qualified))
        assertIs<ContractResult.Unavailable>(result.statistics.getValue(ModifierTarget(Statistic.HIT_POINTS)).value)
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("specialization").status)
        assertTrue(result.diagnostics.any { it.code == "engine.missingChoice" })
    }

    @Test
    fun mutuallySupportingSelectionsCannotProveTheirOwnEligibilityThroughAnotherBenefit() {
        val talent = feature("one-handed-weapon-talent")
        val reactivity = feature("combat-reactivity")
        val first = talent.copy(mechanics = talent.mechanics.copy(prerequisites = listOf(Prerequisite.AbilityPoints(Ability.WISDOM, 2)),
            grants = listOf(Grant.Proficiency("dependent-proficiency", Skill.ATHLETICS))))
        val second = reactivity.copy(mechanics = reactivity.mechanics.copy(prerequisites = listOf(Prerequisite.Proficiency(Skill.ATHLETICS)),
            modifiers = listOf(TypedModifier(ModifierTarget(Statistic.ABILITY_POINTS, ability = Ability.WISDOM), ModifierOperation.ADD, 2))))
        val result = evaluate(replacements = listOf(first, second))
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("specialization").status)
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("reactivity").status)
        assertTrue(result.diagnostics.any { it.code == "engine.prerequisite" })
    }

    @Test
    fun independentFactsCanQualifyDespiteMatchingBenefitsAndHistoricalDecisionsUseTheirOwnLevel() {
        val talent = feature("one-handed-weapon-talent")
        val qualified = talent.copy(mechanics = talent.mechanics.copy(prerequisites = listOf(
            Prerequisite.AbilityPoints(Ability.CONSTITUTION, 2), Prerequisite.ClassPowerSource("MARTIAL")),
            modifiers = listOf(TypedModifier(ModifierTarget(Statistic.ABILITY_POINTS, ability = Ability.CONSTITUTION), ModifierOperation.ADD, 1))))
        val doc = character().let { it.copy(level = 2, levels = it.levels + LevelDecisions(2)) }
        val result = evaluate(doc, listOf(qualified))
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("specialization").status)
        assertFalse(result.diagnostics.any { it.code == "engine.prerequisiteDependency" })
        assertEquals(doc, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(doc))).value)
    }

    @Test
    fun laterGrantsAndProficienciesCannotRetroactivelyQualifyEarlierSelections() {
        val talent = feature("one-handed-weapon-talent")
        val qualified = talent.copy(mechanics = talent.mechanics.copy(prerequisites = listOf(Prerequisite.Proficiency(Skill.ATHLETICS))))
        val later = fighter.copy(mechanics = fighter.mechanics.copy(progression = fighter.mechanics.progression +
            ClassProgression(2, grants = listOf(Grant.Proficiency("late-athletics", Skill.ATHLETICS)))))
        val doc = character().let { it.copy(level = 2, levels = it.levels + LevelDecisions(2)) }
        val result = evaluate(doc, listOf(qualified, later))
        assertTrue(Skill.ATHLETICS in result.proficiencies)
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("specialization").status)
    }

    @Test
    fun explicitCampaignExclusionsAreKnownIneligibilityAndPreserveSelections() {
        val talent = feature("one-handed-weapon-talent")
        val excluded = talent.copy(mechanics = talent.mechanics.copy(access =
            Prerequisite.Unavailable("Unavailable in this campaign", "Explicit profile policy")))
        val encoded = ContractCodec.json.encodeToString(ContentEntry.serializer(), excluded)
        assertEquals(excluded, ContractCodec.json.decodeFromString<ContentEntry>(encoded))
        assertNotEquals(ContractCodec.fingerprint(talent), ContractCodec.fingerprint(excluded))
        val result = evaluate(replacements = listOf(excluded))
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("specialization").status)
        assertTrue(result.entries.any { it.instanceId == "specialization" })
        assertTrue(result.diagnostics.any { it.code == "engine.unavailableCondition" })
    }

    @Test
    fun multiclassQualificationAppliesOnlyToFeatsAndPathsAndOnlyGrantsRealFeatures() {
        val target = fighter.copy(id = "modern4e.class.rogue", mechanics = fighter.mechanics.copy(
            classProfile = fighter.mechanics.classProfile!!.copy(powerSources = listOf("DIVINE")), grants = emptyList(), choices = emptyList()))
        val multiclass = feature("combat-reactivity").copy(category = EntryCategory.FEAT,
            mechanics = Mechanics(version = 2, multiclassFor = target.id))
        val talent = feature("one-handed-weapon-talent")
        for (category in listOf(EntryCategory.FEAT, EntryCategory.PARAGON_PATH, EntryCategory.POWER)) {
            val candidate = talent.copy(category = category, mechanics = Mechanics(version = 2,
                prerequisites = listOf(Prerequisite.Entry(target.id), Prerequisite.ClassPowerSource("DIVINE"))))
            val result = evaluate(replacements = listOf(multiclass, candidate, target))
            assertEquals(if (category == EntryCategory.POWER) Eligibility.INELIGIBLE else Eligibility.ELIGIBLE,
                result.entryEligibility.getValue("specialization").status)
        }
        val missingFeature = talent.copy(category = EntryCategory.FEAT, mechanics = Mechanics(version = 2,
            prerequisites = listOf(Prerequisite.Entry("modern4e.feature.sneak-attack"))))
        val sneak = talent.copy(id = "modern4e.feature.sneak-attack", mechanics = Mechanics(version = 2))
        assertEquals(Eligibility.INELIGIBLE, evaluate(replacements = listOf(multiclass, missingFeature, target, sneak))
            .entryEligibility.getValue("specialization").status)
        val granting = multiclass.copy(mechanics = multiclass.mechanics.copy(grants = listOf(Grant.Entry("sneak", sneak.id))))
        assertEquals(Eligibility.ELIGIBLE, evaluate(replacements = listOf(granting, missingFeature, target, sneak))
            .entryEligibility.getValue("specialization").status)
        assertEquals(multiclass, ContractCodec.json.decodeFromString<ContentEntry>(
            ContractCodec.json.encodeToString(ContentEntry.serializer(), multiclass)))
        assertNotEquals(ContractCodec.fingerprint(multiclass), ContractCodec.fingerprint(multiclass.copy(mechanics = multiclass.mechanics.copy(multiclassFor = null))))
    }

    @Test
    fun v2DefinitionsRoundTripFingerprintAllNewFactsAndRejectInvalidFormulaAndContexts() {
        val encoded = ContractCodec.json.encodeToString(ContentEntry.serializer(), fighter)
        assertEquals(fighter, ContractCodec.json.decodeFromString<ContentEntry>(encoded))
        val profile = fighter.mechanics.classProfile!!
        val changed = fighter.copy(mechanics = fighter.mechanics.copy(classProfile = profile.copy(statistics = profile.statistics +
            (Statistic.HIT_POINTS to profile.statistics.getValue(Statistic.HIT_POINTS).copy(base = 19)))))
        assertNotEquals(ContractCodec.fingerprint(fighter), ContractCodec.fingerprint(changed))
        assertFailsWith<IllegalArgumentException> { ClassFormula(-1) }
        assertFailsWith<IllegalArgumentException> {
            ConditionalModifier(CombatCondition.ONE_HANDED_WEAPON, TypedModifier(ModifierTarget(Statistic.HIT_POINTS), ModifierOperation.ADD, 1))
        }
        val talent = feature("one-handed-weapon-talent")
        val serialized = ContractCodec.json.encodeToString(ContentEntry.serializer(), talent)
        assertFailsWith<IllegalArgumentException> {
            ContractCodec.json.decodeFromString<ContentEntry>(serialized.replace("ONE_HANDED_WEAPON", "UNKNOWN_CONTEXT"))
        }
    }

    @Test
    fun missingLegacyClassMetadataDoesNotProveSourceIneligibility() {
        val legacy = fighter.copy(mechanics = fighter.mechanics.copy(version = 1, classProfile = null,
            choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH)))))
        val talent = feature("one-handed-weapon-talent")
        val qualified = talent.copy(mechanics = talent.mechanics.copy(access = Prerequisite.ClassPowerSource("MARTIAL")))
        val result = evaluate(replacements = listOf(legacy, qualified))
        assertEquals(Eligibility.INCOMPLETE, result.entryEligibility.getValue("specialization").status)
        assertTrue(result.diagnostics.any { it.code == "engine.classFactsUnavailable" })
    }

    @Test
    fun scheduledChoicesAndDistinctSelectionConstraintsPreserveInvalidDecisions() {
        val owner = feature("fighter-specialization")
        val originalChoice = assertIs<ChoiceDefinition.Entries>(owner.mechanics.choices.single())
        val late = owner.copy(mechanics = owner.mechanics.copy(choices = listOf(originalChoice.copy(atLevel = 2))))
        val doc = character()
        assertTrue(evaluate(doc, listOf(late)).diagnostics.any { it.code == "engine.orphanEntry" && it.slot == ownedChoice("fighter-specialization") })
        val later = doc.copy(level = 2, levels = doc.levels + LevelDecisions(2))
        assertTrue(evaluate(later, listOf(late)).choices.any { it.slot == ownedChoice("fighter-specialization") })
        val multiple = owner.copy(mechanics = owner.mechanics.copy(choices = listOf(originalChoice.copy(count = 2, distinct = true))))
        val repeated = doc.copy(levels = doc.levels.map { level -> level.copy(entries = level.entries +
            decision(feature("one-handed-weapon-talent"), "duplicate-talent", ownedChoice("fighter-specialization").copy(ordinal = 1))) })
        val result = evaluate(repeated, listOf(multiple))
        assertTrue(result.diagnostics.any { it.code == "engine.distinctChoice" })
        assertTrue(result.diagnostics.any { it.code == "engine.selectionMaximum" })
        assertEquals(repeated, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(repeated))).value)
    }

    @Test
    fun v2CatalogBuilderEditsAndReconciliationRetainIdentityAndDependencies() = immediate {
        val replacement = fighter.copy(id = "modern4e.class.replacement", mechanics = fighter.mechanics.copy(grants = emptyList()))
        val source = object : ContentSource {
            var current = chunk.copy(entries = chunk.entries + replacement)
            override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(2, supplier.packageId,
                supplier.revision, "Shared classes", indexes = listOf("index"), chunks = listOf("entries"))))
            override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
                current.entries.map { EntryMetadata(it.id, it.category, it.presentation.title, "entries") }))
            override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(current)
        }
        val doc = character()
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, supplier.packageId, doc.packages)).value
        val operations = BuilderOperations(catalog)
        assertEquals(29, calculation(operations.evaluate(doc).rules, Statistic.HIT_POINTS).total)
        val choices = operations.options(doc, 1, ownedChoice("fighter-specialization"))
        assertEquals(3, choices.size)
        assertTrue(choices.all { it.eligibility == Eligibility.ELIGIBLE })
        val edit = operations.apply(doc, BuilderEdit.Entry(1, ownedChoice("fighter-specialization"),
            "modern4e.feature.two-handed-weapon-talent", "discarded-new-instance"))
        assertTrue(edit.applied, edit.diagnostics.toString())
        assertEquals("specialization", edit.state.document.levels.single().entries.last().instanceId)
        assertEquals(CombatCondition.TWO_HANDED_WEAPON, edit.state.rules.conditionalModifiers.single().benefit.condition)
        val changedClass = operations.apply(edit.state.document, BuilderEdit.Entry(1, root, replacement.id, "discarded-class-instance"))
        assertTrue(changedClass.applied)
        assertEquals("fighter", changedClass.state.document.levels.single().entries.single { it.slot == root }.instanceId)
        assertEquals(2, changedClass.state.rules.diagnostics.count { it.code == "engine.orphanEntry" })
        val coordinator = ContentReconciliation(source, supplier.packageId)
        source.current = source.current.copy(entries = source.current.entries.map {
            if (it.id == fighter.id) it.copy(presentation = it.presentation.copy(title = "Renamed Fighter")) else it
        })
        val refreshed = assertIs<ContractResult.Available<ReconciliationState>>(coordinator.reconcile(doc)).value
        assertEquals(doc, refreshed.state.document)
        assertTrue(refreshed.selections.any { it.acknowledgmentRequired })
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(refreshed.state.document))).value
        assertEquals(doc, reopened)
    }

    private fun immediate(block: suspend () -> Unit) {
        var completed: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                completed = result
            }
        })
        assertNotNull(completed).getOrThrow()
    }
}
