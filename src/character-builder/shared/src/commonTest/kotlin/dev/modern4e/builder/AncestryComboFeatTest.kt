package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** Production ancestry/class combinations stay discoverable in the Ancestry feat tab. */
class AncestryComboFeatTest {
    @Test
    fun comboFeatUsesAncestryTabAndStillChecksItsClassPrerequisite() = run {
        val starter = CurrentDataFixtures.sample()
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", starter.packages)).value.readSession()
        val operations = BuilderOperations(catalog)
        val featId = "modern4e.feat.hunters-advantage-ancestries-elf-paragon-class-combo"
        val featSlot = ChoiceSlotId("advancement.11", "feat", 0)
        suspend fun pick(id: String, kind: String) = assertIs<ContractResult.Available<ResolvedEntry?>>(
            catalog.lookup(id)).value!!.let { resolved ->
            EntryChoice(kind, ChoiceSlotId("creation", kind, 0), SavedSelection(id,
                resolved.entry.presentation.title, resolved.supplier.packageId, resolved.fingerprint))
        }
        suspend fun document(classId: String, ancestryId: String) = CharacterDocument(
            id = "combo-feat", savedAt = "2026-11-19T00:00:00Z", identity = CharacterIdentity("Combination"),
            packages = starter.packages, level = 11,
            abilities = AbilityAllocation(ChoiceSlotId("class", "main", 0), Ability.STRENGTH,
                mapOf(Ability.STRENGTH to 4, Ability.CONSTITUTION to 2, Ability.DEXTERITY to 2, Ability.INTELLIGENCE to 1)),
            levels = listOf(LevelDecisions(1, entries = listOf(pick(classId, "class"), pick(ancestryId, "ancestry"))),
                LevelDecisions(8, abilityAdvancements = listOf(AbilityAdvancement(AdvancementRules.abilitySlot(8),
                    mapOf(Ability.DEXTERITY to 1, Ability.CONSTITUTION to 1)))), LevelDecisions(11)))

        val elfRanger = operations.optionListing(document("modern4e.class.ranger", "modern4e.ancestry.elf"), 11, featSlot)
        assertTrue(elfRanger.rows(FeatGroup.ANCESTRY).any { it.metadata.metadata.id == featId })
        assertFalse(elfRanger.rows(FeatGroup.CLASS).any { it.metadata.metadata.id == featId })
        assertEquals(Eligibility.ELIGIBLE, elfRanger.check(listOf(featId)).single().option?.eligibility)

        val elfFighter = operations.optionListing(document("modern4e.class.fighter", "modern4e.ancestry.elf"), 11, featSlot)
        assertTrue(elfFighter.rows(FeatGroup.ANCESTRY).any { it.metadata.metadata.id == featId })
        val wrongClass = elfFighter.check(listOf(featId)).single()
        assertEquals(Eligibility.INELIGIBLE, wrongClass.option?.eligibility)
        assertTrue(wrongClass.diagnostics.any { it.code == "engine.prerequisite" })

        val dwarfRanger = operations.optionListing(document("modern4e.class.ranger", "modern4e.ancestry.dwarf"), 11, featSlot)
        assertFalse(dwarfRanger.rows(FeatGroup.ANCESTRY).any { it.metadata.metadata.id == featId })
        assertTrue(dwarfRanger.check(listOf(featId)).isEmpty())
    }

    private fun run(block: suspend () -> Unit) {
        var result: Result<Unit>? = null
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) { result = value }
        })
        checkNotNull(result).getOrThrow()
    }
}
