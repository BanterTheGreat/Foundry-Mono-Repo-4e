package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** The 2.0 skill catalog, skill totals and level 1 class, free and theme skill choices. */
class SkillRulesTest {
    private val classSlot = ChoiceSlotId("creation", "class", 0)
    private val themeSlot = ChoiceSlotId("creation", "theme", 0)
    private val featSlot = ChoiceSlotId("creation", "feat", 0)
    private val classSkill = ChoiceSlotId("class", ModernCreation.CLASS_SKILL_CHOICE, 0)
    private val themeSkill = ChoiceSlotId("theme", ModernCreation.THEME_SKILL_CHOICE, 0)

    private fun entry(id: String, category: EntryCategory, mechanics: Mechanics = Mechanics()) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))

    private val mainAbility = ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH))
    private val fighter = entry("fighter", EntryCategory.CLASS, Mechanics(choices = listOf(mainAbility,
        ChoiceDefinition.Proficiencies(ModernCreation.CLASS_SKILL_CHOICE, 1, listOf(Skill.ATHLETICS, Skill.ACROBATICS)))))
    private val warlord = entry("warlord", EntryCategory.CLASS, Mechanics(choices = listOf(mainAbility),
        grants = listOf(Grant.Proficiency(ModernCreation.CLASS_SKILL_CHOICE, Skill.COMMAND))))

    private fun theme(id: String, vararg skills: Skill) = entry(id, EntryCategory.THEME, Mechanics(choices = listOf(
        ChoiceDefinition.Proficiencies(ModernCreation.THEME_SKILL_CHOICE, 1, skills.toList(), rank = SkillRank.NOVICE))))

    private val docker = theme("docker", Skill.STREETWISE, Skill.CULTURE)
    private val veteran = theme("veteran", Skill.ENDURANCE, Skill.COMMAND)

    private fun resolved(entry: ContentEntry) = ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry))

    private fun selected(entry: ContentEntry, instance: String, slot: ChoiceSlotId) =
        EntryChoice(instance, slot, SavedSelection(entry.id, entry.id, "standard", ContractCodec.fingerprint(entry)))

    private fun classPick(skill: Skill) = ProficiencyChoice(classSkill, skill)

    private fun novice(skill: Skill) = ProficiencyChoice(themeSkill, skill)

    private fun free(vararg skills: Skill) = skills.mapIndexed { index, skill ->
        ProficiencyChoice(ModernCreation.freeSkillSlot(index), skill)
    }

    private val startingFighter = listOf(classPick(Skill.ATHLETICS)) + free(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH)

    private fun character(skills: List<ProficiencyChoice>, classEntry: ContentEntry = fighter,
        themeEntry: ContentEntry? = docker, feat: ContentEntry? = null, level: Int = 1) = CharacterDocument(
        id = "skills", savedAt = "2026-11-28T10:00:00Z", identity = CharacterIdentity("Skills"), packages = emptyList(),
        level = level,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, mapOf(Ability.STRENGTH to 4,
            Ability.DEXTERITY to 2, Ability.CONSTITUTION to 0, Ability.INTELLIGENCE to 2, Ability.WISDOM to 0,
            Ability.CHARISMA to 1)),
        levels = listOf(LevelDecisions(1, entries = listOfNotNull(selected(classEntry, "class", classSlot),
            themeEntry?.let { selected(it, "theme", themeSlot) }, feat?.let { selected(it, "feat", featSlot) }),
            proficiencies = skills)) + (2..level).map(::LevelDecisions),
    )

    private fun evaluate(document: CharacterDocument, vararg extra: ContentEntry): EngineResult {
        val all = (listOf(fighter, warlord, docker, veteran) + extra).associateBy { it.id }
        return RulesEngine.evaluate(document, RulesContent(all.mapValues { ContractResult.Available(resolved(it.value)) },
            document.levels.flatMap { it.entries }.associate { it.selection to
                ContractResult.Available(resolved(all.getValue(it.selection.entryId))) }))
    }

    private fun EngineResult.offer(slot: ChoiceSlotId) = choices.single { it.slot == slot }

    private fun EngineResult.invalidSlots() = diagnostics.filter { it.kind == DiagnosticKind.INVALID_SELECTION }
        .mapNotNull { it.slot }.toSet()

    private fun value(result: ContractResult<CalculatedValue>) = assertIs<ContractResult.Available<CalculatedValue>>(result).value

    @Test
    fun catalogHoldsTheSixteenSkillsAndReadsRetiredIdentifiersAsTheirSuccessors() {
        assertEquals(listOf("Athletics", "Acrobatics", "Endurance", "Stealth", "Finesse", "Arcana", "Occultism",
            "Crafting", "Medicine", "Nature", "Culture", "Religion", "Insight", "Streetwise", "Deception", "Command"),
            Skill.catalog.map { it.title })
        assertEquals(mapOf(Skill.THIEVERY to Skill.FINESSE, Skill.SOCIETY to Skill.CULTURE,
            Skill.BLUFF to Skill.DECEPTION, Skill.INTIMIDATE to Skill.COMMAND, Skill.PERCEPTION to null,
            Skill.DIPLOMACY to null), (Skill.entries - Skill.catalog.toSet()).associateWith { it.current })
        assertEquals(listOf(0, 1, 3, 5, 7, 9), SkillRank.entries.map { it.bonus })
        val result = evaluate(character(startingFighter))
        assertEquals(Skill.catalog.toSet(),
            result.statistics.keys.filter { it.statistic == Statistic.SKILL_CHECK }.map { it.skill }.toSet())
    }

    @Test
    fun aSkillTotalIsHalfLevelTheRankBonusAndOtherBonusesWithoutAnAbility() {
        val document = character(free(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH), warlord, level = 5).copy(
            manualAdjustments = listOf(ManualAdjustment("banner",
                TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.COMMAND), ModifierOperation.ADD, 2))))
        val result = evaluate(document)
        val command = value(result.displayedSkill(Skill.COMMAND))

        // Half level 2, Trained +3 and the skill's own +2.
        assertEquals(7, command.total)
        assertEquals(listOf("Half level" to 2, SKILL_RANK_LABEL to 3, "Manual Adjustment" to 2).toSet(),
            command.contributors.map { it.label to it.value }.toSet())
        assertEquals(7, value(result.skill(Skill.COMMAND)).total)
        assertEquals(2, value(result.displayedSkill(Skill.ATHLETICS)).total)

        val stronger = evaluate(document.copy(abilities = document.abilities.copy(points = Ability.entries.associateWith { 4 })))
        assertEquals(Skill.catalog.map { value(result.displayedSkill(it)).total },
            Skill.catalog.map { value(stronger.displayedSkill(it)).total })
    }

    @Test
    fun aSingleClassSkillIsGrantedAndIntelligenceAddsNoPicks() {
        val result = evaluate(character(emptyList(), warlord))
        assertEquals(setOf(Skill.COMMAND), result.proficiencies.keys)
        assertTrue(result.choices.none { it.slot == classSkill })
        assertEquals((0..2).map(ModernCreation::freeSkillSlot),
            result.choices.filter { it.skillRank == SkillRank.TRAINED }.map { it.slot })
        val clever = character(emptyList(), warlord).let { it.copy(abilities = it.abilities.copy(
            points = it.abilities.points + mapOf(Ability.INTELLIGENCE to 3, Ability.DEXTERITY to 2, Ability.CHARISMA to 0))) }
        assertEquals(3, evaluate(clever).choices.count { it.skillRank == SkillRank.TRAINED })
    }

    @Test
    fun theClassPickAndThreeFreePicksMustAllDiffer() {
        val result = evaluate(character(startingFighter))
        assertEquals(listOf(Skill.ATHLETICS, Skill.ACROBATICS), result.offer(classSkill).skills)
        assertEquals(setOf(Skill.ATHLETICS, Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH), result.proficiencies.keys)
        assertEquals(3, value(result.displayedSkill(Skill.STEALTH, rank = SkillRank.TRAINED))
            .contributors.single { it.label == SKILL_RANK_LABEL }.value)

        val repeated = evaluate(character(listOf(classPick(Skill.ATHLETICS)) + free(Skill.ATHLETICS, Skill.INSIGHT, Skill.INSIGHT)))
        assertEquals(setOf(ModernCreation.freeSkillSlot(0), ModernCreation.freeSkillSlot(2)),
            repeated.diagnostics.filter { it.code == "engine.startingSkillDistinct" }.map { it.slot }.toSet())

        val outsideClass = evaluate(character(listOf(classPick(Skill.ARCANA))))
        assertTrue(classSkill in outsideClass.invalidSlots())
        assertFalse(Skill.ARCANA in outsideClass.proficiencies)
    }

    @Test
    fun theNovicePickWaitsForAllFourTrainedSkills() {
        for (skills in listOf(startingFighter.drop(1), startingFighter.dropLast(1))) {
            val result = evaluate(character(skills + novice(Skill.CULTURE)))
            assertEquals(emptyList(), result.offer(themeSkill).skills)
            assertEquals(SkillRank.NOVICE, result.offer(themeSkill).skillRank)
            assertEquals(SkillRank.UNTRAINED, result.skillRank(Skill.CULTURE))
            assertTrue(themeSkill in result.invalidSlots())
        }
        val repeated = evaluate(character(startingFighter.dropLast(1) + ProficiencyChoice(ModernCreation.freeSkillSlot(2), Skill.ARCANA)))
        assertEquals(emptyList(), repeated.offer(themeSkill).skills)
    }

    @Test
    fun theNovicePickComesFromTheThemesUntrainedSkillsAndAddsOne() {
        val both = evaluate(character(startingFighter + novice(Skill.CULTURE)))
        assertEquals(listOf(Skill.STREETWISE, Skill.CULTURE), both.offer(themeSkill).skills)
        assertEquals(SkillRank.NOVICE, both.skillRank(Skill.CULTURE))
        assertEquals(setOf(Skill.CULTURE), both.noviceSkills.keys)
        assertEquals(1, value(both.skill(Skill.CULTURE)).total)
        assertFalse(themeSkill in both.invalidSlots())

        val oneTaken = listOf(classPick(Skill.ATHLETICS)) + free(Skill.STREETWISE, Skill.INSIGHT, Skill.STEALTH)
        assertEquals(listOf(Skill.CULTURE), evaluate(character(oneTaken)).offer(themeSkill).skills)
        val wrong = evaluate(character(oneTaken + novice(Skill.STREETWISE)))
        assertTrue(themeSkill in wrong.invalidSlots())
        assertEquals(SkillRank.TRAINED, wrong.skillRank(Skill.STREETWISE))
        assertTrue(wrong.noviceSkills.isEmpty())
    }

    @Test
    fun whenBothThemeSkillsAreTrainedEveryUntrainedSkillIsOffered() {
        val starting = listOf(classPick(Skill.ATHLETICS)) + free(Skill.STREETWISE, Skill.CULTURE, Skill.STEALTH)
        val result = evaluate(character(starting + novice(Skill.MEDICINE)))
        assertEquals(Skill.catalog - setOf(Skill.ATHLETICS, Skill.STREETWISE, Skill.CULTURE, Skill.STEALTH),
            result.offer(themeSkill).skills)
        assertEquals(12, result.offer(themeSkill).skills.size)
        assertEquals(SkillRank.NOVICE, result.skillRank(Skill.MEDICINE))
    }

    @Test
    fun changingTheThemeLeavesAStaleNovicePickInactiveUntilItFitsAgain() {
        val original = character(startingFighter + novice(Skill.CULTURE))
        val changed = original.copy(levels = listOf(original.levels.single().copy(entries =
            original.levels.single().entries.map { if (it.slot == themeSlot) selected(veteran, "theme", themeSlot) else it })))
        val result = evaluate(changed)
        assertEquals(listOf(Skill.ENDURANCE, Skill.COMMAND), result.offer(themeSkill).skills)
        assertEquals(SkillRank.UNTRAINED, result.skillRank(Skill.CULTURE))
        assertTrue(themeSkill in result.invalidSlots())
        assertEquals(original.levels.single().proficiencies, changed.levels.single().proficiencies)
        assertEquals(SkillRank.NOVICE, evaluate(original).skillRank(Skill.CULTURE))

        // A theme that is gone leaves nothing for the player to repair.
        val removed = evaluate(character(startingFighter + novice(Skill.CULTURE), themeEntry = null))
        assertTrue(removed.diagnostics.none { it.slot == themeSkill })
        assertTrue(removed.noviceSkills.isEmpty())
    }

    @Test
    fun changingTheClassRetiresItsPickAndRechecksTheOtherSkills() {
        val saved = listOf(classPick(Skill.ACROBATICS)) + free(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH) + novice(Skill.COMMAND)
        assertEquals(SkillRank.NOVICE, evaluate(character(saved, themeEntry = veteran)).skillRank(Skill.COMMAND))

        val warlordResult = evaluate(character(saved, warlord, veteran))
        assertEquals(setOf(Skill.COMMAND, Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH), warlordResult.proficiencies.keys)
        assertTrue(warlordResult.diagnostics.none { it.slot == classSkill })
        // The new class trains the old Novice pick, so that pick has to be made again.
        assertEquals(listOf(Skill.ENDURANCE), warlordResult.offer(themeSkill).skills)
        assertTrue(themeSkill in warlordResult.invalidSlots())

        val collision = evaluate(character(listOf(classPick(Skill.ACROBATICS)) + free(Skill.COMMAND, Skill.INSIGHT, Skill.STEALTH), warlord))
        assertTrue(ModernCreation.freeSkillSlot(0) in collision.invalidSlots())
    }

    @Test
    fun skillChoicesSurviveSaveAndReopen() {
        val document = character(startingFighter + novice(Skill.CULTURE), level = 3)
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(document))).value
        assertEquals(document, reopened)
        val before = evaluate(document)
        val after = evaluate(reopened)
        assertEquals(Skill.catalog.map(before::skillRank), Skill.catalog.map(after::skillRank))
        assertEquals(Skill.catalog.map { value(before.skill(it)).total }, Skill.catalog.map { value(after.skill(it)).total })
    }

    @Test
    fun retiredSavedPicksCountOnlyWhenTheSkillWasRenamed() {
        val document = character(listOf(classPick(Skill.ATHLETICS)) + free(Skill.SOCIETY, Skill.DIPLOMACY, Skill.STEALTH))
        val result = evaluate(document)
        assertEquals(setOf(Skill.ATHLETICS, Skill.CULTURE, Skill.STEALTH), result.proficiencies.keys)
        assertTrue(ModernCreation.freeSkillSlot(1) in result.invalidSlots())
        assertTrue(result.offer(ModernCreation.freeSkillSlot(1)).missing)
        assertFalse(result.offer(ModernCreation.freeSkillSlot(0)).missing)
        val text = ContractCodec.encode(document)
        assertTrue("\"DIPLOMACY\"" in text && "\"SOCIETY\"" in text)
    }

    @Test
    fun environmentAndUpbringingGrantNothingButStaySaved() {
        val backgrounds = listOf(
            ProficiencyChoice(ChoiceSlotId("background.environment.urban", "skill", 0), Skill.SOCIETY),
            ProficiencyChoice(ChoiceSlotId("background.upbringing.labor", "skill", 0), Skill.ENDURANCE))
        val document = character(startingFighter + backgrounds).let {
            it.copy(identity = it.identity.copy(environment = "urban", upbringing = "labor"))
        }
        val result = evaluate(document)
        assertFalse(ModernCreation.BACKGROUNDS_ENABLED)
        assertEquals(SkillRank.UNTRAINED, result.skillRank(Skill.CULTURE))
        assertEquals(SkillRank.UNTRAINED, result.skillRank(Skill.ENDURANCE))
        assertTrue(result.choices.none { it.slot.sourceInstanceId.startsWith("background.") })
        assertTrue(result.diagnostics.none { it.slot?.sourceInstanceId?.startsWith("background.") == true })
        val reopened = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(document))).value
        assertEquals("urban", reopened.identity.environment)
        assertTrue(reopened.levels.single().proficiencies.containsAll(backgrounds))
        assertEquals(5, ModernCreation.environments.size)
        assertEquals(6, ModernCreation.upbringings.size)
    }

    @Test
    fun onlyTrainedSkillsMeetPrerequisitesAndRemovedSkillsWaitForReview() {
        fun feat(prerequisite: Prerequisite) = entry("requires", EntryCategory.FEAT, Mechanics(prerequisites = listOf(prerequisite)))
        fun status(prerequisite: Prerequisite): EntryEligibility {
            val required = feat(prerequisite)
            return evaluate(character(startingFighter + novice(Skill.CULTURE), feat = required), required)
                .entryEligibility.getValue("feat")
        }
        assertEquals(Eligibility.ELIGIBLE, status(Prerequisite.Proficiency(Skill.ARCANA)).status)
        assertEquals(Eligibility.INELIGIBLE, status(Prerequisite.Proficiency(Skill.CULTURE)).status)
        assertEquals(Eligibility.INELIGIBLE, status(Prerequisite.Proficiency(Skill.SOCIETY)).status)
        val removed = status(Prerequisite.Proficiency(Skill.DIPLOMACY))
        assertEquals(Eligibility.INCOMPLETE, removed.status)
        assertEquals("Trained in Diplomacy, which is not a 2.0 skill",
            assertIs<UnmetCondition.Unadapted>(removed.unmet.single()).leaf.sourceText)
        assertEquals(Eligibility.ELIGIBLE, status(Prerequisite.AnyOf(listOf(
            Prerequisite.Proficiency(Skill.PERCEPTION), Prerequisite.Proficiency(Skill.INSIGHT)))).status)
    }

    @Test
    fun skillBonusOptionsDropRemovedSkillsAndShowNewNames() {
        val linguist = entry("linguist", EntryCategory.FEAT, Mechanics(choices = listOf(ChoiceDefinition.Values("bonus", 1,
            FactKind.SKILL_BONUS, listOf(ValueOption("DIPLOMACY", "Diplomacy"), ValueOption("INSIGHT", "Insight"),
                ValueOption("SOCIETY", "Society")), bonus = 2))))
        val base = character(startingFighter, feat = linguist)
        val slot = ChoiceSlotId("feat", "bonus", 0)
        val document = base.copy(levels = listOf(base.levels.single().copy(values = listOf(ValueChoice(slot, "SOCIETY")))))
        val result = evaluate(document, linguist)
        assertEquals(listOf("INSIGHT" to "Insight", "SOCIETY" to "Culture"),
            result.offer(slot).values.map { it.id to it.title })
        assertEquals(2, value(result.skill(Skill.CULTURE)).total)
        val removed = evaluate(base.copy(levels = listOf(base.levels.single().copy(
            values = listOf(ValueChoice(slot, "DIPLOMACY"))))), linguist)
        assertTrue(slot in removed.invalidSlots())
    }

    @Test
    fun skillTrainingRaisesANoviceSkillToTrained() {
        val training = entry("training", EntryCategory.FEAT, Mechanics(choices = listOf(
            ChoiceDefinition.Proficiencies("training", 2, Skill.catalog, distinctAgainstCharacter = true))))
        val picks = listOf(ProficiencyChoice(ChoiceSlotId("feat", "training", 0), Skill.CULTURE),
            ProficiencyChoice(ChoiceSlotId("feat", "training", 1), Skill.OCCULTISM))
        val result = evaluate(character(startingFighter + novice(Skill.CULTURE) + picks, feat = training), training)
        assertEquals(SkillRank.TRAINED, result.skillRank(Skill.CULTURE))
        assertEquals(SkillRank.TRAINED, result.skillRank(Skill.OCCULTISM))
        assertTrue(result.diagnostics.none { it.code == "engine.proficiencyDistinct" })
        assertFalse(themeSkill in result.invalidSlots())
        // Culture is only Novice, so it stays on offer beside the eleven other skills outside the starting four.
        val offered = result.offer(ChoiceSlotId("feat", "training", 0)).skills
        assertTrue(Skill.CULTURE in offered)
        assertFalse(Skill.ARCANA in offered)

        val starting = evaluate(character(startingFighter +
            ProficiencyChoice(ChoiceSlotId("feat", "training", 0), Skill.ARCANA), feat = training), training)
        assertTrue(ChoiceSlotId("feat", "training", 0) in starting.invalidSlots())
        assertFalse(ModernCreation.freeSkillSlot(0) in starting.invalidSlots())
    }

    @Test
    fun editsRefuseBackgroundsAndAnEarlyNovicePick() = synchronous {
        val operations = operations()
        val incomplete = character(startingFighter.dropLast(1))
        val early = operations.apply(incomplete, BuilderEdit.Proficiency(1, novice(Skill.CULTURE)))
        assertFalse(early.applied)
        assertEquals("Choose your four Trained skills first.", early.diagnostics.single().message)
        val filled = operations.apply(incomplete, BuilderEdit.Proficiency(1, startingFighter.last()))
        assertTrue(filled.applied, filled.diagnostics.toString())
        val chosen = operations.apply(filled.state.document, BuilderEdit.Proficiency(1, novice(Skill.CULTURE)))
        assertTrue(chosen.applied, chosen.diagnostics.toString())
        assertEquals(SkillRank.NOVICE, chosen.state.rules.skillRank(Skill.CULTURE))
        assertFalse(operations.apply(chosen.state.document,
            BuilderEdit.Background(BackgroundKind.ENVIRONMENT, "urban", Skill.SOCIETY)).applied)
    }

    private suspend fun operations(): BuilderOperations {
        val definitions = listOf(fighter, warlord, docker, veteran)
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
        var result: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) { result = value }
        })
        checkNotNull(result).getOrThrow()
    }
}
