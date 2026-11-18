package dev.modern4e.builder

import kotlin.test.*

/** Observable structured decision semantics, shared unchanged by JVM and JavaScript. */
class ValueChoicesTest {
    private fun slot(source: String, id: String, ordinal: Int = 0) = ChoiceSlotId(source, id, ordinal)
    private fun entry(id: String, category: EntryCategory = EntryCategory.FEAT, mechanics: Mechanics = Mechanics(version = 2)) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))
    private fun option(id: String) = ValueOption(id, id)
    private fun saved(entry: ContentEntry) = SavedSelection(entry.id, entry.id, "standard", ContractCodec.fingerprint(entry))
    private fun choose(entry: ContentEntry, instance: String, level: Int = 1, id: String = "feat") =
        EntryChoice(instance, slot(if (level == 1) "creation" else "advancement.2", id), saved(entry))
    private fun document(levels: List<LevelDecisions>) = CharacterDocument(id = "values", savedAt = "2026-11-18T12:00:00Z",
        identity = CharacterIdentity("Values", languages = "Any descriptive text"), packages = emptyList(), level = levels.maxOf { it.level },
        abilities = AbilityAllocation(slot("class", "main"), Ability.STRENGTH, emptyMap()), levels = levels)
    private fun evaluate(document: CharacterDocument, definitions: List<ContentEntry>): EngineResult {
        fun resolved(entry: ContentEntry) = ContractResult.Available(ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry)))
        val byId = definitions.associateBy { it.id }
        return RulesEngine.evaluate(document, RulesContent(byId.mapValues { resolved(it.value) },
            document.levels.flatMap { it.entries }.associate { it.selection to resolved(byId.getValue(it.selection.entryId)) }))
    }
    private val language = ChoiceDefinition.Values("languages", 3, FactKind.LANGUAGE,
        listOf("COMMON", "A", "B", "C", "D", "E", "F").map { option(it) }, distinctScope = FactScope.CHARACTER)
    private val ancestry = entry("ancestry", EntryCategory.ANCESTRY, Mechanics(version = 2,
        facts = listOf(FactGrant(FactKind.LANGUAGE, listOf("COMMON")))))
    private val linguist = entry("linguist", mechanics = Mechanics(version = 2, choices = listOf(language,
        ChoiceDefinition.Values("bonus", 1, FactKind.SKILL_BONUS, listOf("DIPLOMACY", "SOCIETY", "INSIGHT").map { option(it) },
            distinctScope = FactScope.ENTRY, allowRepeatWhenExhausted = true, bonus = 2, epicBonus = 3))))

    @Test fun languagesGrantNewDistinctFactsAndSkillBonusSurvivesPortableRoundTrip() {
        val values = listOf("A", "B", "C").mapIndexed { index, value -> ValueChoice(slot("first", "languages", index), value) } +
            ValueChoice(slot("first", "bonus"), "DIPLOMACY")
        val original = document(listOf(LevelDecisions(1, listOf(choose(ancestry, "origin", id = "ancestry"), choose(linguist, "first")), values = values)))
        val encoded = (ContractCodec.encodeChecked(original) as ContractResult.Available).value
        val reopened = (ContractCodec.decode(encoded) as ContractResult.Available).value
        assertEquals(original, reopened)
        val result = evaluate(reopened, listOf(ancestry, linguist))
        assertEquals(setOf("COMMON", "A", "B", "C"), result.facts.filter { it.kind == FactKind.LANGUAGE }.map { it.value }.toSet())
        assertTrue(result.statistics.getValue(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.DIPLOMACY)).modifiers.any {
            it.contribution.modifier.value == 2 && it.contribution.modifier.bonusType == BonusType.FEAT })
        assertFalse(result.diagnostics.any { it.code == "engine.valueOption" })
    }

    @Test fun repeatedAndKnownLanguageDecisionsRemainSavedButGrantNothing() {
        val values = listOf("COMMON", "A", "A").mapIndexed { index, value -> ValueChoice(slot("first", "languages", index), value) }
        val original = document(listOf(LevelDecisions(1, listOf(choose(ancestry, "origin", id = "ancestry"), choose(linguist, "first")), values = values)))
        val result = evaluate(original, listOf(ancestry, linguist))
        assertEquals(2, result.diagnostics.count { it.code == "engine.valueOption" })
        assertEquals(values, original.levels.single().values)
        assertEquals(setOf("COMMON", "A"), result.facts.filter { it.kind == FactKind.LANGUAGE }.map { it.value }.toSet())
    }

    @Test fun laterLanguagesNeverChangeEarlierEligibilityAndExhaustionBlocksNextOccurrence() {
        val first = linguist.copy(mechanics = linguist.mechanics.copy(choices = listOf(language.copy(options = language.options.take(4)))))
        val values = listOf("A", "B", "C").mapIndexed { index, value -> ValueChoice(slot("first", "languages", index), value) }
        val doc = document(listOf(LevelDecisions(1, listOf(choose(ancestry, "origin", id = "ancestry"), choose(first, "first")), values = values),
            LevelDecisions(2, listOf(choose(first, "second", 2)))))
        val result = evaluate(doc, listOf(ancestry, first))
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("first").status)
        assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("second").status)
    }

    @Test fun entryDistinctSkillFallbackAllowsRepeatOnlyAfterAllOptionsUsed() {
        val bonus = (linguist.mechanics.choices[1] as ChoiceDefinition.Values).copy(count = 4)
        val feat = linguist.copy(mechanics = linguist.mechanics.copy(choices = listOf(bonus)))
        val values = listOf("DIPLOMACY", "SOCIETY", "INSIGHT", "DIPLOMACY").mapIndexed { i, value -> ValueChoice(slot("first", "bonus", i), value) }
        val doc = document(listOf(LevelDecisions(1, listOf(choose(feat, "first")), values = values)))
        assertFalse(evaluate(doc, listOf(feat)).diagnostics.any { it.code == "engine.valueOption" })
        val invalid = doc.copy(levels = listOf(doc.levels.single().copy(values = values.take(1) + values[1].copy(value = "DIPLOMACY"))))
        assertTrue(evaluate(invalid, listOf(feat)).diagnostics.any { it.code == "engine.valueOption" })
    }

    @Test fun damageTypesArePowerScopedIncludeIndependentGrantsAndDoNotLeakOtherAncestryChoices() {
        val breath = entry("breath", EntryCategory.POWER, Mechanics(version = 2, factLinks = listOf(FactLink(FactKind.DAMAGE_TYPE, "scales", "breath"))))
        val scales = entry("scales", EntryCategory.FEATURE, Mechanics(version = 2, choices = listOf(
            ChoiceDefinition.Values("damage", 1, FactKind.DAMAGE_TYPE, listOf(option("FIRE"), option("COLD")), targetId = "scales"))))
        val origin = ancestry.copy(mechanics = Mechanics(version = 2, grants = listOf(Grant.Entry("scales", "scales"), Grant.Entry("breath", "breath")),
            facts = listOf(FactGrant(FactKind.DAMAGE_TYPE, listOf("ACID"), "breath"), FactGrant(FactKind.DAMAGE_TYPE, listOf("COLD"), "other-power"))))
        val adaptable = entry("adaptable", mechanics = Mechanics(version = 2, choices = listOf(
            ChoiceDefinition.Values("damage", 1, FactKind.DAMAGE_TYPE, listOf("FIRE", "COLD", "ACID").map { option(it) }, targetId = "breath", distinctScope = FactScope.POWER))))
        val scaleInstance = ModernCreation.grantInstance("origin", "scales")
        val doc = document(listOf(LevelDecisions(1, listOf(choose(origin, "origin", id = "ancestry"), choose(adaptable, "first")), values = listOf(
            ValueChoice(slot(scaleInstance, "damage"), "FIRE"), ValueChoice(slot("first", "damage"), "COLD")))))
        val result = evaluate(doc, listOf(origin, breath, scales, adaptable))
        assertEquals(listOf("COLD"), result.choices.single { it.slot == slot("first", "damage") }.values.map { it.id })
        assertEquals(setOf("FIRE", "COLD", "ACID"), result.facts.filter { it.targetId == "breath" }.map { it.value }.toSet())
        val bad = doc.copy(levels = listOf(doc.levels.single().copy(values = doc.levels.single().values.dropLast(1) + ValueChoice(slot("first", "damage"), "ACID"))))
        assertTrue(evaluate(bad, listOf(origin, breath, scales, adaptable)).diagnostics.any { it.code == "engine.valueOption" })
    }

    @Test fun pastLifeQualifiesWithoutVisitingChosenAncestryAndOrphansRemainDiagnosed() {
        val past = entry("past", EntryCategory.FEATURE, Mechanics(version = 2, choices = listOf(
            ChoiceDefinition.Values("life", 1, FactKind.ANCESTRY_QUALIFICATION, listOf(option("dragonborn"))))))
        val origin = ancestry.copy(mechanics = Mechanics(version = 2, grants = listOf(Grant.Entry("past", "past"))))
        val target = entry("dragonborn", EntryCategory.ANCESTRY, Mechanics(version = 2, facts = listOf(FactGrant(FactKind.LANGUAGE, listOf("DRACONIC")))))
        val feat = entry("qualified", mechanics = Mechanics(version = 2, prerequisites = listOf(Prerequisite.Entry("dragonborn"))))
        val choice = ValueChoice(slot(ModernCreation.grantInstance("origin", "past"), "life"), "dragonborn")
        val doc = document(listOf(LevelDecisions(1, listOf(choose(origin, "origin", id = "ancestry"), choose(feat, "first")), values = listOf(choice))))
        val result = evaluate(doc, listOf(origin, target, past, feat))
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("first").status)
        assertFalse(result.entries.any { it.definition.entry.id == "dragonborn" })
        assertFalse(result.facts.any { it.value == "DRACONIC" })
        val orphan = doc.copy(levels = listOf(doc.levels.single().copy(entries = doc.levels.single().entries.filter { it.instanceId != "origin" })))
        assertTrue(evaluate(orphan, listOf(origin, target, past, feat)).diagnostics.any { it.code == "engine.orphanValue" })
        assertEquals(listOf(choice), orphan.levels.single().values)
    }
    @Test fun weaponBundleGrantsAllAuthoredCategoriesAndCannotRepeatAcrossOccurrences() {
        val choice = ChoiceDefinition.Values("weapon", 1, FactKind.EQUIPMENT_PROFICIENCY,
            listOf(ValueOption("bundle", "Simple and military", listOf("SIMPLE_MELEE", "SIMPLE_RANGED", "MILITARY_MELEE", "MILITARY_RANGED")),
                option("superior-a"), option("superior-b")), distinctScope = FactScope.ENTRY)
        val feat = entry("weapon", mechanics = Mechanics(version = 2, choices = listOf(choice)))
        val doc = document(listOf(LevelDecisions(1, listOf(choose(feat, "first")), values = listOf(ValueChoice(slot("first", "weapon"), "bundle"))),
            LevelDecisions(2, listOf(choose(feat, "second", 2)), values = listOf(ValueChoice(slot("second", "weapon"), "bundle")))))
        val result = evaluate(doc, listOf(feat))
        assertEquals(setOf("SIMPLE_MELEE", "SIMPLE_RANGED", "MILITARY_MELEE", "MILITARY_RANGED"), result.equipmentProficiencies.keys)
        assertTrue(result.diagnostics.any { it.code == "engine.valueOption" && it.slot == slot("second", "weapon") })
        assertEquals(listOf("superior-a", "superior-b"), result.choices.single { it.slot == slot("second", "weapon") }.values.map { it.id })
    }

    @Test fun laterDecisionCannotRewriteAcquisitionFactsAndSourceReplacementPreservesOrphan() {
        val doc = document(listOf(LevelDecisions(1, listOf(choose(linguist, "first"))),
            LevelDecisions(2, values = listOf(ValueChoice(slot("first", "languages"), "A")))))
        val result = evaluate(doc, listOf(linguist))
        assertTrue(result.diagnostics.any { it.code == "engine.valueTiming" })
        assertFalse(result.facts.any { it.value == "A" })
        val original = doc.levels[1].values
        val changed = doc.copy(levels = listOf(doc.levels[0].copy(entries = emptyList()), doc.levels[1]))
        assertTrue(evaluate(changed, listOf(linguist)).diagnostics.any { it.code == "engine.orphanValue" })
        assertEquals(original, changed.levels[1].values)
    }

    @Test fun selectedWeaponBenefitCannotQualifyItselfOrDependentChain() {
        val weapon = entry("weapon", mechanics = Mechanics(version = 2, prerequisites = listOf(Prerequisite.EquipmentProficiency("superior")),
            choices = listOf(ChoiceDefinition.Values("weapon", 1, FactKind.EQUIPMENT_PROFICIENCY, listOf(option("superior"))))))
        val dependent = entry("dependent", EntryCategory.ANCESTRY, Mechanics(version = 2, prerequisites = listOf(Prerequisite.Entry("weapon")),
            equipmentProficiencies = listOf("superior")))
        val doc = document(listOf(LevelDecisions(1, listOf(choose(weapon, "first"), choose(dependent, "dependent", id = "ancestry")),
            values = listOf(ValueChoice(slot("first", "weapon"), "superior")))))
        assertEquals(Eligibility.INELIGIBLE, evaluate(doc, listOf(weapon, dependent)).entryEligibility.getValue("first").status)
    }

}
