package dev.modern4e.builder

import kotlin.test.*
import kotlin.coroutines.*

/** The same observable power-selection fixtures execute on JVM and JavaScript. */
class PowerSelectionTest {
    @Test
    fun utilityPickKindsFilterOnlyExplicitMembershipAndRemainIndependentOfKeywords() {
        fun utility(id: String, kinds: List<String>) = power(id, kind = "UTILITY").let {
            it.copy(mechanics = it.mechanics.copy(powerProfile = it.mechanics.powerProfile!!.copy(pickKinds = kinds)))
        }
        val combat = utility("combat", listOf("COMBAT"))
        val outside = utility("outside", listOf("NON_COMBAT"))
        val both = utility("both", listOf("COMBAT", "NON_COMBAT"))
        val unknown = utility("unknown", emptyList())
        val choices = listOf("COMBAT", "NON_COMBAT").map { kind -> ChoiceDefinition.Entries(kind, 1,
            query = PowerQuery(powerKind = "UTILITY", pickKind = kind)) }
        val root = root(choices)
        val result = evaluate(character(root, emptyList()), listOf(root, combat, outside, both, unknown))
        assertEquals(setOf("combat", "both"), result.choices.single { it.slot.choiceId == "COMBAT" }.entries.map { it.entryId }.toSet())
        assertEquals(setOf("outside", "both"), result.choices.single { it.slot.choiceId == "NON_COMBAT" }.entries.map { it.entryId }.toSet())
        assertFailsWith<IllegalArgumentException> { PowerQuery(powerKind = "ATTACK", pickKind = "COMBAT") }
        assertFailsWith<IllegalArgumentException> { PowerProfile(1, "DAILY", "UTILITY", pickKinds = listOf("UNKNOWN")) }
    }

    private val supplier = PackageRevision("test.powers", "1")
    private val atWill = "modern4e.choice.class-attack-at-will"
    private val daily = "modern4e.choice.class-attack-daily"
    private val known = "spellbook"
    private val prepared = "prepare"
    private fun entry(id: String, category: EntryCategory, mechanics: Mechanics) = ContentEntry(id, category,
        Presentation(id), mechanics.copy(version = 2), Coverage(CoverageStatus.PARTIAL, listOf("Combat is not executed.")))
    private fun power(id: String, beast: Boolean = false, usage: String = "AT_WILL", kind: String = "ATTACK", level: Int = 1) =
        entry(id, EntryCategory.POWER, Mechanics(access = Prerequisite.Always, powerProfile = PowerProfile(level, usage, kind,
            if (beast) listOf("BEAST_FORM") else emptyList())))
    private fun resolved(value: ContentEntry) = ResolvedEntry(value, supplier, ContractCodec.fingerprint(value))
    private fun decision(value: ContentEntry, slot: ChoiceSlotId, instance: String = "${slot.sourceInstanceId}:${slot.choiceId}:${slot.ordinal}") =
        EntryChoice(instance, slot, SavedSelection(value.id, value.presentation.title, supplier.packageId, ContractCodec.fingerprint(value)))
    private fun root(choices: List<ChoiceDefinition>, grants: List<Grant> = emptyList()) = entry("class", EntryCategory.CLASS,
        Mechanics(choices = choices + ChoiceDefinition.MainAbility("main", listOf(Ability.WISDOM)), grants = grants))
    private fun character(root: ContentEntry, decisions: List<EntryChoice>, level: Int = 1) = CharacterDocument(
        id = "power-tests", savedAt = "2026-11-17T22:00:00Z", identity = CharacterIdentity("Power tests"), packages = listOf(supplier), level = level,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.WISDOM, mapOf(Ability.WISDOM to 4,
            Ability.STRENGTH to 2, Ability.CONSTITUTION to 2, Ability.DEXTERITY to 1)),
        levels = listOf(LevelDecisions(1, entries = listOf(decision(root, ChoiceSlotId("creation", "class", 0), "class")) + decisions)))
    private fun evaluate(doc: CharacterDocument, definitions: List<ContentEntry>): EngineResult {
        val all = definitions.associateBy { it.id }
        val selections = doc.levels.flatMap { it.entries + it.replacements.map { change -> change.replacement } }
            .mapNotNull { choice -> all[choice.selection.entryId]?.let { choice.selection to ContractResult.Available(resolved(it)) } }.toMap()
        return RulesEngine.evaluate(doc, RulesContent(all.mapValues { ContractResult.Available(resolved(it.value)) }, selections))
    }
    private fun query(id: String, count: Int, usage: String = "AT_WILL", kind: String = "ATTACK", atLevel: Int = 1) =
        ChoiceDefinition.Entries(id, count, atLevel = atLevel, distinct = true,
            query = PowerQuery(usage = usage, powerKind = kind, levelMaximum = atLevel))

    @Test
    fun druidBoundsIgnoreOrderUnrelatedGrantedPowersAndIncompleteIntermediateChoices() {
        val powers = listOf(power("beast1", true), power("beast2", true), power("beast3", true), power("human1"), power("human2"), power("bonus", true))
        val balance = entry("balance", EntryCategory.FEATURE, Mechanics(selectionModifiers = listOf(SelectionModifier(atWill, 3,
            listOf(SelectionConstraint("keywordCount", "BEAST_FORM", 1, 2))))))
        val root = root(listOf(query(atWill, 2)), listOf(Grant.Entry("balance", balance.id), Grant.Entry("bonus", "bonus")))
        fun doc(ids: List<String>) = character(root, ids.mapIndexed { ordinal, id ->
            decision(powers.single { it.id == id }, ChoiceSlotId("class", atWill, ordinal)) })
        for (ids in listOf(listOf("beast1", "human1", "human2"), listOf("human1", "beast1", "beast2"), listOf("beast2", "beast1", "human1"))) {
            val result = evaluate(doc(ids), powers + root + balance)
            assertEquals(3, result.selectionSets.single().required)
            assertTrue(result.selectionSets.single().diagnostics.isEmpty(), result.selectionSets.toString())
            assertEquals(1, result.entries.count { it.granted && it.definition.entry.category == EntryCategory.POWER })
        }
        val partial = evaluate(doc(listOf("human1")), powers + root + balance)
        assertEquals(2, partial.selectionSets.single().remaining)
        assertFalse(partial.diagnostics.any { it.code == "engine.keywordCount" })
        val tooMany = evaluate(doc(listOf("beast1", "beast2", "beast3")), powers + root + balance)
        assertTrue(tooMany.diagnostics.any { it.code == "engine.keywordCount" })
        assertTrue(evaluate(doc(listOf("human1", "human2", "human1")), powers + root + balance).diagnostics.any { it.code == "engine.distinctChoice" })
        val removed = root.copy(mechanics = root.mechanics.copy(grants = listOf(Grant.Entry("bonus", "bonus"))))
        assertEquals(2, evaluate(doc(listOf("beast1", "human1", "human2")), powers + removed + balance).selectionSets.single().required)
        assertTrue(evaluate(doc(listOf("beast1", "human1", "human2")), powers + removed + balance).diagnostics.any { it.code == "engine.orphanEntry" })
    }

    @Test
    fun countConflictsAreDeterministicAndNeverProduceFalseEligibleCandidates() {
        val p = power("p")
        val a = entry("a", EntryCategory.FEATURE, Mechanics(selectionModifiers = listOf(SelectionModifier(atWill, 3))))
        val b = entry("b", EntryCategory.FEATURE, Mechanics(selectionModifiers = listOf(SelectionModifier(atWill, 4))))
        val root = root(listOf(query(atWill, 2)), listOf(Grant.Entry("a", "a"), Grant.Entry("b", "b")))
        val doc = character(root, emptyList())
        val first = evaluate(doc, listOf(p, a, b, root))
        val second = evaluate(doc, listOf(root, b, a, p))
        assertEquals(first.diagnostics, second.diagnostics)
        assertTrue(first.diagnostics.any { it.code == "engine.selectionOverrideConflict" })
        assertTrue(first.choices.filter { it.slot.choiceId == atWill }.flatMap { it.entries }.all { it.status == Eligibility.INCOMPLETE })
    }

    @Test
    fun spellbookPreparationRequiresOwnedDistinctPowersAndRecalculatesAfterReplacement() {
        val powers = (1..5).map { power("daily$it", usage = "DAILY") }
        val spellbook = entry("book", EntryCategory.FEATURE, Mechanics(collections = listOf(PowerCollection(known, "Known", 128),
            PowerCollection(prepared, "Prepared", 3)), selectionModifiers = listOf(SelectionModifier(daily, 4, collection = known, replacement = "FOLLOW_TARGET")),
            choices = listOf(query(prepared, 2, "DAILY").copy(query = PowerQuery(usage = "DAILY", powerKind = "ATTACK", characterLevel = true),
                countByLevel = listOf(ChoiceCount(1, 2), ChoiceCount(5, 3)), collection = prepared, requiresCollection = known))))
        val root = root(listOf(query(daily, 2, "DAILY")), listOf(Grant.Entry("book", "book")))
        val bookInstance = ModernCreation.grantInstance("class", "book")
        val learned = powers.take(4).mapIndexed { i, p -> decision(p, ChoiceSlotId("class", daily, i)) }
        fun doc(preparation: List<ContentEntry>) = character(root, learned + preparation.mapIndexed { i, p -> decision(p, ChoiceSlotId(bookInstance, prepared, i)) })
        val valid = evaluate(doc(powers.take(2)), powers + root + spellbook)
        assertFalse(valid.diagnostics.any { it.code in listOf("engine.selectionMaximum", "engine.collectionOwnership", "engine.distinctChoice") })
        val bad = evaluate(doc(listOf(powers[0], powers[4])), powers + root + spellbook)
        assertTrue(bad.diagnostics.any { it.code == "engine.collectionOwnership" })
        assertTrue(bad.choices.single { it.slot == ChoiceSlotId(bookInstance, prepared, 1) }.entries.single { it.entryId == "daily5" }.status == Eligibility.INELIGIBLE)
        assertTrue(evaluate(doc(listOf(powers[0], powers[0])), powers + root + spellbook).diagnostics.any { it.code == "engine.distinctChoice" })
        val source = doc(powers.take(2))
        val target = learned.first().slot
        val changed = source.copy(level = 2, levels = source.levels + LevelDecisions(2, replacements = listOf(
            Replacement(target, decision(powers[4], target, learned.first().instanceId), ReplacementKind.RETRAINING))))
        val after = evaluate(changed, powers + root + spellbook)
        assertTrue(after.diagnostics.any { it.code == "engine.collectionOwnership" && it.entryId == "daily1" })
        assertEquals("daily5", after.entries.single { it.slot == target }.definition.entry.id)
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(changed))).value
        assertEquals(after.diagnostics, evaluate(reopened, powers + root + spellbook).diagnostics)
        assertEquals(3, evaluate(source.copy(level = 5), powers + root + spellbook).selectionSets.single { it.choiceId == prepared }.required)
    }

    @Test
    fun tomeUnknownDistinctnessAndReplacementLevelsRemainIndependentFromKnownAcquisition() {
        val powers = listOf(power("known", usage = "ENCOUNTER"), power("stored", usage = "ENCOUNTER"), power("other", usage = "ENCOUNTER"))
        val tome = query("tome", 1, "ENCOUNTER").copy(constraints = listOf(SelectionConstraint("notKnown")), replacementLevels = listOf(1, 3, 7))
        val root = root(listOf(query("encounter", 1, "ENCOUNTER"), tome))
        val learned = decision(powers[0], ChoiceSlotId("class", "encounter", 0))
        val stored = decision(powers[1], ChoiceSlotId("class", "tome", 0))
        val doc = character(root, listOf(learned, stored))
        assertFalse(evaluate(doc, powers + root).diagnostics.any { it.code == "engine.alreadyKnown" })
        val duplicate = character(root, listOf(learned, decision(powers[0], stored.slot)))
        assertTrue(evaluate(duplicate, powers + root).diagnostics.any { it.code == "engine.alreadyKnown" })
        for (level in listOf(2, 3)) {
            val changed = doc.copy(level = level, levels = doc.levels + LevelDecisions(level, replacements = listOf(
                Replacement(stored.slot, decision(powers[2], stored.slot), ReplacementKind.PROGRESSION))))
            assertEquals(level == 2, evaluate(changed, powers + root).diagnostics.any { it.code == "engine.replacementLevel" })
        }
    }

    @Test
    fun utilityAcquisitionAndUnavailableTechniqueQueriesKeepStableSlotsAndCoverage() {
        val utility = power("utility", usage = "ENCOUNTER", kind = "UTILITY", level = 2)
        val root = root(listOf(query("utility2", 1, "ENCOUNTER", "UTILITY", 2),
            ChoiceDefinition.Entries("techniques5", 2, atLevel = 5, query = PowerQuery(category = EntryCategory.TECHNIQUE, levelMaximum = 5))))
        val doc = character(root, emptyList())
        assertTrue(evaluate(doc, listOf(root, utility)).selectionSets.isEmpty())
        assertEquals(1, evaluate(doc.copy(level = 2), listOf(root, utility)).selectionSets.size)
        val later = evaluate(doc.copy(level = 5), listOf(root, utility))
        assertEquals(2, later.selectionSets.size)
        assertTrue(later.diagnostics.any { it.code == "engine.queryCoverage" })
        assertTrue(later.choices.filter { it.slot.choiceId == "techniques5" }.all { it.entries.isEmpty() })
        val missing = doc.copy(levels = listOf(LevelDecisions(1, entries = doc.levels.single().entries +
            EntryChoice("lost", ChoiceSlotId("class", "missing", 0), SavedSelection("lost", "Lost power", supplier.packageId, "old")))))
        assertEquals(missing, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(missing))).value)
    }
    @Test
    fun builderReplacementRetainsOccurrenceHistoryAndRejectsBrokenWholeSets() {
        var completed: Result<Unit>? = null
        suspend {
            val powers = listOf(power("beast", true), power("human1"), power("human2"), power("human3"))
            val choice = query(atWill, 3).copy(constraints = listOf(SelectionConstraint("keywordCount", "BEAST_FORM", 1, 2)))
            val root = root(listOf(choice))
            val definitions = powers + root
            val source = object : ContentSource {
                override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(formatVersion = 2,
                    id = supplier.packageId, revision = supplier.revision, title = "Power tests", indexes = listOf("index"), chunks = listOf("entries"))))
                override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
                    definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, "entries") }))
                override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(EntryChunk("entries", definitions))
            }
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, supplier.packageId, emptyList())).value
            val operations = BuilderOperations(catalog)
            val selected = powers.take(3).mapIndexed { i, power -> decision(power, ChoiceSlotId("class", atWill, i)) }
            val doc = character(root, selected)
            val broken = operations.apply(doc, BuilderEdit.ReplacePower(1, selected[0].slot, "human3"))
            assertFalse(broken.applied)
            assertEquals(doc, broken.state.document)
            val changed = operations.apply(doc, BuilderEdit.ReplacePower(1, selected[1].slot, "human3"))
            assertTrue(changed.applied, changed.diagnostics.toString())
            assertEquals(selected[1].instanceId, changed.state.rules.entries.single { it.slot == selected[1].slot }.instanceId)
            assertEquals(1, changed.state.document.levels.single().replacements.size)
            assertEquals("human1", changed.state.document.levels.single().entries.single { it.slot == selected[1].slot }.selection.entryId)
            assertEquals("human3", changed.state.document.levels.single().replacements.single().replacement.selection.entryId)
            val forced = operations.apply(doc, BuilderEdit.ReplacePower(1, selected[0].slot, "human3", acceptIneligible = true))
            assertTrue(forced.applied)
            assertTrue(forced.state.rules.diagnostics.any { it.code == "engine.keywordCount" })
        }.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) { completed = result }
        })
        checkNotNull(completed).getOrThrow()
    }

    @Test
    fun replacementMilestonesCanChangeTargetAndEarlierEditsCannotBorrowLaterHistory() {
        var completed: Result<Unit>? = null
        suspend {
            val oldA = power("old-a", usage = "DAILY")
            val oldB = power("old-b", usage = "DAILY")
            val nine = power("nine", usage = "DAILY", level = 9)
            val alternative = power("alternative", usage = "DAILY", level = 9)
            val nineteen = power("nineteen", usage = "DAILY", level = 19)
            val requiresLaterAbility = power("requires-later", usage = "DAILY", level = 9).let {
                it.copy(mechanics = it.mechanics.copy(prerequisites = listOf(Prerequisite.AbilityPoints(Ability.STRENGTH, 4))))
            }
            val root = root(listOf(query(daily, 2, "DAILY")))
            val definitions = listOf(root, oldA, oldB, nine, alternative, nineteen, requiresLaterAbility)
            val source = object : ContentSource {
                override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(formatVersion = 2,
                    id = supplier.packageId, revision = supplier.revision, title = "Power tests", indexes = listOf("index"), chunks = listOf("entries"))))
                override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
                    definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, "entries") }))
                override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(EntryChunk("entries", definitions))
            }
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, supplier.packageId, emptyList())).value
            val operations = BuilderOperations(catalog)
            val first = decision(oldA, ChoiceSlotId("class", daily, 0))
            val second = decision(oldB, ChoiceSlotId("class", daily, 1))
            val initial = character(root, listOf(first, second), 19)
            val lateHistory = Replacement(first.slot, decision(nineteen, first.slot), ReplacementKind.PROGRESSION)
            val document = initial.copy(levels = initial.levels + listOf(
                LevelDecisions(4, abilityAdvancements = listOf(AbilityAdvancement(AdvancementRules.abilitySlot(4), mapOf(Ability.STRENGTH to 1)))),
                LevelDecisions(9, replacements = listOf(Replacement(first.slot, decision(nine, first.slot), ReplacementKind.PROGRESSION))),
                LevelDecisions(12, abilityAdvancements = listOf(AbilityAdvancement(AdvancementRules.abilitySlot(12), mapOf(Ability.STRENGTH to 1)))),
                LevelDecisions(19, replacements = listOf(lateHistory))))
            val importedInvalid = document.copy(levels = document.levels.map { row ->
                if (row.level == 9) row.copy(replacements = listOf(Replacement(first.slot, decision(nineteen, first.slot), ReplacementKind.PROGRESSION))) else row
            })
            assertTrue(evaluate(importedInvalid, definitions).diagnostics.any { it.code == "engine.replacementAcquisition" })
            val options = operations.replacementOptions(document, 9, first.slot)
            assertFalse(options.any { it.entry.entry.id == nineteen.id })
            assertEquals(Eligibility.INELIGIBLE, options.single { it.entry.entry.id == requiresLaterAbility.id }.eligibility)
            assertFalse(operations.apply(document, BuilderEdit.ReplacePower(9, first.slot, nineteen.id, ReplacementKind.PROGRESSION, true)).applied)
            assertFalse(operations.apply(document, BuilderEdit.ReplacePower(9, first.slot, requiresLaterAbility.id, ReplacementKind.PROGRESSION)).applied)
            assertTrue(operations.replacementOptions(document, 9, second.slot).any { it.entry.entry.id == alternative.id && it.eligibility == Eligibility.ELIGIBLE })
            val lowered = operations.apply(document, BuilderEdit.Level(1)).state
            assertEquals(document.levels, lowered.document.levels)
            assertEquals(oldA.id, lowered.rules.entries.single { it.slot == first.slot }.definition.entry.id)
            assertTrue(operations.replacementOptions(lowered.document, 9, second.slot).any {
                it.entry.entry.id == alternative.id && it.eligibility == Eligibility.ELIGIBLE
            })
            val planned = operations.apply(lowered.document,
                BuilderEdit.ReplacePower(9, second.slot, alternative.id, ReplacementKind.PROGRESSION))
            assertTrue(planned.applied, planned.diagnostics.toString())
            assertEquals(lowered.rules, planned.state.rules)
            val advanced = operations.apply(planned.state.document, BuilderEdit.Level(9)).state
            assertEquals(oldA.id, advanced.rules.entries.single { it.slot == first.slot }.definition.entry.id)
            assertEquals(alternative.id, advanced.rules.entries.single { it.slot == second.slot }.definition.entry.id)

            val changed = operations.apply(document, BuilderEdit.ReplacePower(9, second.slot, alternative.id, ReplacementKind.PROGRESSION))
            assertTrue(changed.applied, changed.diagnostics.toString())
            assertEquals(second.slot, changed.state.document.levels.single { it.level == 9 }.replacements.single().replaces)
            assertEquals(listOf(lateHistory), changed.state.document.levels.single { it.level == 19 }.replacements)
            assertEquals(nineteen.id, changed.state.rules.entries.single { it.slot == first.slot }.definition.entry.id)
            val cleared = operations.apply(changed.state.document, BuilderEdit.RemoveReplacement(9, second.slot))
            assertTrue(cleared.applied)
            assertTrue(cleared.state.document.levels.single { it.level == 9 }.replacements.isEmpty())
            assertEquals(listOf(lateHistory), cleared.state.document.levels.single { it.level == 19 }.replacements)
        }.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) { completed = result }
        })
        checkNotNull(completed).getOrThrow()
    }

    @Test
    fun oneEvaluationReadsEachChunkOnceAndNextEvaluationObservesUpdates() {
        var completed: Result<Unit>? = null
        suspend {
            val root = root(listOf(query(atWill, 2)))
            val powers = (1..30).map { power("power$it") }
            var definitions = powers + root
            var reads = 0
            val source = object : ContentSource {
                override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(formatVersion = 2,
                    id = supplier.packageId, revision = supplier.revision, title = "Power tests", indexes = listOf("index"), chunks = listOf("entries"))))
                override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
                    definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, "entries") }))
                override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> {
                    reads++
                    return ContractResult.Available(EntryChunk("entries", definitions))
                }
            }
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(ContentCatalog.open(source, supplier.packageId, emptyList())).value
            val doc = character(root, emptyList())
            val first = RulesContent.load(doc, catalog)
            assertEquals(1, reads, "A shared query must decode a shared chunk only once per evaluation")
            assertEquals(30, first.entries.size)
            definitions = definitions.map { if (it.id == "power1") it.copy(presentation = it.presentation.copy(description = "Changed source bytes")) else it }
            val next = RulesContent.load(doc, catalog)
            assertEquals(2, reads, "A later evaluation must read fresh source bytes")
            assertNotEquals(assertIs<ContractResult.Available<ResolvedEntry>>(first.entries.getValue("power1")).value.fingerprint,
                assertIs<ContractResult.Available<ResolvedEntry>>(next.entries.getValue("power1")).value.fingerprint)
        }.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) { completed = result }
        })
        checkNotNull(completed).getOrThrow()
    }

    @Test
    fun progressionReplacementUsesReplacementLevelWithoutExpandingOtherAcquisitionOrdinals() {
        val powers = listOf(power("old", usage = "DAILY"), power("late", usage = "DAILY", level = 9))
        val root = root(listOf(query(daily, 2, "DAILY")))
        val first = decision(powers[0], ChoiceSlotId("class", daily, 0))
        val second = decision(powers[0], ChoiceSlotId("class", daily, 1))
        val doc = character(root, listOf(first, second)).copy(level = 9)
        val replaced = doc.copy(levels = doc.levels + LevelDecisions(9, replacements = listOf(
            Replacement(first.slot, decision(powers[1], first.slot), ReplacementKind.PROGRESSION))))
        val result = evaluate(replaced, powers + root)
        assertEquals("late", result.entries.single { it.slot == first.slot }.definition.entry.id)
        assertTrue(result.choices.single { it.slot == first.slot }.entries.any { it.entryId == "late" })
        assertFalse(result.choices.single { it.slot == second.slot }.entries.any { it.entryId == "late" })
        assertFalse(result.diagnostics.any { it.code == "engine.replacementTiming" })
        assertFalse(result.diagnostics.any { it.code == "engine.choiceOption" && it.slot == first.slot })
        for (atLevel in AdvancementRules.dailyReplacementLevels) {
            val valid = doc.copy(level = atLevel, levels = doc.levels + LevelDecisions(atLevel, replacements = listOf(
                Replacement(first.slot, decision(powers[1], first.slot), ReplacementKind.PROGRESSION))))
            assertFalse(evaluate(valid, powers + root).diagnostics.any { it.code == "engine.replacementTiming" })
            val doubled = valid.copy(levels = valid.levels.map { row ->
                if (row.level == atLevel) row.copy(replacements = row.replacements +
                    Replacement(second.slot, decision(powers[1], second.slot), ReplacementKind.PROGRESSION)) else row
            })
            assertTrue(evaluate(doubled, powers + root).diagnostics.any {
                it.code == "engine.replacementTiming" && it.kind == DiagnosticKind.INVALID_SELECTION
            })
        }
    }

    @Test
    fun slotIssuesTypeReplacementTimingAndRemainingSelections() {
        val powers = listOf(power("old", usage = "DAILY"), power("late", usage = "DAILY", level = 9))
        val root = root(listOf(query(daily, 2, "DAILY")))
        val first = decision(powers[0], ChoiceSlotId("class", daily, 0))
        val second = decision(powers[0], ChoiceSlotId("class", daily, 1))
        val doc = character(root, listOf(first, second)).copy(level = 9)
        fun replaced(vararg slots: ChoiceSlotId) = doc.copy(levels = doc.levels + LevelDecisions(9, replacements = slots.map {
            Replacement(it, decision(powers[1], it), ReplacementKind.PROGRESSION)
        }))
        assertTrue(evaluate(replaced(first.slot), powers + root).slotIssues.isEmpty())
        val doubled = evaluate(replaced(first.slot, second.slot), powers + root)
        assertEquals(listOf<SlotIssue>(SlotIssue.Timing), doubled.slotIssues[first.slot])
        assertEquals(listOf<SlotIssue>(SlotIssue.Timing), doubled.slotIssues[second.slot])
        val retraining = doc.copy(levels = doc.levels + LevelDecisions(9, replacements = listOf(
            Replacement(first.slot, decision(powers[1], first.slot), ReplacementKind.RETRAINING))))
        assertNull(evaluate(retraining, powers + root).slotIssues[first.slot], "Unspecified retraining is incomplete, not mistimed")

        val pool = root(listOf(query(atWill, 3)))
        val partial = evaluate(character(pool, listOf(decision(power("human1"), ChoiceSlotId("class", atWill, 0)))),
            listOf(pool, power("human1")))
        assertEquals(mapOf(ChoiceSlotId("class", atWill, 0) to listOf<SlotIssue>(SlotIssue.Remaining(2))), partial.slotIssues)
    }

}
