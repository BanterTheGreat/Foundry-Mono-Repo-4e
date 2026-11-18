package dev.modern4e.builder

import kotlin.test.*

/** Shared JVM/JS regressions for authored armor advancement and independent equipment facts. */
class ArmorAdvancementTest {
    private val order = listOf("CLOTH", "LEATHER", "HIDE", "CHAINMAIL", "SCALE", "PLATE")
    private val profile = ContractCodec.json.decodeFromString<EntryChunk>(contractFixtures.getValue("shared-fighter-chunk.json"))
        .entries.single { it.category == EntryCategory.CLASS }.mechanics.classProfile!!.copy(
            proficiencies = mapOf("armor" to emptyList(), "shields" to emptyList(), "weapons" to emptyList(), "implements" to emptyList()))
    private val armor = ContentEntry("armor", EntryCategory.FEAT, Presentation("Armor Proficiency"),
        Mechanics(version = 2, armorAdvancement = ArmorAdvancement(order, 1)), Coverage(CoverageStatus.SUPPORTED))
    private fun slot(source: String, choice: String) = ChoiceSlotId(source, choice, 0)
    private fun saved(entry: ContentEntry) = SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry))
    private fun selected(entry: ContentEntry, instance: String, source: String, choice: String) =
        EntryChoice(instance, slot(source, choice), saved(entry))
    private fun evaluate(start: List<String>, repeat: Boolean = false, later: List<String> = emptyList(), requirePlate: Boolean = false, firstPrerequisite: String? = null): EngineResult {
        val firstArmor = armor.copy(mechanics = armor.mechanics.copy(prerequisites =
            listOfNotNull(firstPrerequisite?.let { Prerequisite.EquipmentProficiency(it) })))
        val followUp = if (requirePlate) armor.copy(id = "plate-required", mechanics = Mechanics(version = 2,
            prerequisites = listOf(Prerequisite.EquipmentProficiency("PLATE")))) else firstArmor
        val feature = ContentEntry("later", EntryCategory.FEATURE, Presentation("Independent grant"),
            Mechanics(version = 2, equipmentProficiencies = later), Coverage(CoverageStatus.SUPPORTED))
        val fighter = ContentEntry("fighter", EntryCategory.CLASS, Presentation("Class"),
            Mechanics(version = 2, classProfile = profile, equipmentProficiencies = start,
                choices = listOf(ChoiceDefinition.MainAbility("main", listOf(Ability.STRENGTH))),
                grants = listOf(Grant.Entry("later", "later", atLevel = 2))), Coverage(CoverageStatus.SUPPORTED))
        val document = CharacterDocument(id = "armor", savedAt = "2026-11-18T12:00:00Z", identity = CharacterIdentity("Armor"),
            packages = emptyList(), level = if (repeat || later.isNotEmpty()) 2 else 1,
            abilities = AbilityAllocation(slot("class", "main"), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.CONSTITUTION to 2, Ability.DEXTERITY to 2, Ability.INTELLIGENCE to 1)),
            levels = listOf(LevelDecisions(1, listOf(selected(fighter, "class", "creation", "class"),
                selected(firstArmor, "first", "creation", "feat")))) +
                if (repeat) listOf(LevelDecisions(2, listOf(selected(followUp, "second", "advancement.2", "feat")))) else emptyList())
        val definitions = listOf(fighter, firstArmor, feature, followUp).associateBy { it.id }
        fun resolved(entry: ContentEntry) = ContractResult.Available(ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry)))
        val content = RulesContent(definitions.mapValues { resolved(it.value) },
            document.levels.flatMap { it.entries }.associate { it.selection to resolved(definitions.getValue(it.selection.entryId)) })
        return RulesEngine.evaluate(document, content)
    }

    @Test
    fun everyStartingCategoryAdvancesExactlyOneStepAndKeepsSource() {
        for (index in 0 until order.lastIndex) {
            val result = evaluate(listOf(order[index]))
            assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("first").status)
            assertEquals(setOf(order[index], order[index + 1]), result.equipmentProficiencies.keys)
            assertEquals(listOf(slot("creation", "feat")), result.equipmentProficiencies.getValue(order[index + 1]))
        }
    }

    @Test
    fun highestIndependentCategoryWinsWithoutGrantingSkippedCategories() {
        val result = evaluate(listOf("CLOTH", "CHAINMAIL", "LIGHT_SHIELD"))
        assertEquals(setOf("CLOTH", "CHAINMAIL", "LIGHT_SHIELD", "SCALE"), result.equipmentProficiencies.keys)
    }

    @Test
    fun repeatedSelectionsAdvanceUntilPlateAndRejectFurtherSelections() {
        val advancing = evaluate(listOf("CHAINMAIL"), repeat = true)
        assertEquals(Eligibility.ELIGIBLE, advancing.entryEligibility.getValue("first").status)
        assertEquals(Eligibility.ELIGIBLE, advancing.entryEligibility.getValue("second").status)
        assertEquals(setOf("CHAINMAIL", "SCALE", "PLATE"), advancing.equipmentProficiencies.keys)
        val capped = evaluate(listOf("SCALE"), repeat = true)
        assertEquals(Eligibility.ELIGIBLE, capped.entryEligibility.getValue("first").status)
        assertEquals(Eligibility.INELIGIBLE, capped.entryEligibility.getValue("second").status)
        assertTrue(capped.diagnostics.any { it.code == "engine.armorAdvancement" && it.slot == slot("advancement.2", "feat") })
    }

    @Test
    fun missingStartingProficiencyAndPlateDoNotInventBenefits() {
        for (start in listOf(emptyList(), listOf("PLATE"), listOf("LIGHT_SHIELD"))) {
            val result = evaluate(start)
            assertEquals(Eligibility.INELIGIBLE, result.entryEligibility.getValue("first").status)
            assertEquals(start.toSet(), result.equipmentProficiencies.keys)
        }
    }

    @Test
    fun laterIndependentGrantDoesNotRewriteEarlierBenefitOrEligibility() {
        val result = evaluate(listOf("LEATHER"), repeat = true, later = listOf("SCALE"))
        assertEquals(setOf("LEATHER", "HIDE", "SCALE", "PLATE"), result.equipmentProficiencies.keys)
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("first").status)
        assertEquals(Eligibility.ELIGIBLE, result.entryEligibility.getValue("second").status)
    }

    @Test
    fun grantedArmorQualifiesLaterEquipmentPrerequisites() {
        assertEquals(Eligibility.ELIGIBLE, evaluate(listOf("SCALE"), repeat = true, requirePlate = true)
            .entryEligibility.getValue("second").status)
        assertEquals(Eligibility.INELIGIBLE, evaluate(listOf("HIDE"), repeat = true, requirePlate = true)
            .entryEligibility.getValue("second").status)
    }

    @Test
    fun armorBenefitCannotSatisfyItsOwnEquipmentPrerequisite() {
        assertEquals(Eligibility.INELIGIBLE, evaluate(listOf("SCALE"), firstPrerequisite = "PLATE")
            .entryEligibility.getValue("first").status)
    }

    @Test
    fun optionalFieldsPreserveLegacyFingerprintsAndRejectMalformedProgressions() {
        val text = ContractCodec.json.encodeToString(Mechanics.serializer(), Mechanics())
        assertFalse("armorAdvancement" in text)
        assertFalse("equipmentProficiencies" in text)
        assertFailsWith<IllegalArgumentException> { ArmorAdvancement(listOf("CLOTH", "CLOTH"), 1) }
        assertFailsWith<IllegalArgumentException> { ArmorAdvancement(order, 0) }
        assertFailsWith<IllegalArgumentException> { ArmorAdvancement(order, order.size) }
    }
}
