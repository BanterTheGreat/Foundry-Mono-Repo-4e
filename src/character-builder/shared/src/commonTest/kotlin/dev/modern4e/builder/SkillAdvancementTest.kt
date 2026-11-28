package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** 2.0 Skill Points: pools, prices, rank caps, expiry, replay after earlier changes and the saved decisions. */
class SkillAdvancementTest {
    private fun raise(skill: Skill, rank: SkillRank) = SkillIncrease(skill, rank)

    private fun grant(skill: Skill, rank: SkillRank, level: Int = 1) = SkillGrant(skill, rank, level)

    /** Four starting Trained skills and a theme's Novice skill. */
    private val starting = listOf(grant(Skill.ATHLETICS, SkillRank.TRAINED), grant(Skill.ACROBATICS, SkillRank.TRAINED),
        grant(Skill.ENDURANCE, SkillRank.TRAINED), grant(Skill.INSIGHT, SkillRank.TRAINED),
        grant(Skill.CULTURE, SkillRank.NOVICE))

    private fun List<SkillIncreaseStep>.at(level: Int) = single { it.level == level }

    @Test
    fun milestonesGrantTheirOwnPoolsAndTierCaps() {
        val pools = AdvancementRules.schedule.mapNotNull { row -> row.skillPoints?.let { row.level to (it.points to it.cap) } }
        assertEquals(listOf(4 to (3 to SkillRank.EXPERT), 8 to (3 to SkillRank.EXPERT), 11 to (5 to SkillRank.ADEPT),
            14 to (5 to SkillRank.ADEPT), 18 to (5 to SkillRank.ADEPT), 21 to (8 to SkillRank.MASTER),
            24 to (8 to SkillRank.MASTER), 28 to (8 to SkillRank.MASTER)), pools)
        assertEquals(pools.map { it.first }, SkillAdvancement.levels)
        for (level in 1..30) {
            assertEquals(level in SkillAdvancement.levels,
                AdvancementRules.rootSlot(level, SlotCategory.SkillIncrease) != null, "level $level")
        }
    }

    @Test
    fun promotionsCostOneTwoThreeFiveAndEight() {
        assertEquals(listOf(1, 2, 3, 5, 8),
            SkillRank.entries.zipWithNext { from, to -> SkillAdvancement.cost(from, to) })
        assertEquals(3, SkillAdvancement.cost(SkillRank.UNTRAINED, SkillRank.TRAINED))
        assertEquals(8, SkillAdvancement.cost(SkillRank.TRAINED, SkillRank.ADEPT))
    }

    @Test
    fun aPoolCanBeSplitOrSpentOnSuccessiveRanks() {
        val split = SkillAdvancement.step(4, mapOf(Skill.CULTURE to SkillRank.NOVICE),
            listOf(raise(Skill.CULTURE, SkillRank.TRAINED), raise(Skill.STEALTH, SkillRank.NOVICE)))
        assertEquals(3, split.spent)
        assertEquals(0, split.left)
        assertEquals(emptyList(), split.issues)
        assertFalse(split.needsAttention)

        val successive = SkillAdvancement.step(4, emptyMap(), listOf(raise(Skill.STEALTH, SkillRank.TRAINED)))
        assertEquals(3, successive.spent)
        assertEquals(SkillRank.TRAINED, successive.rankAfter(Skill.STEALTH))

        val paragon = SkillAdvancement.step(11, mapOf(Skill.ARCANA to SkillRank.TRAINED),
            listOf(raise(Skill.ARCANA, SkillRank.EXPERT), raise(Skill.NATURE, SkillRank.TRAINED)))
        assertEquals(listOf(3, 3), paragon.purchases.map { it.cost })
        assertEquals(listOf(SkillIncreaseIssue.OverBudget(6, 5)), paragon.issues)
    }

    @Test
    fun ranksAboveTheTierCapAreFlaggedAndNotApplied() {
        val step = SkillAdvancement.step(4, mapOf(Skill.ARCANA to SkillRank.EXPERT), listOf(raise(Skill.ARCANA, SkillRank.ADEPT)))
        assertEquals(listOf(SkillIncreaseIssue.AboveCap(Skill.ARCANA, SkillRank.ADEPT, SkillRank.EXPERT)), step.issues)
        assertEquals(SkillRank.EXPERT, step.rankAfter(Skill.ARCANA))
        assertEquals(0, step.spent)
    }

    @Test
    fun leftoverPointsKeepALevelOpenOnlyWhileTheyCanBuySomething() {
        val untouched = SkillAdvancement.step(4, emptyMap(), emptyList())
        assertTrue(untouched.canAfford)
        // One point left still buys Novice.
        assertTrue(SkillAdvancement.step(4, mapOf(Skill.ARCANA to SkillRank.NOVICE),
            listOf(raise(Skill.ARCANA, SkillRank.TRAINED))).needsAttention)
        // With no Untrained skill left, one point buys nothing: a Novice promotion costs 2.
        val crowded = Skill.catalog.associateWith { SkillRank.NOVICE }
        val stuck = SkillAdvancement.step(4, crowded, listOf(raise(Skill.ARCANA, SkillRank.TRAINED)))
        assertEquals(1, stuck.left)
        assertFalse(stuck.canAfford)
        assertFalse(stuck.needsAttention)
    }

    @Test
    fun unspentPointsNeverCarryToTheNextMilestone() {
        val steps = SkillAdvancement.replay(starting, mapOf(8 to listOf(raise(Skill.ATHLETICS, SkillRank.EXPERT),
            raise(Skill.STEALTH, SkillRank.NOVICE))))
        assertEquals(3, steps.at(4).left)
        assertEquals(3, steps.at(8).pool)
        assertEquals(listOf(SkillIncreaseIssue.OverBudget(4, 3)), steps.at(8).issues)
    }

    @Test
    fun theRulebookExampleReplaysThroughLevelFourteen() {
        val steps = SkillAdvancement.replay(starting, mapOf(
            4 to listOf(raise(Skill.ATHLETICS, SkillRank.EXPERT)),
            8 to listOf(raise(Skill.ENDURANCE, SkillRank.EXPERT)),
            11 to listOf(raise(Skill.ATHLETICS, SkillRank.ADEPT)),
            14 to listOf(raise(Skill.INSIGHT, SkillRank.EXPERT), raise(Skill.CULTURE, SkillRank.TRAINED))), through = 14)
        assertEquals(listOf(4, 8, 11, 14), steps.map { it.level })
        assertTrue(steps.all { it.issues.isEmpty() && it.left == 0 })
        assertEquals(SkillRank.ADEPT, steps.last().rankAfter(Skill.ATHLETICS))
        assertEquals(SkillRank.TRAINED, steps.last().rankAfter(Skill.CULTURE))
        assertEquals(SkillRank.TRAINED, steps.last().rankAfter(Skill.ACROBATICS))
    }

    @Test
    fun anEarlierChangeRepricesLaterIncreasesAndKeepsTheirRanks() {
        val later = mapOf(11 to listOf(raise(Skill.ATHLETICS, SkillRank.ADEPT)),
            14 to listOf(raise(Skill.STEALTH, SkillRank.TRAINED), raise(Skill.NATURE, SkillRank.NOVICE)))
        val before = SkillAdvancement.replay(starting, later + (4 to listOf(raise(Skill.ATHLETICS, SkillRank.EXPERT))))
        assertEquals(emptyList(), before.at(11).issues)

        val after = SkillAdvancement.replay(starting, later)
        assertEquals(8, after.at(11).spent)
        assertEquals(listOf(SkillIncreaseIssue.OverBudget(8, 5)), after.at(11).issues)
        // The saved rank still counts, so the problem stays on the one milestone.
        assertEquals(SkillRank.ADEPT, after.at(14).rankBefore(Skill.ATHLETICS))
        assertEquals(emptyList(), after.at(14).issues)
    }

    @Test
    fun anIncreaseTheCharacterAlreadyHasIsFlaggedAtNoCost() {
        val steps = SkillAdvancement.replay(starting + grant(Skill.STEALTH, SkillRank.TRAINED, level = 6),
            mapOf(8 to listOf(raise(Skill.STEALTH, SkillRank.TRAINED))))
        assertEquals(listOf(SkillIncreaseIssue.AlreadyHeld(Skill.STEALTH, SkillRank.TRAINED)), steps.at(8).issues)
        assertEquals(0, steps.at(8).spent)
        // A grant acquired later does not reach back to an earlier milestone.
        assertEquals(SkillRank.UNTRAINED, steps.at(4).rankBefore(Skill.STEALTH))
    }

    private fun entry(id: String, category: EntryCategory, mechanics: Mechanics = Mechanics()) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))

    private val warlord = entry("warlord", EntryCategory.CLASS, Mechanics(
        choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH))),
        grants = listOf(Grant.Proficiency(ModernCreation.CLASS_SKILL_CHOICE, Skill.COMMAND))))
    private val schooled = entry("schooled", EntryCategory.FEAT,
        Mechanics(version = 2, prerequisites = listOf(Prerequisite.Proficiency(Skill.NATURE))))

    private fun resolved(entry: ContentEntry) = ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry))

    private fun selected(entry: ContentEntry, instance: String, slot: ChoiceSlotId) =
        EntryChoice(instance, slot, SavedSelection(entry.id, entry.id, "standard", ContractCodec.fingerprint(entry)))

    /** A Warlord with Command, three free Trained skills and optionally a feat taken at [featLevel]. */
    private fun character(level: Int, increases: Map<Int, List<SkillIncrease>> = emptyMap(), featLevel: Int? = null) =
        CharacterDocument(
            id = "points", savedAt = "2026-11-28T10:00:00Z", identity = CharacterIdentity("Points"), packages = emptyList(),
            level = level,
            abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, mapOf(Ability.STRENGTH to 4,
                Ability.DEXTERITY to 2, Ability.CONSTITUTION to 0, Ability.INTELLIGENCE to 2, Ability.WISDOM to 0,
                Ability.CHARISMA to 1)),
            levels = (1..maxOf(level, increases.keys.maxOrNull() ?: 1)).map { number ->
                LevelDecisions(number,
                    entries = listOfNotNull(
                        selected(warlord, "class", AdvancementRules.classSlot).takeIf { number == 1 },
                        featLevel?.takeIf { it == number }?.let {
                            selected(schooled, "feat", requireNotNull(AdvancementRules.rootSlot(it, EntryCategory.FEAT)))
                        }),
                    proficiencies = if (number == 1) {
                        listOf(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH).mapIndexed { index, skill ->
                            ProficiencyChoice(ModernCreation.freeSkillSlot(index), skill)
                        }
                    } else {
                        emptyList()
                    },
                    skillIncreases = increases[number].orEmpty())
            })

    private fun evaluate(document: CharacterDocument): EngineResult {
        val all = listOf(warlord, schooled).associateBy { it.id }
        return RulesEngine.evaluate(document, RulesContent(all.mapValues { ContractResult.Available(resolved(it.value)) },
            document.levels.flatMap { it.entries }.associate { it.selection to
                ContractResult.Available(resolved(all.getValue(it.selection.entryId))) }))
    }

    private fun EngineResult.offer(level: Int) = choices.single { it.slot == SkillAdvancement.slot(level) }

    private fun EngineResult.bonus(skill: Skill) =
        assertIs<ContractResult.Available<CalculatedValue>>(displayedSkill(skill)).value.total

    private fun EngineResult.codes(level: Int) =
        diagnostics.filter { it.slot == SkillAdvancement.slot(level) }.map { it.code }

    @Test
    fun reachedIncreasesRaiseRanksAndSkillTotals() {
        val result = evaluate(character(8, mapOf(4 to listOf(raise(Skill.ARCANA, SkillRank.EXPERT)),
            8 to listOf(raise(Skill.NATURE, SkillRank.TRAINED)))))

        assertEquals(SkillRank.EXPERT, result.skillRank(Skill.ARCANA))
        assertEquals(SkillRank.TRAINED, result.skillRank(Skill.NATURE))
        // Half level 4 plus the rank bonus.
        assertEquals(9, result.bonus(Skill.ARCANA))
        assertEquals(7, result.bonus(Skill.NATURE))
        assertEquals(9, assertIs<ContractResult.Available<CalculatedValue>>(result.skill(Skill.ARCANA)).value.total)
        assertEquals(listOf(4, 8), result.skillIncreases.map { it.level })
        assertTrue(listOf(4, 8).all { result.offer(it).filled })
    }

    @Test
    fun anUntouchedOrPartlySpentMilestoneStaysRequired() {
        val result = evaluate(character(8, mapOf(8 to listOf(raise(Skill.CULTURE, SkillRank.NOVICE)))))

        assertTrue(result.offer(4).missing)
        assertTrue(result.offer(8).missing)
        assertEquals(listOf("engine.unspentSkillPoints"), result.codes(4))
        assertEquals("Spend the level 8 Skill Points: 2 left.",
            result.diagnostics.single { it.slot == SkillAdvancement.slot(8) }.message)
        assertEquals(SkillRank.NOVICE, result.skillRank(Skill.CULTURE))
        assertEquals(setOf(Skill.CULTURE), result.noviceSkills.keys)
    }

    @Test
    fun anIllegalMilestoneReportsWhyAndStaysRequired() {
        val result = evaluate(character(8, mapOf(4 to listOf(raise(Skill.ARCANA, SkillRank.ADEPT)),
            8 to listOf(raise(Skill.COMMAND, SkillRank.TRAINED)))))

        assertEquals(listOf("engine.skillRankCap"), result.codes(4))
        assertEquals(listOf("engine.skillRankHeld"), result.codes(8))
        assertTrue(result.offer(4).missing && result.offer(8).missing)
        assertEquals(SkillRank.TRAINED, result.skillRank(Skill.ARCANA))
    }

    @Test
    fun plansAboveTheCharacterLevelStaySavedWithoutEffect() {
        val plans = mapOf(4 to listOf(raise(Skill.ARCANA, SkillRank.EXPERT)), 11 to listOf(raise(Skill.ARCANA, SkillRank.ADEPT)))
        val lowered = character(4, plans)
        val result = evaluate(lowered)

        assertEquals(SkillRank.EXPERT, result.skillRank(Skill.ARCANA))
        assertEquals(listOf(4), result.skillIncreases.map { it.level })
        assertEquals(plans, lowered.skillIncreaseDecisions())
        assertEquals(SkillRank.ADEPT, evaluate(lowered.copy(level = 11)).skillRank(Skill.ARCANA))
        // Grants plus every saved plan price the upcoming milestone without raising the character's level.
        val upcoming = SkillAdvancement.replay(result.skillGrants, lowered.skillIncreaseDecisions()).at(11)
        assertEquals(5, upcoming.spent)
        assertEquals(emptyList(), upcoming.issues)
    }

    @Test
    fun trainingBoughtWithPointsMeetsTrainedPrerequisitesFromItsLevel() {
        val bought = mapOf(4 to listOf(raise(Skill.NATURE, SkillRank.TRAINED)))
        fun status(document: CharacterDocument) = evaluate(document).entryEligibility.getValue("feat").status

        assertEquals(Eligibility.ELIGIBLE, status(character(6, bought, featLevel = 6)))
        assertEquals(Eligibility.ELIGIBLE, status(character(4, bought, featLevel = 4)))
        // A feat taken before the increase cannot rely on it.
        assertEquals(Eligibility.INELIGIBLE, status(character(6, bought, featLevel = 2)))
        assertEquals(Eligibility.INELIGIBLE,
            status(character(6, mapOf(4 to listOf(raise(Skill.NATURE, SkillRank.NOVICE))), featLevel = 6)))
        val result = evaluate(character(4, bought))
        assertEquals(listOf(SkillAdvancement.slot(4)), result.proficiencies.getValue(Skill.NATURE))
        assertEquals(Skill.catalog, result.choices.single { it.slot == ModernCreation.freeSkillSlot(0) }.skills)
    }

    @Test
    fun increasesSurviveExportAndReopenAndOldSavesStayUnchanged() {
        val document = character(8, mapOf(8 to listOf(raise(Skill.NATURE, SkillRank.TRAINED))))
        val text = ContractCodec.encode(document)

        assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(text)).value)
        assertFalse("skillIncreases" in ContractCodec.encode(character(8)))
        assertFailsWith<IllegalArgumentException> {
            LevelDecisions(4, skillIncreases = listOf(raise(Skill.NATURE, SkillRank.NOVICE), raise(Skill.NATURE, SkillRank.TRAINED)))
        }
    }

    @Test
    fun editingReplacesAMilestoneAndRejectsIllegalSpending() = synchronous {
        val operations = operations()
        suspend fun apply(document: CharacterDocument, level: Int, vararg increases: SkillIncrease) =
            operations.apply(document, BuilderEdit.SkillIncreases(level, increases.toList()))
        val start = character(8)

        val bought = apply(start, 4, raise(Skill.ARCANA, SkillRank.EXPERT))
        assertTrue(bought.applied)
        assertEquals(SkillRank.EXPERT, bought.state.rules.skillRank(Skill.ARCANA))

        for (rejected in listOf(
            apply(start, 5, raise(Skill.ARCANA, SkillRank.EXPERT)),
            apply(start, 4, raise(Skill.NATURE, SkillRank.EXPERT)),
            apply(start, 4, raise(Skill.ARCANA, SkillRank.ADEPT)),
            apply(start, 4, raise(Skill.COMMAND, SkillRank.TRAINED)),
            apply(start, 4, raise(Skill.PERCEPTION, SkillRank.NOVICE)),
        )) {
            assertFalse(rejected.applied)
            assertEquals(start, rejected.state.document)
        }

        val cleared = apply(bought.state.document, 4)
        assertTrue(cleared.applied)
        assertEquals(emptyMap(), cleared.state.document.skillIncreaseDecisions())
    }

    @Test
    fun anUpcomingMilestoneCanBePlannedAndEarlierEditsCanBreakIt() = synchronous {
        val operations = operations()
        val first = operations.apply(character(4), BuilderEdit.SkillIncreases(4, listOf(raise(Skill.ARCANA, SkillRank.EXPERT))))
        val planned = operations.apply(first.state.document,
            BuilderEdit.SkillIncreases(11, listOf(raise(Skill.ARCANA, SkillRank.ADEPT))))
        assertTrue(planned.applied)
        assertEquals(4, planned.state.document.level)

        // Clearing level 4 is allowed even though it leaves the level 11 plan over budget.
        val cleared = operations.apply(planned.state.document, BuilderEdit.SkillIncreases(4, emptyList()))
        assertTrue(cleared.applied)
        val reopened = SkillAdvancement.replay(cleared.state.rules.skillGrants,
            cleared.state.document.skillIncreaseDecisions()).at(11)
        assertEquals(listOf(SkillIncreaseIssue.OverBudget(8, 5)), reopened.issues)
    }

    private suspend fun operations(): BuilderOperations {
        val definitions = listOf(warlord, schooled)
        val source = object : ContentSource {
            override suspend fun listPackages() = ContractResult.Available(listOf(PackageManifest(
                id = "standard", revision = "1", title = "Standard", indexes = listOf("index"), chunks = listOf("chunk"))))
            override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(ContentIndex(
                definitions.map { EntryMetadata(it.id, it.category, it.presentation.title, "chunk") }))
            override suspend fun loadChunk(packageId: String, chunkId: String) =
                ContractResult.Available(EntryChunk("chunk", definitions))
        }
        return BuilderOperations(assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(source, "standard", emptyList())).value)
    }

    private fun synchronous(block: suspend () -> Unit) {
        var completed = false
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                result.getOrThrow()
                completed = true
            }
        })
        assertTrue(completed)
    }
}
