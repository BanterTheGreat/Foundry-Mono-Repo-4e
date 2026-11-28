package dev.modern4e.builder

import dev.modern4e.builder.ui.screens.heldSkillLabels
import dev.modern4e.builder.ui.screens.skillOverviewRows
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

/** The 2.0 skill tiles, pickers and overview against the bundled production content and private persistence. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SkillChoicesTest {
    private val context get() = RuntimeEnvironment.getApplication()
    private lateinit var store: AndroidCharacterStore

    @Before fun setUp() {
        File(context.filesDir, "characters").deleteRecursively()
        store = AndroidCharacterStore(context)
    }

    private fun starter(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-modern-fighter.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value

    /** A new Fighter with no skill decisions yet. */
    private suspend fun fighter(): BuilderSession {
        val model = BuilderSession(store, AndroidContentSource(context.assets), ::starter)
        model.listings.close()
        model.create()
        return model
    }

    private val BuilderSession.state get() = current!!

    private fun BuilderState.tiles(): List<SkillTile> {
        val filled = document.levels.flatMap { it.proficiencies }.map { it.slot }.toSet()
        val invalid = Progression.invalidChoiceSlots(rules)
        return startingSkillTiles(this) { it !in filled || it in invalid }
    }

    private suspend fun BuilderSession.chooseOrigin(category: String, entryId: String) {
        val slot = ChoiceSlotId("creation", category, 0)
        val instance = state.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }?.instanceId ?: category
        edit(BuilderEdit.Entry(1, slot, "modern4e.$category.$entryId", instance, acceptIneligible = true))
        assertTrue(errors.toString(), errors.isEmpty())
    }

    private suspend fun BuilderSession.chooseClassSkill(skill: Skill) {
        val slot = state.rules.choices.single { it.slot.choiceId == ModernCreation.CLASS_SKILL_CHOICE }.slot
        edit(skillPickEdit(1, listOf(slot), listOf(skill)))
    }

    private suspend fun BuilderSession.chooseFreeSkills(vararg skills: Skill) =
        edit(skillPickEdit(1, freeSkillSlots, skills.toList()))

    private val BuilderState.themeOffer get() = rules.choices.single { it.slot.choiceId == ModernCreation.THEME_SKILL_CHOICE }

    private suspend fun BuilderSession.chooseNovice(skill: Skill) =
        edit(skillPickEdit(1, listOf(state.themeOffer.slot), listOf(skill)))

    @Test fun levelOneSkillTilesUnlockInOrderAndTheChoicesSurviveReopening() = runBlocking {
        val model = fighter()
        assertEquals(listOf("Class skill", "Free skills", "Theme skill"), model.state.tiles().map { it.title })
        assertEquals(listOf("Choose…", "3 LEFT", "Choose Theme first"), model.state.tiles().map { it.value })
        assertEquals(listOf(true, true, false), model.state.tiles().map { it.enabled })
        assertTrue(model.state.tiles().none { it.chosen })
        assertTrue(Progression.backgroundKinds.isEmpty())

        model.chooseOrigin("theme", "docker")
        assertEquals("Choose Trained skills first", model.state.tiles().last().value)
        model.chooseClassSkill(Skill.ATHLETICS)
        model.chooseFreeSkills(Skill.ARCANA, Skill.INSIGHT)
        assertEquals("1 LEFT", model.state.tiles()[1].value)
        assertEquals(emptyList<Skill>(), model.state.themeOffer.skills)
        model.chooseFreeSkills(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH)
        assertEquals(listOf(Skill.STREETWISE, Skill.CULTURE), model.state.themeOffer.skills)
        model.chooseNovice(Skill.CULTURE)

        assertEquals(listOf("Athletics", "✓", "Culture"), model.state.tiles().map { it.value })
        assertTrue(model.state.tiles().all { it.chosen })
        val held = listOf("Athletics +3", "Stealth +3", "Arcana +3", "Culture +1", "Insight +3")
        assertEquals(held, model.state.rules.heldSkillLabels())
        val saved = model.state.document
        model.load(saved.id)
        assertEquals(saved, model.state.document)
        assertEquals(held, model.state.rules.heldSkillLabels())
    }

    @Test fun theSkillSlotsHaveTilesInsteadOfLevelRows() = runBlocking {
        val model = fighter()
        model.chooseOrigin("theme", "docker")
        val choices = Progression.levelChoices(model.state, 1)
        assertEquals(2, choices.count { it.slot.hasSkillTile() })
        val (powers, rows) = Progression.partitionLevelChoices(1, choices, model.powerEntryIds())
        assertTrue((powers + rows).none { it.slot.hasSkillTile() })
    }

    @Test fun changingClassOrThemeFlagsStaleSkillsAndRestoresThemWhenTheyFitAgain() = runBlocking {
        val model = fighter()
        model.chooseOrigin("theme", "docker")
        model.chooseClassSkill(Skill.ACROBATICS)
        model.chooseFreeSkills(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH)
        model.chooseNovice(Skill.STREETWISE)

        model.chooseOrigin("theme", "yerasol-veteran")
        assertEquals(listOf(Skill.ENDURANCE, Skill.COMMAND), model.state.themeOffer.skills)
        assertFalse(model.state.tiles().last().chosen)
        assertEquals(SkillRank.UNTRAINED, model.state.rules.skillRank(Skill.STREETWISE))
        model.chooseNovice(Skill.COMMAND)

        // Warlord grants Command outright, so the old Novice pick no longer fits.
        model.chooseOrigin("class", "warlord")
        val classTile = model.state.tiles().first()
        assertEquals("Command", classTile.value)
        assertTrue(classTile.chosen)
        assertFalse(classTile.enabled)
        assertEquals(listOf(Skill.ENDURANCE), model.state.themeOffer.skills)
        assertFalse(model.state.tiles().last().chosen)
        assertEquals(SkillRank.UNTRAINED, model.state.rules.skillRank(Skill.ACROBATICS))

        model.chooseOrigin("class", "fighter")
        assertEquals("Acrobatics", model.state.tiles().first().value)
        assertTrue(model.state.tiles().all { it.chosen })
    }

    @Test fun bothThemeSkillsBeingTrainedOffersEveryUntrainedSkill() = runBlocking {
        val model = fighter()
        model.chooseOrigin("theme", "docker")
        model.chooseClassSkill(Skill.ATHLETICS)
        model.chooseFreeSkills(Skill.STREETWISE, Skill.CULTURE, Skill.STEALTH)
        assertEquals(Skill.catalog - setOf(Skill.ATHLETICS, Skill.STREETWISE, Skill.CULTURE, Skill.STEALTH),
            model.state.themeOffer.skills)
        model.chooseNovice(Skill.OCCULTISM)
        assertEquals(SkillRank.NOVICE, model.state.rules.skillRank(Skill.OCCULTISM))
    }

    @Test fun pickerRowsPreviewDraftRanksAndOnlyBlockFreeDuplicates() = runBlocking {
        val model = fighter()
        model.chooseOrigin("theme", "docker")
        model.chooseClassSkill(Skill.ATHLETICS)
        model.chooseFreeSkills(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH)
        val rules = model.state.rules

        val free = rules.skillPickRows(Skill.catalog, freeSkillSlots, listOf(Skill.ARCANA, Skill.CULTURE), SkillRank.TRAINED)
            .associateBy { it.skill }
        assertTrue(free.getValue(Skill.ATHLETICS).blocked)
        assertEquals(SkillRank.TRAINED, free.getValue(Skill.CULTURE).rank)
        assertEquals(SkillRank.UNTRAINED, free.getValue(Skill.STEALTH).rank)
        assertFalse(free.getValue(Skill.ARCANA).blocked)
        // A saved pick that has become a duplicate stays clearable.
        assertFalse(rules.skillPickRows(Skill.catalog, freeSkillSlots, listOf(Skill.ATHLETICS), SkillRank.TRAINED)
            .single { it.skill == Skill.ATHLETICS }.blocked)

        val classSlot = rules.choices.single { it.slot.choiceId == ModernCreation.CLASS_SKILL_CHOICE }.slot
        assertTrue(rules.skillPickRows(listOf(Skill.ATHLETICS, Skill.ACROBATICS), listOf(classSlot), emptyList(),
            SkillRank.TRAINED).none { it.blocked })

        val novice = rules.skillPickRows(model.state.themeOffer.skills, listOf(model.state.themeOffer.slot),
            listOf(Skill.CULTURE), SkillRank.NOVICE)
        assertEquals(listOf(SkillRank.UNTRAINED, SkillRank.NOVICE), novice.map { it.rank })
        assertTrue(novice.none { it.blocked })
    }

    @Test fun pickerDraftsDropUnofferedSavedPicksAndRespectTheSlotCount() {
        val document = starter().let { base ->
            base.copy(levels = listOf(base.levels.single().copy(proficiencies = listOf(Skill.SOCIETY, Skill.DIPLOMACY,
                Skill.CULTURE).mapIndexed { index, skill -> ProficiencyChoice(ModernCreation.freeSkillSlot(index), skill) })))
        }
        assertEquals(listOf(Skill.CULTURE), savedSkillPicks(document, freeSkillSlots, Skill.catalog))
        val full = listOf(Skill.ARCANA, Skill.INSIGHT, Skill.STEALTH)
        assertEquals(full, toggleSkillPick(full, Skill.CULTURE, 3))
        assertEquals(full - Skill.INSIGHT, toggleSkillPick(full, Skill.INSIGHT, 3))
        assertEquals(listOf(Skill.CULTURE), toggleSkillPick(listOf(Skill.ARCANA), Skill.CULTURE, 1))
    }

    @Test fun theOverviewShowsEachRankWithATotalThatLeavesAbilitiesOut() = runBlocking {
        val model = fighter()
        model.chooseClassSkill(Skill.ATHLETICS)
        fun athletics() = model.state.rules.skillOverviewRows().single { it.skill == Skill.ATHLETICS }
        fun total() = (athletics().modifier as ContractResult.Available).value.total
        // The starter Fighter has Strength 4, which stays out of the total.
        assertEquals(SkillRank.TRAINED, athletics().rank)
        assertEquals(3, total())
        model.edit(BuilderEdit.Level(4))
        assertEquals(5, total())
        assertEquals(listOf("Athletics +5"), model.state.rules.heldSkillLabels())
    }

    @Test fun requirementsNameTheTrainedSkillByItsTwoPointZeroName() {
        val entry = ContentEntry("utility", EntryCategory.POWER, Presentation("Utility"),
            Mechanics(prerequisites = listOf(Prerequisite.Proficiency(Skill.SOCIETY))), Coverage(CoverageStatus.SUPPORTED))
        val row = BuilderOptionRow(CatalogEntry(EntryMetadata("utility", EntryCategory.POWER, "Utility", "chunk"),
            PackageRevision("standard", "1")), BuilderOption(ResolvedEntry(entry, PackageRevision("standard", "1"),
            ContractCodec.fingerprint(entry)), Eligibility.INELIGIBLE, emptyList()))
        assertEquals("Trained in Culture", entryRequirementPreview(row, emptyMap()).requirements)
    }
}
