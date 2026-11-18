package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

class PreparedFeatChoicesTest {
    private val slot = ChoiceSlotId("creation", "feat", 0)
    private fun document() = CharacterDocument(id = "prepared", savedAt = "2026-11-18T12:00:00Z",
        identity = CharacterIdentity("Prepared"), packages = emptyList(), level = 2,
        abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH, emptyMap()),
        levels = listOf(LevelDecisions(1), LevelDecisions(2)))
    private fun feat(id: String, mechanics: Mechanics = Mechanics(version = 2)) = ContentEntry(
        id, EntryCategory.FEAT, Presentation(id), mechanics, Coverage(CoverageStatus.SUPPORTED))
    private fun resolved(entry: ContentEntry) = ResolvedEntry(entry, PackageRevision("standard", "1"), ContractCodec.fingerprint(entry))
    private fun selection(entry: ResolvedEntry) = SavedSelection(entry.entry.id, entry.entry.presentation.title,
        entry.supplier.packageId, entry.fingerprint)
    private fun candidate(document: CharacterDocument, entry: ResolvedEntry, slot: ChoiceSlotId = this.slot,
        level: Int = 1, instance: String = "candidate") = document.copy(levels = document.levels.map {
        it.copy(entries = it.entries.filterNot { it.slot == slot } +
            if (it.level == level) listOf(EntryChoice(instance, slot, selection(entry))) else emptyList())
    })

    @Test fun passiveCandidatesReuseActivationAndMatchHistoricalEligibility() {
        val document = document()
        val feats = (1..20).map { number -> resolved(feat("feat-$number", Mechanics(version = 2,
            prerequisites = listOf(if (number % 2 == 0) Prerequisite.Level(2) else Prerequisite.AbilityPoints(Ability.STRENGTH, 1)),
            unsupported = listOf("Combat effects remain manual")))) }
        val entries = feats.associate { it.entry.id to ContractResult.Available(it) }
        val prepared = RulesEngine.prepareFeatChoices(document, 1, slot)
        for (feat in feats) {
            val content = RulesContent(entries, mapOf(selection(feat) to ContractResult.Available(feat)))
            val fast = assertNotNull(prepared.check(feat, content, "candidate"))
            val full = RulesEngine.evaluateChoice(candidate(document, feat), content, "candidate")
            assertEquals(full.entryEligibility.getValue("candidate"), fast.eligibility)
            assertEquals(full.diagnostics.filter { it.slot == slot && it.entryId == feat.entry.id }, fast.diagnostics)
        }
        assertEquals(1, prepared.factPreparations, "A list of passive feats should activate the character only once")
        val fresh = RulesEngine.prepareFeatChoices(document, 1, slot)
        val first = feats.first()
        fresh.check(first, RulesContent(entries, mapOf(selection(first) to ContractResult.Available(first))), "candidate")
        assertEquals(1, fresh.factPreparations, "A new picker must not retain an old activation")
    }

    @Test fun activeMechanicsAndNonRootChoicesFallBackToCandidateActivation() {
        val document = document()
        val active = resolved(feat("active", Mechanics(version = 2, grants = listOf(Grant.Proficiency("skill", Skill.ARCANA)))))
        val content = RulesContent(mapOf(active.entry.id to ContractResult.Available(active)),
            mapOf(selection(active) to ContractResult.Available(active)))
        val prepared = RulesEngine.prepareFeatChoices(document, 1, slot)
        assertNull(prepared.check(active, content, "candidate"))
        assertEquals(0, prepared.factPreparations)
        val passive = resolved(feat("passive"))
        assertNull(RulesEngine.prepareFeatChoices(document, 1, ChoiceSlotId("class", "feats", 0))
            .check(passive, content, "candidate"))
    }

    @Test fun repeatLimitsAndMissingPrerequisitesKeepTheOrdinaryResult() {
        val entry = resolved(feat("limited", Mechanics(version = 2, maximumSelections = 1,
            prerequisites = listOf(Prerequisite.Entry("missing")))))
        val first = EntryChoice("earlier", slot, selection(entry))
        val document = document().copy(levels = listOf(LevelDecisions(1, entries = listOf(first)), LevelDecisions(2)))
        val laterSlot = ChoiceSlotId("advancement.2", "feat", 0)
        val content = RulesContent(emptyMap(), mapOf(selection(entry) to ContractResult.Available(entry)))
        val fast = assertNotNull(RulesEngine.prepareFeatChoices(document, 2, laterSlot).check(entry, content, "candidate"))
        val full = RulesEngine.evaluateChoice(candidate(document, entry, laterSlot, 2), content, "candidate")
        assertEquals(full.entryEligibility.getValue("candidate"), fast.eligibility)
        assertEquals(Eligibility.INELIGIBLE, fast.eligibility.status)
        val withoutEarlier = document.copy(levels = listOf(LevelDecisions(1), LevelDecisions(2)))
        val missing = assertNotNull(RulesEngine.prepareFeatChoices(withoutEarlier, 2, laterSlot).check(entry, content, "candidate"))
        assertEquals(Eligibility.UNRESOLVED, missing.eligibility.status)
    }

    @Test fun candidateCannotQualifyThroughBenefitsDependingOnItsOwnSelection() {
        val entry = resolved(feat("candidate", Mechanics(version = 2,
            prerequisites = listOf(Prerequisite.Proficiency(Skill.ARCANA)))))
        val dependent = resolved(ContentEntry("dependent", EntryCategory.THEME, Presentation("Dependent"),
            Mechanics(version = 2, prerequisites = listOf(Prerequisite.Entry(entry.entry.id)),
                grants = listOf(Grant.Proficiency("skill", Skill.ARCANA))), Coverage(CoverageStatus.SUPPORTED)))
        val theme = EntryChoice("theme", ChoiceSlotId("creation", "theme", 0), selection(dependent))
        val document = document().copy(levels = listOf(LevelDecisions(1, entries = listOf(theme)), LevelDecisions(2)))
        val content = RulesContent(mapOf(entry.entry.id to ContractResult.Available(entry),
            dependent.entry.id to ContractResult.Available(dependent)), mapOf(
            selection(entry) to ContractResult.Available(entry), selection(dependent) to ContractResult.Available(dependent)))
        val fast = assertNotNull(RulesEngine.prepareFeatChoices(document, 1, slot).check(entry, content, "candidate"))
        val full = RulesEngine.evaluateChoice(candidate(document, entry), content, "candidate")
        assertEquals(full.entryEligibility.getValue("candidate"), fast.eligibility)
        assertEquals(Eligibility.INELIGIBLE, fast.eligibility.status)
    }

    @Test fun passiveProductionFeatsMatchTargetedActivation() = synchronous {
        for (level in 1..2) {
            val document = CurrentDataFixtures.sample(level)
            val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
                ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", document.packages)).value.readSession()
            val preparation = RulesContentPreparation(catalog)
            val prepared = RulesEngine.prepareFeatChoices(document, 1, slot)
            var checked = 0
            for (metadata in catalog.search(category = EntryCategory.FEAT)) {
                val feat = (catalog.lookup(metadata.metadata.id) as? ContractResult.Available)?.value ?: continue
                val candidate = candidate(document, feat)
                val content = preparation.load(candidate)
                val fast = prepared.check(feat, content, "candidate") ?: continue
                val full = RulesEngine.evaluateChoice(candidate, content, "candidate")
                assertEquals(full.entryEligibility.getValue("candidate"), fast.eligibility, feat.entry.id)
                assertEquals(full.diagnostics.filter { it.slot == slot && it.entryId == feat.entry.id }, fast.diagnostics, feat.entry.id)
                checked++
                if (checked == 36) {
                    break
                }
            }
            assertEquals(36, checked, "Production catalog should exercise the passive fast path")
        }
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
