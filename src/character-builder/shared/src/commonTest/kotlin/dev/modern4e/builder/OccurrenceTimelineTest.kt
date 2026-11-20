package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** The occurrence timeline alone: activation, acquisition levels, substitutions, retirements and the per-entry rule. */
class OccurrenceTimelineTest {
    private fun entry(id: String, category: EntryCategory, mechanics: Mechanics = Mechanics(version = 2)) =
        ContentEntry(id, category, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))
    private val profile = ContractCodec.json.decodeFromString<EntryChunk>(contractFixtures.getValue("shared-fighter-chunk.json"))
        .entries.single { it.category == EntryCategory.CLASS }.mechanics.classProfile!!

    private val early = entry("early", EntryCategory.FEATURE)
    private val late = entry("late", EntryCategory.FEATURE)
    private val technique = entry("technique", EntryCategory.FEAT)
    private val alchemist = entry("alchemist", EntryCategory.FEAT)
    private val bonus = entry("bonus", EntryCategory.FEATURE)
    private val pick = entry("pick", EntryCategory.FEATURE, Mechanics(version = 2, grants = listOf(Grant.Entry("bonus", bonus.id))))
    private val clazz = entry("class", EntryCategory.CLASS, Mechanics(version = 2, classProfile = profile,
        grants = listOf(Grant.Entry("early", early.id, atLevel = 3),
            Grant.Entry("technique", technique.id, replacementEntryIds = listOf(alchemist.id))),
        choices = listOf(ChoiceDefinition.Entries("talent", 1, listOf(pick.id), atLevel = 2)),
        progression = listOf(ClassProgression(5, grants = listOf(Grant.Entry("late", late.id, atLevel = 4))))))
    private val multiclass = entry("multiclass", EntryCategory.FEAT, Mechanics(version = 2, multiclassFor = "wizard",
        grants = listOf(Grant.Entry("bonus", bonus.id))))
    private val definitions = listOf(early, late, technique, alchemist, bonus, pick, clazz, multiclass)

    private fun saved(entry: ContentEntry) = SavedSelection(entry.id, entry.presentation.title, "standard", ContractCodec.fingerprint(entry))
    private fun resolved(entry: ContentEntry) = ContractResult.Available(ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry)))
    private val classSlot = ChoiceSlotId("creation", "class", 0)
    private val techniqueSlot = ChoiceSlotId("class", "technique", 0)

    /** A character of [level] with the class at 1 and [extra] decisions at their levels. */
    private fun document(level: Int, vararg extra: Pair<Int, EntryChoice>) = CharacterDocument(id = "timeline",
        savedAt = "2026-11-20T12:00:00Z", identity = CharacterIdentity("Timeline"), packages = emptyList(), level = level,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, mapOf(Ability.STRENGTH to 4)),
        levels = (1..level).map { row -> LevelDecisions(row, entries =
            (if (row == 1) listOf(EntryChoice("class", classSlot, saved(clazz))) else emptyList()) +
                extra.filter { it.first == row }.map { it.second }) })

    /** Content for [document]; [missing] definitions are absent, so picks of them stay unresolved. */
    private fun timeline(document: CharacterDocument, missing: Set<String> = emptySet()): OccurrenceTimeline {
        val available = definitions.filter { it.id !in missing }.associateBy { it.id }
        val selections = document.levels.flatMap { it.entries }.associate { decision ->
            decision.selection to (available[decision.selection.entryId]?.let { resolved(it) }
                ?: ContractResult.Unavailable(listOf(Diagnostic("test.missing", DiagnosticKind.UNRESOLVED_CONTENT, "Missing"))))
        }
        return OccurrenceTimeline.of(document, RulesContent(available.mapValues { resolved(it.value) }, selections))
    }

    private fun OccurrenceTimeline.levelOf(id: String) = acquisitionLevel(entries.single { it.definition.entry.id == id })
    private fun OccurrenceTimeline.owns(id: String) = entries.any { it.definition.entry.id == id }

    @Test
    fun grantsActivateAtTheLaterOfTheirOwnAndTheirOwnersLevel() {
        val pickChoice = EntryChoice("talent-pick", ChoiceSlotId("class", "talent", 0), saved(pick))
        val atTwo = timeline(document(2, 2 to pickChoice))
        assertFalse(atTwo.owns(early.id), "A level-3 grant is not active at level 2")
        assertEquals(1, atTwo.levelOf(technique.id))
        assertEquals(2, atTwo.choiceLevels[ChoiceSlotId("class", "talent", 0)])
        assertEquals(2, atTwo.levelOf(pick.id), "A pick is acquired at the level that saved it")
        assertEquals(2, atTwo.levelOf(bonus.id), "A grant inherits its owner's later acquisition")

        val atFive = timeline(document(5, 2 to pickChoice))
        assertEquals(3, atFive.levelOf(early.id))
        assertEquals(5, atFive.levelOf(late.id), "A progression grant waits for its progression row")
        assertEquals(5, atFive.decisionLevels[ChoiceSlotId("class", "late", 0)])
        assertFalse(timeline(document(4)).owns(late.id))
    }

    @Test
    fun aMulticlassFeatActivatesAtTheLevelItWasChosen() {
        val feat = EntryChoice("feat-6", ChoiceSlotId("advancement.6", "feat", 0), saved(multiclass))
        assertFalse(timeline(document(5)).owns(multiclass.id))
        val timeline = timeline(document(8, 6 to feat))
        assertEquals(6, timeline.levelOf(multiclass.id))
        val granted = timeline.entries.single { it.slot == ChoiceSlotId("feat-6", "bonus", 0) }
        assertEquals(6, timeline.acquisitionLevel(granted))
        assertTrue(granted.granted)
    }

    @Test
    fun aSubstitutionKeepsTheGrantSlotAndOccurrenceIdentity() {
        val identity = ModernCreation.grantInstance("class", "technique")
        val default = timeline(document(1))
        assertEquals(technique.id, default.entries.single { it.slot == techniqueSlot }.definition.entry.id)
        assertTrue(techniqueSlot in default.substitutionChoices)

        val substituted = timeline(document(1, 1 to EntryChoice(identity, techniqueSlot, saved(alchemist))))
        val occurrence = substituted.entries.single { it.slot == techniqueSlot }
        assertEquals(alchemist.id, occurrence.definition.entry.id)
        assertEquals(identity, occurrence.instanceId)
        assertTrue(occurrence.granted)
        assertFalse(substituted.owns(technique.id))

        val late = timeline(document(2, 2 to EntryChoice(identity, techniqueSlot, saved(alchemist))))
        assertEquals(technique.id, late.entries.single { it.slot == techniqueSlot }.definition.entry.id,
            "A substitution recorded after its grant's acquisition leaves the default active")
        assertTrue(late.events.any { it is TimelineEvent.LateSubstitution })
    }

    @Test
    fun dailyReplacementsRetireTheirOccurrencesAtNineFifteenAndNineteen() = synchronous {
        val fixture = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(contractFixtures.getValue("sample-regression-fighter-19.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", fixture.packages)).value
        val timeline = OccurrenceTimeline.of(fixture, RulesContent.load(fixture, catalog))
        assertEquals(listOf(9, 15, 19), timeline.retirements.map { it.level })
        assertEquals(listOf("modern4e.power.fighter-power1429" to "modern4e.power.fighter-power10478",
            "modern4e.power.fighter-power10153" to "modern4e.power.fighter-power10002",
            "modern4e.power.fighter-power1524" to "modern4e.power.fighter-power10005"),
            timeline.retirements.map { it.retiredDefinition.entry.id to it.replacementDefinition.entry.id })
        for (retirement in timeline.retirements) {
            assertEquals(retirement.retired.instanceId, retirement.replacement.instanceId)
            assertEquals(retirement.retired.slot, retirement.replacement.slot)
            assertFalse(timeline.owns(retirement.retiredDefinition.entry.id))
            val active = timeline.entries.single { it.instanceId == retirement.retired.instanceId }
            assertEquals(retirement.replacementDefinition.entry.id, active.definition.entry.id)
            assertEquals(retirement.level, timeline.acquisitionLevel(active))
        }
        assertEquals(listOf(1, 5, 1), timeline.retirements.map { it.firstChosenAt })
        assertEquals(6, timeline.levelOf("modern4e.feat.student-of-battle"))
        assertEquals(11, timeline.levelOf("modern4e.path.notorious-celebrity"))
        assertEquals(12, timeline.levelOf("modern4e.power.path-summon-audience"))
        assertTrue(timeline.unresolved.isEmpty())
    }

    @Test
    fun picksWithMissingContentStaySavedButActivateNothing() {
        val pickChoice = EntryChoice("talent-pick", ChoiceSlotId("class", "talent", 0), saved(pick))
        val timeline = timeline(document(2, 2 to pickChoice), missing = setOf(pick.id))
        assertFalse(timeline.owns(pick.id))
        assertFalse(timeline.owns(bonus.id), "Nothing below an unresolved pick activates")
        assertTrue(pickChoice in timeline.decisions)
        assertTrue(pickChoice in timeline.used, "The offered slot still consumes the saved pick")
        assertEquals(listOf(pick.id), timeline.unresolved.map { it.entryId })
        assertEquals(pickChoice.selection, timeline.unresolved.single().selection)
    }

    @Test
    fun theEntryRuleNeedsOnlyTheEntry() {
        assertEquals(listOf("technique" to 1), clazz.activation(2).grants.map { (it.grant as Grant.Entry).grantId to it.atLevel },
            "The level-3 grant and the level-5 progression row are not reached at 2")
        val atFive = clazz.activation(5)
        assertEquals(listOf("early" to 3, "technique" to 1, "late" to 5),
            atFive.grants.map { (it.grant as Grant.Entry).grantId to it.atLevel })
        assertEquals(listOf(alchemist.id), (atFive.grants[1].grant as Grant.Entry).replacementEntryIds)
        assertEquals(listOf(5), atFive.progression.map { it.level })
        assertEquals(listOf("talent" to 2, "main" to 1), atFive.choices.map { timed ->
            when (val choice = timed.choice) {
                is ChoiceDefinition.Entries -> choice.id
                is ChoiceDefinition.MainAbility -> choice.id
                else -> error("unexpected $choice")
            } to timed.atLevel
        }, "A class profile opens the main-ability choice")
        assertEquals(listOf("main"), clazz.activation(1).choices.map { (it.choice as ChoiceDefinition.MainAbility).id })
        assertEquals(3, clazz.activation(Int.MAX_VALUE).grants.size)
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
