package dev.modern4e.builder

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Checks retained picker results through real content, committed edits and the normal listing API. The retention rules
 * themselves are covered without a session by the shared `ListingRetentionTest`; these stay as integration checks.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PowerChoiceCacheTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore

    @Before fun reset() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    private fun sample(): CharacterDocument {
        val original = (ContractCodec.decode(File("../shared/fixtures/sample-current-fighter-1-base.json")
            .readText(Charsets.UTF_8)) as ContractResult.Available).value
        return original.copy(level = 6, levels = original.levels.map { decisions ->
            decisions.copy(entries = decisions.entries.filterNot { it.slot.choiceId.startsWith("modern4e.choice.class-attack") })
        } + (2..6).map { LevelDecisions(it) })
    }

    private suspend fun session(document: CharacterDocument = sample(), source: ContentSource = AndroidContentSource(context.assets)): BuilderSession = BuilderSession(store, source, { document })
        .also {
            // Warm only the lists under test, and observe the first publication before background work can refill them.
            it.listings.settleMillis = 60_000
            it.create()
            assertTrue(it.errors.toString(), it.errors.isEmpty())
        }

    private fun BuilderSession.pool(level: Int, name: String, ordinal: Int = 0): ChoiceSlotId =
        Progression.levelChoices(current!!, level).first {
            it.slot.choiceId == "modern4e.choice.$name" && it.slot.ordinal == ordinal
        }.slot

    private suspend fun BuilderSession.rows(level: Int, slot: ChoiceSlotId, group: FeatGroup? = null): List<BuilderOptionRow> {
        var result = emptyList<BuilderOptionRow>()
        progressionOptionRows(level, slot, group) { result = it }
        assertTrue("Expected candidates for $slot", result.isNotEmpty())
        assertTrue(result.all { it.checked })
        return result
    }

    private suspend fun BuilderSession.firstRows(level: Int, slot: ChoiceSlotId, group: FeatGroup? = null): List<BuilderOptionRow> {
        var result = emptyList<BuilderOptionRow>()
        try {
            progressionOptionRows(level, slot, group) {
                result = it
                throw CancellationException("Inspect retained rows before eligibility checks")
            }
        } catch (_: CancellationException) { }
        assertTrue("Expected candidates for $slot", result.isNotEmpty())
        return result
    }

    private suspend fun BuilderSession.pick(level: Int, slot: ChoiceSlotId, candidates: List<BuilderOptionRow>) {
        val id = candidates.first { it.option?.eligibility == Eligibility.ELIGIBLE }.metadata.metadata.id
        edit(BuilderEdit.Entry(level, slot, id, progressionEntryInstance(level, slot), true))
        assertTrue(errors.toString(), errors.isEmpty())
    }

    @Test fun removingSkillTrainingRefreshesUtilityPrerequisitesButKeepsOrdinaryAttackLists() = runBlocking {
        val trained = sample().let { document -> document.copy(levels = document.levels.map { decisions ->
            decisions.copy(proficiencies = decisions.proficiencies.map { proficiency ->
                if (proficiency.slot.sourceInstanceId == "training" && proficiency.slot.ordinal == 0) {
                    proficiency.copy(skill = Skill.ACROBATICS)
                } else {
                    proficiency
                }
            })
        }) }
        val model = session(trained)
        val attack = model.pool(1, "class-attack-encounter")
        val utility = model.pool(2, "class-utility-2")
        val laterDaily = model.pool(5, "class-attack-daily-5")
        val attackRows = model.rows(1, attack)
        model.rows(5, laterDaily)
        val agileRecovery = "modern4e.power.utility-general-agile-recovery"
        assertEquals(Eligibility.ELIGIBLE, model.rows(2, utility).first {
            it.metadata.metadata.id == agileRecovery
        }.option?.eligibility)

        model.edit(BuilderEdit.RemoveEntry(ChoiceSlotId("creation", "feat", 0)))
        assertTrue(model.errors.toString(), model.errors.isEmpty())

        assertEquals("Skill feat cannot affect a plain class attack power", attackRows, model.firstRows(1, attack))
        assertFalse("Authored utility proficiency prerequisites must be checked again", model.firstRows(2, utility).first {
            it.metadata.metadata.id == agileRecovery
        }.checked)
        val daily = model.firstRows(5, laterDaily)
        assertFalse("Later Daily includes authored skill prerequisites", daily.first {
            it.option?.entry?.entry?.presentation?.title == "Cometfall Charge"
        }.checked)
        assertTrue("Unrelated Daily eligibility stays checked", daily.any { it.checked })
        assertEquals(Eligibility.INELIGIBLE, model.rows(2, utility).first {
            it.metadata.metadata.id == agileRecovery
        }.option?.eligibility)
    }

    /** Keep one real feat in the tab, with a controlled authored dependency to exercise the cache boundary. */
    private fun featSource(dependsOnPower: Boolean = false, requiredPowerId: String? = null,
        selectionModifier: SelectionModifier? = null): ContentSource {
        val real = AndroidContentSource(context.assets)
        return object : ContentSource by real {
            override suspend fun loadIndex(packageId: String, indexId: String): ContractResult<ContentIndex> =
                when (val result = real.loadIndex(packageId, indexId)) {
                    is ContractResult.Unavailable -> result
                    is ContractResult.Available -> ContractResult.Available(result.value.copy(entries = result.value.entries.filter {
                        it.category != EntryCategory.FEAT || it.id == "modern4e.feat.skill-training"
                    }), result.diagnostics)
                }

            override suspend fun loadChunk(packageId: String, chunkId: String): ContractResult<EntryChunk> =
                when (val result = real.loadChunk(packageId, chunkId)) {
                    is ContractResult.Unavailable -> result
                    is ContractResult.Available -> ContractResult.Available(result.value.copy(entries = result.value.entries.map { entry ->
                        if (entry.id == "modern4e.feat.skill-training") {
                            val requirement = when {
                                requiredPowerId != null -> Prerequisite.Entry(requiredPowerId)
                                dependsOnPower -> Prerequisite.Selected(EntryCategory.POWER,
                                    SelectedFilters(usage = "ENCOUNTER", hasLevel = true))
                                else -> Prerequisite.Always
                            }
                            entry.copy(mechanics = entry.mechanics.copy(prerequisites = listOf(requirement),
                                selectionModifiers = listOfNotNull(selectionModifier)))
                        } else {
                            entry
                        }
                    }), result.diagnostics)
                }
        }
    }

    @Test fun powerPickPreservesAnIndependentFeatList() = runBlocking {
        val model = session(source = featSource(false))
        val feat = ChoiceSlotId("creation", "feat", 0)
        val feats = model.rows(1, feat, FeatGroup.GENERAL)
        for (group in listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY)) {
            model.progressionOptionRows(1, feat, group) { }
        }
        val encounter = model.pool(1, "class-attack-encounter")

        model.pick(1, encounter, model.rows(1, encounter))

        assertEquals(feats, model.firstRows(1, feat, FeatGroup.GENERAL))
    }

    @Test fun powerPickRefreshesAFeatListWithAnAuthoredPowerPrerequisite() = runBlocking {
        val model = session(source = featSource(true))
        val feat = ChoiceSlotId("creation", "feat", 0)
        assertEquals(Eligibility.INELIGIBLE, model.rows(1, feat, FeatGroup.GENERAL).single().option?.eligibility)
        for (group in listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY)) {
            model.progressionOptionRows(1, feat, group) { }
        }
        val encounter = model.pool(1, "class-attack-encounter")

        model.pick(1, encounter, model.rows(1, encounter))

        assertTrue(model.firstRows(1, feat, FeatGroup.GENERAL).none { it.checked })
        assertEquals(Eligibility.ELIGIBLE, model.rows(1, feat, FeatGroup.GENERAL).single().option?.eligibility)
    }

    @Test fun replacementAndRemovalInvalidateFeatsDependingOnTheDisplacedPower() = runBlocking {
        val originalPower = "modern4e.power.fighter-power1004"
        val replacementPower = "modern4e.power.fighter-power1008"
        val model = session(source = featSource(requiredPowerId = originalPower))
        val encounter = model.pool(1, "class-attack-encounter")
        model.edit(BuilderEdit.Entry(1, encounter, originalPower, model.progressionEntryInstance(1, encounter), true))
        assertTrue(model.errors.toString(), model.errors.isEmpty())
        val feat = ChoiceSlotId("advancement.6", "feat", 0)
        assertEquals(Eligibility.ELIGIBLE, model.rows(6, feat, FeatGroup.GENERAL).single().option?.eligibility)
        for (group in listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY)) {
            model.progressionOptionRows(6, feat, group) { }
        }
        val daily = model.pool(5, "class-attack-daily-5")
        val dailyRows = model.rows(5, daily)

        model.edit(BuilderEdit.ReplacePower(5, encounter, replacementPower,
            kind = ReplacementKind.RETRAINING, acceptIneligible = true))
        assertTrue(model.errors.toString(), model.errors.isEmpty())

        assertEquals("Encounter retraining leaves Daily independent", dailyRows, model.firstRows(5, daily))
        assertTrue("Displaced power is part of the feat dependency", model.firstRows(6, feat, FeatGroup.GENERAL).none { it.checked })
        assertEquals(Eligibility.INELIGIBLE, model.rows(6, feat, FeatGroup.GENERAL).single().option?.eligibility)
        for (group in listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY)) {
            model.progressionOptionRows(6, feat, group) { }
        }

        model.edit(BuilderEdit.RemoveReplacement(5, encounter))
        assertTrue(model.errors.toString(), model.errors.isEmpty())

        assertEquals(dailyRows, model.firstRows(5, daily))
        assertTrue("Restoring the displaced power refreshes the dependent feat", model.firstRows(6, feat, FeatGroup.GENERAL).none { it.checked })
        assertEquals(Eligibility.ELIGIBLE, model.rows(6, feat, FeatGroup.GENERAL).single().option?.eligibility)
    }

    @Test fun featPoolModifierRefreshesPowerResultsEvenWhenCandidateMembershipIsUnchanged() = runBlocking {
        val choiceId = "modern4e.choice.class-attack-at-will"
        val model = session(source = featSource(selectionModifier = SelectionModifier(choiceId, 1)))
        val feat = ChoiceSlotId("creation", "feat", 0)
        model.edit(BuilderEdit.RemoveEntry(feat))
        assertTrue(model.errors.toString(), model.errors.isEmpty())
        val atWill = model.pool(1, "class-attack-at-will")
        val candidates = model.rows(1, atWill).map { it.metadata.metadata.id }

        model.edit(BuilderEdit.Entry(1, feat, "modern4e.feat.skill-training", model.progressionEntryInstance(1, feat), true))
        assertTrue(model.errors.toString(), model.errors.isEmpty())

        val refreshed = model.firstRows(1, atWill)
        assertEquals("Pool count changes without changing offered entries", candidates, refreshed.map { it.metadata.metadata.id })
        assertTrue("Pool contract changes invalidate checked results", refreshed.none { it.checked })
        assertEquals(1, model.current!!.rules.selectionSets.single {
            it.sourceInstanceId == atWill.sourceInstanceId && it.choiceId == choiceId
        }.required)
    }
}
