package dev.modern4e.builder

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

/** The Skill Increase matrix: what each cell shows and does, its messages, and saving through a session. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SkillMatrixTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore

    @Before fun setUp() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    private val grants = listOf(Skill.ATHLETICS, Skill.ACROBATICS, Skill.ENDURANCE, Skill.INSIGHT)
        .map { SkillGrant(it, SkillRank.TRAINED, 1) } + SkillGrant(Skill.CULTURE, SkillRank.NOVICE, 1)

    private fun raise(skill: Skill, rank: SkillRank) = SkillIncrease(skill, rank)

    private fun document(vararg decisions: Pair<Int, List<SkillIncrease>>) = CharacterDocument(
        id = "matrix", savedAt = "2026-11-28T10:00:00Z", identity = CharacterIdentity("Matrix"), packages = emptyList(),
        level = 14, abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()),
        levels = decisions.map { (level, increases) -> LevelDecisions(level, skillIncreases = increases) })

    private val planned = document(4 to listOf(raise(Skill.ATHLETICS, SkillRank.EXPERT)),
        8 to listOf(raise(Skill.ENDURANCE, SkillRank.EXPERT)), 11 to listOf(raise(Skill.ATHLETICS, SkillRank.ADEPT)))

    private fun matrix(document: CharacterDocument, level: Int, draft: List<SkillIncrease> = document.skillIncreasesAt(level)) =
        skillMatrix(grants, document, level, draft)

    private fun SkillMatrix.cell(skill: Skill, rank: SkillRank) = rows.single { it.skill == skill }.cells.single { it.rank == rank }

    private fun SkillMatrix.kinds(skill: Skill) = rows.single { it.skill == skill }.cells.map { it.kind }

    @Test fun theGroupsHoldEverySkillOnceInPrintedOrder() {
        assertEquals(Skill.catalog, SkillGroups.flatten())
        assertEquals(Skill.catalog, matrix(document(), 4).rows.map { it.skill })
        assertEquals(listOf("Novice", "Trained", "Expert", "Adept", "Master"), SkillMatrixRanks.map { it.title })
    }

    @Test fun cellsSeparateHeldAffordableUnaffordableAndLockedRanks() {
        val matrix = matrix(document(), 4)

        assertEquals(listOf(SkillCellKind.HELD, SkillCellKind.HELD, SkillCellKind.BUY, SkillCellKind.LOCKED,
            SkillCellKind.LOCKED), matrix.kinds(Skill.ATHLETICS))
        assertEquals(listOf(SkillCellKind.BUY, SkillCellKind.BUY, SkillCellKind.UNAFFORDABLE, SkillCellKind.LOCKED,
            SkillCellKind.LOCKED), matrix.kinds(Skill.STEALTH))
        assertEquals(listOf(1, 3, 6), matrix.rows.single { it.skill == Skill.STEALTH }.cells.take(3).map { it.price })
        assertEquals("Lv 11", matrix.step.lockedLabel(SkillRank.ADEPT))
        assertEquals("Lv 21", matrix.step.lockedLabel(SkillRank.MASTER))
        assertNull(matrix.step.lockedLabel(SkillRank.EXPERT))
    }

    @Test fun onePressBuysSeveralRanksAndPressingItAgainUndoesThem() {
        val empty = emptyList<SkillIncrease>()
        val bought = pressSkillCell(empty, matrix(document(), 4, empty).cell(Skill.STEALTH, SkillRank.TRAINED))!!
        assertEquals(listOf(raise(Skill.STEALTH, SkillRank.TRAINED)), bought)

        val after = matrix(document(), 4, bought)
        assertEquals(listOf(SkillCellKind.BOUGHT, SkillCellKind.REACHED), after.kinds(Skill.STEALTH).take(2))
        assertEquals(0, after.step.left)
        assertEquals(SkillRank.TRAINED, after.rows.single { it.skill == Skill.STEALTH }.rank)
        assertEquals(empty, pressSkillCell(bought, after.cell(Skill.STEALTH, SkillRank.TRAINED)))
        // A rank inside the purchase shortens it instead.
        assertEquals(listOf(raise(Skill.STEALTH, SkillRank.NOVICE)),
            pressSkillCell(bought, after.cell(Skill.STEALTH, SkillRank.NOVICE)))
    }

    @Test fun changingOnePurchaseKeepsTheOthersInOrder() {
        val draft = listOf(raise(Skill.STEALTH, SkillRank.NOVICE), raise(Skill.NATURE, SkillRank.NOVICE))
        val next = pressSkillCell(draft, matrix(document(), 4, draft).cell(Skill.STEALTH, SkillRank.TRAINED))
        // One point is left, which cannot pay the two more that Trained costs.
        assertNull(next)
        val shorter = pressSkillCell(listOf(draft.first()), matrix(document(), 4, listOf(draft.first()))
            .cell(Skill.STEALTH, SkillRank.TRAINED))
        assertEquals(listOf(raise(Skill.STEALTH, SkillRank.TRAINED)), shorter)
    }

    @Test fun cellsThatCannotBeBoughtExplainWhy() {
        val matrix = matrix(planned, 14, emptyList())
        fun why(skill: Skill, rank: SkillRank, source: SkillMatrix = matrix) = source.cell(skill, rank).let {
            assertNull(pressSkillCell(emptyList(), it))
            source.explain(it)
        }

        assertEquals("Athletics reached Adept at level 11.", why(Skill.ATHLETICS, SkillRank.ADEPT))
        assertEquals("Acrobatics is already Trained before this increase.", why(Skill.ACROBATICS, SkillRank.TRAINED))
        assertEquals("Stealth to Adept costs 11 points. You have 5 left.", why(Skill.STEALTH, SkillRank.ADEPT))
        assertEquals("Master opens at level 21.", why(Skill.STEALTH, SkillRank.MASTER))

        val early = matrix(planned, 4)
        assertEquals(SkillCellKind.PLANNED, early.cell(Skill.ATHLETICS, SkillRank.ADEPT).kind)
        assertTrue(early.cell(Skill.ATHLETICS, SkillRank.ADEPT).locked)
        assertEquals("You planned Athletics to Adept at level 11.", why(Skill.ATHLETICS, SkillRank.ADEPT, early))
        assertEquals(8, early.cell(Skill.ENDURANCE, SkillRank.EXPERT).plannedLevel)
    }

    @Test fun theNoteWarnsBeforeAnEarlierChangeBreaksALaterLevel() {
        val saved = skillSteps(grants, planned)
        assertEquals("All points spent. Press a ✓ again to undo it.", matrix(planned, 4).note(saved).text)
        assertEquals("Press the rank you want a skill to reach. The box shows what it costs.",
            matrix(document(), 4).note(skillSteps(grants, document())).text)

        val cleared = matrix(planned, 4, emptyList()).note(saved)
        assertTrue(cleared.error)
        assertEquals("Saving breaks level 11: 3 over budget: Athletics costs 8.", cleared.text)
    }

    @Test fun aBrokenLaterLevelShowsItsProblemAndCanBeCleared() {
        val broken = planned.copy(levels = planned.levels.filter { it.level != 4 })
        val matrix = matrix(broken, 11)

        assertEquals("3 over budget: Athletics costs 8.", matrix.step.problem())
        assertEquals("8 of 5 spent", matrix.step.spendingSummary())
        assertEquals(SkillNote("3 over budget: Athletics costs 8.", error = true), matrix.note(skillSteps(grants, broken)))
        assertEquals(emptyList<SkillIncrease>(),
            pressSkillCell(broken.skillIncreasesAt(11), matrix.cell(Skill.ATHLETICS, SkillRank.ADEPT)))
    }

    @Test fun anIncreaseTheCharacterAlreadyHasShowsAsStale() {
        val draft = listOf(raise(Skill.ACROBATICS, SkillRank.TRAINED))
        val matrix = matrix(document(), 4, draft)
        val cell = matrix.cell(Skill.ACROBATICS, SkillRank.TRAINED)

        assertEquals(SkillCellKind.STALE, cell.kind)
        assertEquals("Acrobatics is already Trained. Remove this increase.", matrix.step.problem())
        assertEquals(emptyList<SkillIncrease>(), pressSkillCell(draft, cell))
    }

    @Test fun cardSummariesNameSpentAndLeftoverPoints() {
        fun summary(draft: List<SkillIncrease>) = matrix(document(), 4, draft).step.spendingSummary()

        assertEquals("1 of 3 spent · 2 left", summary(listOf(raise(Skill.STEALTH, SkillRank.NOVICE))))
        assertEquals("3 of 3 points spent", summary(listOf(raise(Skill.STEALTH, SkillRank.TRAINED))))
        val stuck = SkillAdvancement.step(4, Skill.catalog.associateWith { SkillRank.NOVICE },
            listOf(raise(Skill.STEALTH, SkillRank.TRAINED)))
        assertEquals("2 of 3 spent · 1 cannot be used", stuck.spendingSummary())
    }

    @Test fun theHeaderCountsTheMilestonePointsAndNamesItsTier() {
        val tally = matrix(document(), 14, listOf(raise(Skill.STEALTH, SkillRank.TRAINED))).step.tally(planned = false)
        assertEquals(PickTally("Level 14 skill points", "Paragon · up to Adept", total = 5, used = 3), tally)
        assertEquals("Level 14 skill points, 2 of 5 left", tally.description)
        assertEquals("Epic · up to Master · planned", matrix(document(), 21).step.tally(planned = true).subtitle)
        assertEquals(-3, matrix(planned.copy(levels = planned.levels.filter { it.level != 4 }), 11).step.tally(false).left)
    }

    @Test fun laterGrantsComeFromThePreviewOnlyAboveTheCurrentLevel() {
        fun state(level: Int, vararg held: SkillGrant) = BuilderState(document().copy(level = level),
            EngineResult(emptyMap(), emptyList(), emptyList(), emptyMap(), emptyMap(), emptyList(), skillGrants = held.toList()))
        val current = state(4, SkillGrant(Skill.NATURE, SkillRank.TRAINED, 1))
        val stale = state(30, SkillGrant(Skill.ARCANA, SkillRank.TRAINED, 1), SkillGrant(Skill.STEALTH, SkillRank.TRAINED, 6))

        assertEquals(listOf(Skill.NATURE, Skill.STEALTH), skillGrantsFor(current, stale).map { it.skill })
        assertEquals(listOf(Skill.NATURE), skillGrantsFor(current, null).map { it.skill })
    }

    private fun starter(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-modern-fighter.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value

    private suspend fun BuilderSession.spend(level: Int, vararg increases: SkillIncrease) {
        edit(BuilderEdit.SkillIncreases(level, increases.toList()))
        assertTrue(errors.toString(), errors.isEmpty())
    }

    @Test fun increasesPersistAtReachedAndUpcomingLevelsAcrossReopeningAndLevelChanges() = runBlocking {
        val model = BuilderSession(store, AndroidContentSource(context.assets), ::starter)
        model.listings.close()
        model.create()
        model.edit(BuilderEdit.Level(4))
        assertTrue(model.current!!.rules.choices.single { it.slot == SkillAdvancement.slot(4) }.missing)
        val unfinished = Progression.unfinished(model.current!!)

        model.spend(4, raise(Skill.NATURE, SkillRank.TRAINED))
        assertEquals(unfinished - 1, Progression.unfinished(model.current!!))
        model.spend(11, raise(Skill.NATURE, SkillRank.EXPERT))
        assertEquals(4, model.current!!.document.level)
        assertEquals(SkillRank.TRAINED, model.current!!.rules.skillRank(Skill.NATURE))

        val saved = model.current!!.document
        model.load(saved.id)
        assertEquals(saved, model.current!!.document)
        val preview = model.progressionPreview(model.current!!, 11)
        assertEquals(SkillRank.EXPERT, preview.rules.skillRank(Skill.NATURE))
        assertTrue(preview.rules.skillIncreases.single { it.level == 11 }.issues.isEmpty())

        model.edit(BuilderEdit.Level(11))
        assertEquals(SkillRank.EXPERT, model.current!!.rules.skillRank(Skill.NATURE))
        model.edit(BuilderEdit.Level(1))
        assertEquals(saved.skillIncreaseDecisions(), model.current!!.document.skillIncreaseDecisions())
        assertEquals(SkillRank.UNTRAINED, model.current!!.rules.skillRank(Skill.NATURE))
    }

    @Test fun skillPointTrainingLeavesTheLevelOnePickersAlone() = runBlocking {
        val model = BuilderSession(store, AndroidContentSource(context.assets), ::starter)
        model.listings.close()
        model.create()
        model.edit(BuilderEdit.Level(4))
        model.spend(4, raise(Skill.NATURE, SkillRank.TRAINED))

        val row = model.current!!.rules.skillPickRows(Skill.catalog, freeSkillSlots, emptyList(), SkillRank.TRAINED)
            .single { it.skill == Skill.NATURE }
        assertFalse(row.blocked)
        assertEquals(SkillRank.UNTRAINED, row.rank)
    }
}
