package dev.modern4e.builder

import kotlin.test.*

/** The same observable distinct-choice behavior runs on JVM and JavaScript. */
class ProficiencySelectionTest {
    private val training = ContentEntry("training", EntryCategory.FEAT, Presentation("Skill Training"),
        Mechanics(version = 2, choices = listOf(ChoiceDefinition.Proficiencies("skills", 2, Skill.entries,
            distinctAgainstCharacter = true))), Coverage(CoverageStatus.SUPPORTED))
    private val fighter = ContentEntry("fighter", EntryCategory.CLASS, Presentation("Fighter"),
        Mechanics(version = 2, choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH)))),
        Coverage(CoverageStatus.SUPPORTED))
    private fun slot(source: String, choice: String, ordinal: Int = 0) = ChoiceSlotId(source, choice, ordinal)
    private fun saved(entry: ContentEntry) = SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry))
    private fun selected(entry: ContentEntry, instance: String, source: String, choice: String) =
        EntryChoice(instance, slot(source, choice), saved(entry))
    private fun trained(instance: String, ordinal: Int, skill: Skill) = ProficiencyChoice(slot(instance, "skills", ordinal), skill)
    private fun document(first: List<ProficiencyChoice>, second: List<ProficiencyChoice>? = null): CharacterDocument {
        val baseline = listOf(
            ProficiencyChoice(slot("background.environment.urban", "skill"), Skill.SOCIETY),
            ProficiencyChoice(slot("background.upbringing.labor", "skill"), Skill.CRAFTING),
            ProficiencyChoice(slot("creation", "free-skill"), Skill.MEDICINE),
            ProficiencyChoice(slot("creation", "free-skill", 1), Skill.RELIGION))
        return CharacterDocument(id = "distinct", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Distinct"),
            packages = emptyList(), level = if (second == null) 1 else 2,
            abilities = AbilityAllocation(slot("fighter", "main"), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.CONSTITUTION to 2, Ability.DEXTERITY to 2, Ability.INTELLIGENCE to 1)),
            levels = listOf(LevelDecisions(1, listOf(selected(fighter, "fighter", "creation", "class"),
                selected(training, "first", "creation", "feat")), baseline + first)) +
                if (second == null) emptyList() else listOf(LevelDecisions(2,
                    listOf(selected(training, "second", "advancement.2", "feat")), second)))
    }
    private fun evaluate(document: CharacterDocument, classDefinition: ContentEntry = fighter): EngineResult {
        val definitions = listOf(classDefinition, training).associateBy { it.id }
        fun resolved(entry: ContentEntry) = ContractResult.Available(ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry)))
        val content = RulesContent(definitions.mapValues { resolved(it.value) },
            document.levels.flatMap { it.entries }.associate { it.selection to resolved(definitions.getValue(it.selection.entryId)) })
        return RulesEngine.evaluate(document, content)
    }

    @Test
    fun twoNewSkillsAreEligibleAndPickerExcludesOtherSourcesAndSibling() {
        val document = document(listOf(trained("first", 0, Skill.ATHLETICS), trained("first", 1, Skill.ENDURANCE)))
        val result = evaluate(document)
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("first").status)
        val offered = result.choices.single { it.slot == slot("first", "skills") }.skills
        assertTrue(Skill.ATHLETICS in offered)
        assertFalse(Skill.ENDURANCE in offered)
        assertFalse(Skill.SOCIETY in offered)
        assertFalse(Skill.MEDICINE in offered)
        assertTrue(result.diagnostics.none { it.code == "engine.proficiencyDistinct" })
    }

    @Test
    fun backgroundAndWithinOccurrenceDuplicatesStaySavedButAreInvalid() {
        for (skills in listOf(listOf(Skill.SOCIETY, Skill.ATHLETICS), listOf(Skill.ATHLETICS, Skill.ATHLETICS))) {
            val document = document(skills.mapIndexed { index, skill -> trained("first", index, skill) })
            val result = evaluate(document)
            assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("first").status)
            assertTrue(result.diagnostics.any { it.code == "engine.proficiencyDistinct" })
            assertEquals(document, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(document))).value)
        }
    }

    @Test
    fun repeatedFeatCannotReuseEarlierSkillButLaterChoiceDoesNotInvalidateEarlierOccurrence() {
        val document = document(listOf(trained("first", 0, Skill.ATHLETICS), trained("first", 1, Skill.ENDURANCE)),
            listOf(trained("second", 0, Skill.ATHLETICS), trained("second", 1, Skill.ARCANA)))
        val result = evaluate(document)
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("first").status)
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("second").status)
        assertTrue(result.diagnostics.any { it.code == "engine.proficiencyDistinct" && it.slot?.sourceInstanceId == "second" })
        assertTrue(Skill.ATHLETICS !in result.choices.single { it.slot == slot("second", "skills") }.skills)
    }

    @Test
    fun exhaustionRequiresFullCountAndAutomaticClassProficienciesCount() {
        val classDefinition = fighter.copy(mechanics = fighter.mechanics.copy(grants = Skill.entries.dropLast(1).map {
            Grant.Proficiency("class-$it", it)
        }))
        val result = evaluate(document(emptyList()), classDefinition)
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("first").status)
        assertTrue(result.diagnostics.any { it.code == "engine.proficiencyExhausted" })
    }

    @Test
    fun laterAutomaticProficiencyDoesNotInvalidateEarlierTraining() {
        val classDefinition = fighter.copy(mechanics = fighter.mechanics.copy(progression = listOf(
            ClassProgression(2, grants = listOf(Grant.Proficiency("later-athletics", Skill.ATHLETICS))))))
        val result = evaluate(document(listOf(trained("first", 0, Skill.ATHLETICS), trained("first", 1, Skill.ENDURANCE)),
            listOf(trained("second", 0, Skill.ARCANA), trained("second", 1, Skill.INSIGHT))), classDefinition)
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("first").status)
        assertTrue(result.diagnostics.none { it.code == "engine.proficiencyDistinct" })
    }

    @Test
    fun defaultFalsePreservesLegacyWireFormatAndOrdinaryChoices() {
        val ordinary = ChoiceDefinition.Proficiencies("ordinary", 1, listOf(Skill.SOCIETY))
        val encoded = ContractCodec.json.encodeToString(ChoiceDefinition.serializer(), ordinary)
        assertFalse("distinctAgainstCharacter" in encoded)
        val rules = ProficiencySelectionRules(document(emptyList()), emptyList(), mapOf(Skill.SOCIETY to listOf(slot("other", "skill"))))
        assertEquals(listOf(Skill.SOCIETY), rules.skills(slot("first", "ordinary"), ordinary))
    }
}
