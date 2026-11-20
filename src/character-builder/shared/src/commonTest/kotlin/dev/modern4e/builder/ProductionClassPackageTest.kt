package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Both JVM and JS consume the exact authoritative bytes bundled by the platforms. */
class ProductionClassPackageTest {
    @Test
    fun authoritativePackageLoadsCompleteClassesAndPreservesSavedIdentities() {
        var completed = false
        var failure: Throwable? = null
        val block: suspend () -> Unit = {
            val prefix = "authoritative/"
            val packageIds = productionFixtures.keys.filter { it.startsWith(prefix) && it.endsWith("/manifest.json") }
                .map { it.removePrefix(prefix).substringBefore('/') }
            val source = object : ContentSource {
                override suspend fun listPackages() = ContractResult.Available(packageIds.map {
                    assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(
                        productionFixtures.getValue("$prefix$it/manifest.json"))).value
                })
                override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
                    ContractCodec.json.decodeFromString<ContentIndex>(productionFixtures.getValue("$prefix$packageId/$indexId.json")))
                override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(
                    ContractCodec.json.decodeFromString<EntryChunk>(productionFixtures.getValue("$prefix$packageId/$chunkId.json")))
            }
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
                ContentCatalog.open(source, "modern4e.classes", emptyList())).value
            assertEquals(19, catalog.search(category = EntryCategory.CLASS).size)
            assertTrue(catalog.search("class3").isEmpty())
            val fighter = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.class.fighter")).value!!
            assertNotNull(fighter.entry.sharedData?.get("flavor"))
            assertEquals(18, fighter.entry.mechanics.classProfile!!.statistics.getValue(Statistic.HIT_POINTS).base)
            assertEquals(CoverageStatus.SUPPORTED, fighter.entry.coverage.status)
            val sample = assertIs<ContractResult.Available<CharacterDocument>>(
                ContractCodec.decode(contractFixtures.getValue("sample-modern-fighter.json"))).value
            val saved = sample.levels.first().entries.first().selection
            assertEquals(fighter.fingerprint, saved.acknowledgedFingerprint)
            assertFalse(assertIs<ContractResult.Available<ResolvedEntry>>(catalog.resolve(saved)).value.acknowledgmentRequired)
            val initialContent = RulesContent.load(sample, catalog)
            val initial = RulesEngine.evaluate(sample, initialContent)
            val atWill = initial.choices.first { it.slot.choiceId == "modern4e.choice.class-attack-at-will" }
            assertEquals(17, atWill.entries.count { it.entryId.startsWith("modern4e.power.fighter-power") && it.status == Eligibility.ELIGIBLE })
            assertFalse(atWill.entries.any { it.entryId == "modern4e.power.fighter-power10517" })
            val levelFive = sample.copy(level = 5)
            val fiveRules = RulesEngine.evaluate(levelFive, RulesContent.load(levelFive, catalog))
            val dailyFive = fiveRules.choices.single { it.slot.choiceId == "modern4e.choice.class-attack-daily-5" }
            val gated = dailyFive.entries.single { it.entryId == "modern4e.power.fighter-power10153" }
            // Unfilled choices do not provide a prerequisite; independent facts
            // establish ineligibility until Endurance is actually selected.
            assertEquals(Eligibility.INELIGIBLE, gated.status)
            val proficient = levelFive.copy(levels = listOf(levelFive.levels.first().copy(proficiencies = listOf(
                ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 0), Skill.ENDURANCE)))))
            val proficientRules = RulesEngine.evaluate(proficient, RulesContent.load(proficient, catalog))
            assertEquals(Eligibility.ELIGIBLE, proficientRules.choices.single { it.slot == dailyFive.slot }.entries.single {
                it.entryId == "modern4e.power.fighter-power10153" }.status)
            val wizard = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.class.wizard")).value!!
            val otherClass = sample.copy(levels = listOf(sample.levels.first().copy(entries = listOf(sample.levels.first().entries.first().copy(
                selection = SavedSelection(wizard.entry.id, wizard.entry.presentation.title, wizard.supplier.packageId, wizard.fingerprint))))))
            val otherRules = RulesEngine.evaluate(otherClass, RulesContent.load(otherClass, catalog))
            // Another class's powers are not loaded for this character, so they are not offered at all.
            val wizardAtWill = otherRules.choices.first { it.slot.choiceId == atWill.slot.choiceId }
            assertTrue(wizardAtWill.entries.none { it.entryId.startsWith("modern4e.power.fighter-") })
            assertTrue(wizardAtWill.entries.any { it.entryId.startsWith("modern4e.power.wizard-power") && it.status == Eligibility.ELIGIBLE })
            val rootInstance = sample.levels.first().entries.first().instanceId
            suspend fun choice(sourceId: String, choiceId: String): EntryChoice {
                val power = assertIs<ContractResult.Available<ResolvedEntry?>>(catalog.lookup("modern4e.power.fighter-$sourceId")).value!!
                return EntryChoice(sourceId, ChoiceSlotId(rootInstance, choiceId, 0), SavedSelection(power.entry.id,
                    power.entry.presentation.title, power.supplier.packageId, power.fingerprint))
            }
            val encounter = choice("power622", "modern4e.choice.class-attack-encounter")
            val daily = choice("power1429", "modern4e.choice.class-attack-daily")
            val selected = choice("power992", "modern4e.choice.class-attack-at-will")
            // Use a level-1 encounter acquisition, then retained replacement history.
            val earlyEncounter = initialContent.entries.values.filterIsInstance<ContractResult.Available<ResolvedEntry>>()
                .first { it.value.entry.id.startsWith("modern4e.power.fighter-power") &&
                    it.value.entry.mechanics.powerProfile?.level == 1 && it.value.entry.mechanics.powerProfile?.usage == "ENCOUNTER" }.value
            val oldEncounter = encounter.copy(selection = SavedSelection(earlyEncounter.entry.id, earlyEncounter.entry.presentation.title,
                earlyEncounter.supplier.packageId, earlyEncounter.fingerprint))
            val base = sample.copy(levels = listOf(sample.levels.first().copy(entries = sample.levels.first().entries + selected + oldEncounter + daily)))
            val lateEncounter = choice("power10517", encounter.slot.choiceId).copy(instanceId = oldEncounter.instanceId)
            val lateDaily = choice("power1101", daily.slot.choiceId).copy(instanceId = daily.instanceId)
            val later = base.copy(level = 15, levels = base.levels +
                LevelDecisions(13, replacements = listOf(Replacement(encounter.slot, lateEncounter, ReplacementKind.PROGRESSION))) +
                LevelDecisions(15, replacements = listOf(Replacement(daily.slot, lateDaily, ReplacementKind.PROGRESSION))))
            val laterRules = RulesEngine.evaluate(later, RulesContent.load(later, catalog))
            val levelThirteen = later.copy(level = 13, levels = later.levels.filter { it.level <= 13 })
            val thirteenRules = RulesEngine.evaluate(levelThirteen, RulesContent.load(levelThirteen, catalog))
            assertTrue(thirteenRules.choices.single { it.slot == encounter.slot }.entries.any { it.entryId == lateEncounter.selection.entryId && it.status == Eligibility.ELIGIBLE })
            assertTrue(laterRules.choices.single { it.slot == encounter.slot }.entries.any { it.entryId == lateEncounter.selection.entryId && it.status == Eligibility.ELIGIBLE },
                laterRules.choices.single { it.slot == encounter.slot }.entries.single { it.entryId == lateEncounter.selection.entryId }.toString())
            assertTrue(laterRules.choices.single { it.slot == daily.slot }.entries.any { it.entryId == lateDaily.selection.entryId && it.status == Eligibility.ELIGIBLE })
            assertTrue(laterRules.diagnostics.any { it.code == "engine.replacementTiming" &&
                it.slot == encounter.slot && it.kind == DiagnosticKind.INVALID_SELECTION })
            assertFalse(laterRules.diagnostics.any { it.code == "engine.replacementTiming" && it.slot == daily.slot })
            val portable = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(later))).value
            assertEquals(later, portable)
            assertEquals(laterRules.diagnostics, RulesEngine.evaluate(portable, RulesContent.load(portable, catalog)).diagnostics)
            val legacy = assertIs<ContractResult.Available<CharacterDocument>>(
                ContractCodec.decode(contractFixtures.getValue("character.json"))).value
            val oldChoice = legacy.levels.first().entries.first().selection
            assertEquals("class.fighter", oldChoice.entryId)
            assertIs<ContractResult.Unavailable>(catalog.resolve(oldChoice))
            val reopened = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(legacy))).value
            assertEquals(oldChoice, reopened.levels.first().entries.first().selection)
        }
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(result: Result<Unit>) {
                completed = true
                failure = result.exceptionOrNull()
            }
        })
        assertTrue(completed)
        failure?.let { throw it }
    }
}
