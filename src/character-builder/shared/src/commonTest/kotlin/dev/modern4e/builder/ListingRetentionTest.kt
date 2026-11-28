package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/**
 * Retention verdicts over pairs of characters, with production content and no session or storage. Each case builds a
 * fully checked listing for the character before an edit, asks for its verdict and applies it, then reports what the
 * listing for the character after the edit would publish first: kept, dropped, or rebased with k of n rows to check
 * (and how many candidates are new to the slot).
 */
class ListingRetentionTest {
    private class World(val operations: BuilderOperations) {
        suspend fun state(document: CharacterDocument) = operations.evaluate(document)

        suspend fun edit(state: BuilderState, edit: BuilderEdit): BuilderState {
            val result = operations.apply(state.document, edit)
            assertTrue(result.applied, result.diagnostics.toString())
            return result.state
        }

        /** A listing as a picker makes it, with every tab listed and every row checked. */
        suspend fun listing(state: BuilderState, level: Int, slot: ChoiceSlotId): BuilderOptionListing {
            val instance = state.document.levels.flatMap { it.entries }.firstOrNull { it.slot == slot }?.instanceId
                ?: "new-${slot.choiceId}-${slot.ordinal}"
            val listing = operations.browsingSession().optionListing(state.document, level, slot, instance,
                if (slot.choiceId == "feat") state.featClasses() else null, state.featAncestries())
            for (group in groups(slot)) {
                assertTrue(listing.check(listing.rows(group).map { it.metadata.metadata.id }).all { it.checked })
            }
            return listing
        }

        /** What the listing publishes first after the edit, per tab. */
        suspend fun outcome(listing: BuilderOptionListing, before: BuilderState, after: BuilderState,
            group: FeatGroup? = null): String = when (val verdict = ListingRetention.verdict(before, after, listing)) {
            RetentionVerdict.Drop -> "dropped"
            RetentionVerdict.Keep -> "kept"
            is RetentionVerdict.Rebase -> {
                val rows = assertNotNull(listing.retainedAfter(verdict, after, operations.browsingSession())).rows(group)
                // A rebase keeps every loaded definition; only candidates new to the slot have none yet.
                val new = rows.count { it.option == null }
                "rebased ${rows.count { !it.checked }}/${rows.size}" + if (new > 0) ", $new new" else ""
            }
        }

        /** The first eligible candidate, saved with the occurrence ID the listing checked it with. */
        suspend fun pick(state: BuilderState, listing: BuilderOptionListing): BuilderState {
            val id = listing.rows().first { it.option?.eligibility == Eligibility.ELIGIBLE }.metadata.metadata.id
            return edit(state, BuilderEdit.Entry(listing.level, listing.slot, id, listing.newInstanceId!!, true))
        }

        private fun groups(slot: ChoiceSlotId) = if (slot.choiceId == "feat") FeatGroup.entries else listOf(null)
    }

    private suspend fun world(document: CharacterDocument) = World(BuilderOperations(assertIs<ContractResult.Available<ContentCatalog>>(
        ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", document.packages)).value))

    private val regressionFighter
        get() = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(contractFixtures.getValue("sample-regression-fighter-19.json"))).value

    /** A level 6 Fighter with every class attack power still to choose. */
    private val openFighter: CharacterDocument
        get() {
            val original = CurrentDataFixtures.sample()
            return original.copy(level = 6, levels = original.levels.map { decisions ->
                decisions.copy(entries = decisions.entries.filterNot { it.slot.choiceId.startsWith("modern4e.choice.class-attack") })
            } + (2..6).map { LevelDecisions(it) })
        }

    private fun BuilderState.pool(name: String, ordinal: Int = 0): ChoiceSlotId =
        rules.choices.first { it.slot.choiceId == "modern4e.choice.$name" && it.slot.ordinal == ordinal }.slot

    private val utility17 = ChoiceSlotId("fighter", "modern4e.choice.class-utility-17", 0)
    private val encounter13 = ChoiceSlotId("fighter", "modern4e.choice.class-attack-encounter-13", 0)
    private val unrelatedFeat = BuilderEdit.Entry(14, ChoiceSlotId("advancement.14", "feat", 0),
        "modern4e.feat.fast-runner", "feat-14")

    @Test
    fun aListingOfAnotherCharacterIsDropped() = synchronous {
        val world = world(regressionFighter)
        val before = world.state(regressionFighter)
        val listing = world.listing(before, 13, encounter13)
        val other = world.state(regressionFighter.copy(id = "another-character"))
        assertEquals("dropped", world.outcome(listing, before, other))
    }

    @Test
    fun anEditAboveTheListingLevelKeepsItAndAnAbilityEditBelowRechecksEveryRow() = synchronous {
        val world = world(regressionFighter)
        val before = world.state(regressionFighter)
        val encounter = world.listing(before, 13, encounter13)
        val utility = world.listing(before, 17, utility17)

        val featEdited = world.edit(before, unrelatedFeat)
        assertEquals("kept", world.outcome(encounter, before, featEdited))

        val abilityEdited = world.edit(before, BuilderEdit.Advancement(8, AbilityAdvancement(AdvancementRules.abilitySlot(8),
            mapOf(Ability.STRENGTH to 1, Ability.WISDOM to 1))))
        assertEquals("rebased 164/164", world.outcome(encounter, before, abilityEdited))
        assertEquals("rebased 354/354", world.outcome(utility, before, abilityEdited))
    }

    /**
     * The regression Fighter replaced daily attacks at levels 9 and 15. An unrelated feat edit must not recheck every
     * feat row just because the retired originals are no longer active: only the edited selections count as changed,
     * and retired ones are resolved through the occurrence timeline.
     */
    @Test
    fun anUnrelatedFeatEditRechecksOnlyDependentFeatRowsDespiteRetiredReplacements() = synchronous {
        val world = world(regressionFighter)
        val before = world.state(regressionFighter)
        assertTrue(before.document.levels.any { it.replacements.isNotEmpty() })
        val feat = world.listing(before, 18, ChoiceSlotId("advancement.18", "feat", 0))

        val after = world.edit(before, unrelatedFeat)

        assertEquals(listOf("class: rebased 0/77", "ancestry: rebased 0/11", "general: rebased 49/148"),
            listOf(FeatGroup.CLASS, FeatGroup.ANCESTRY, FeatGroup.GENERAL).map { group ->
                "${group.name.lowercase()}: ${world.outcome(feat, before, after, group)}"
            })
    }

    @Test
    fun aDailyPickKeepsOtherUsageAndUtilityListsButRechecksLaterDaily() = synchronous {
        val world = world(openFighter)
        val before = world.state(openFighter)
        val daily = world.listing(before, 1, before.pool("class-attack-daily"))
        val laterDaily = world.listing(before, 5, before.pool("class-attack-daily-5"))
        val independent = listOf(1 to before.pool("class-attack-at-will"), 1 to before.pool("class-attack-encounter"),
            3 to before.pool("class-attack-encounter-3"), 2 to before.pool("class-utility-2"))
            .map { (level, slot) -> world.listing(before, level, slot) }

        val after = world.pick(before, daily)

        assertEquals("kept", world.outcome(daily, before, after), "The edited slot reuses its candidate checks")
        for (listing in independent) {
            assertTrue(world.outcome(listing, before, after).let { it == "kept" || it.startsWith("rebased 0/") },
                "Daily does not affect ${listing.slot}")
        }
        assertTrue(world.outcome(laterDaily, before, after).let { it.startsWith("rebased ") && !it.startsWith("rebased 0/") },
            "Later Daily must account for the newly known power")
    }

    @Test
    fun aUtilityPickKeepsAttackListsAndRechecksLaterUtility() = synchronous {
        val world = world(openFighter)
        val before = world.state(openFighter)
        val utility = world.listing(before, 2, before.pool("class-utility-2"))
        val laterUtility = world.listing(before, 6, before.pool("class-utility-6"))
        val attacks = listOf(1 to before.pool("class-attack-at-will"), 3 to before.pool("class-attack-encounter-3"),
            5 to before.pool("class-attack-daily-5")).map { (level, slot) -> world.listing(before, level, slot) }

        val after = world.pick(before, utility)

        assertEquals("kept", world.outcome(utility, before, after))
        for (listing in attacks) {
            assertTrue(world.outcome(listing, before, after).let { it == "kept" || it.startsWith("rebased 0/") },
                "Utility does not affect ${listing.slot}")
        }
        val later = world.outcome(laterUtility, before, after)
        assertTrue(later.startsWith("rebased ") && later.substringAfter("rebased ").substringBefore("/") ==
            later.substringAfter("/"), later)
    }

    @Test
    fun aFeatChangeKeepsOrdinaryClassPowerLists() = synchronous {
        val feat = ChoiceSlotId("creation", "feat", 0)
        val world = world(openFighter)
        val before = world.edit(world.state(openFighter), BuilderEdit.RemoveEntry(feat))
        val powers = listOf(1 to before.pool("class-attack-at-will"), 1 to before.pool("class-attack-encounter"),
            5 to before.pool("class-attack-daily-5"), 2 to before.pool("class-utility-2"))
            .map { (level, slot) -> world.listing(before, level, slot) }

        val after = world.edit(before, BuilderEdit.Entry(1, feat, "modern4e.feat.improved-initiative", "feat-1", true))

        for (listing in powers) {
            assertTrue(world.outcome(listing, before, after).let { it == "kept" || it.startsWith("rebased 0/") },
                "Feat does not affect ordinary class power ${listing.slot}")
        }
    }

    @Test
    fun clearingAPowerRechecksLaterChoicesButKeepsTheClearedSlotAndOtherUsages() = synchronous {
        val world = world(openFighter)
        val start = world.state(openFighter)
        val atWill = world.listing(start, 1, start.pool("class-attack-at-will"))
        val sibling = world.listing(start, 1, start.pool("class-attack-at-will", 1))
        val withAtWill = world.pick(start, atWill)
        assertEquals("rebased ${sibling.rows().size}/${sibling.rows().size}", world.outcome(sibling, start, withAtWill),
            "Same-level duplicate checks must be rechecked")

        val daily = world.listing(withAtWill, 1, withAtWill.pool("class-attack-daily"))
        val before = world.pick(withAtWill, daily)
        val laterDaily = world.listing(before, 5, before.pool("class-attack-daily-5"))
        val independent = world.listing(before, 1, before.pool("class-attack-at-will", 1))

        val after = world.edit(before, BuilderEdit.RemoveEntry(daily.slot))

        assertTrue(world.outcome(independent, before, after).let { it == "kept" || it.startsWith("rebased 0/") })
        assertTrue(world.outcome(daily, before, after).let { it == "kept" || it.startsWith("rebased 0/") },
            "Clearing a slot retains its independent candidate checks")
        assertFalse(world.outcome(laterDaily, before, after).let { it == "kept" || it.startsWith("rebased 0/") },
            "Clearing Daily changes later duplicate eligibility")
    }

    @Test
    fun abilityClassAndOccurrenceChangesRecheckEveryRow() = synchronous {
        val world = world(openFighter)
        val before = world.state(openFighter)
        val daily = world.listing(before, 1, before.pool("class-attack-daily"))
        val allocation = before.document.abilities
        val allocated = world.edit(before, BuilderEdit.Allocation(allocation.copy(points = allocation.points +
            mapOf(Ability.DEXTERITY to 1, Ability.WISDOM to 1))))
        val size = daily.rows().size
        assertEquals("rebased $size/$size", world.outcome(daily, before, allocated), "Ability changes recheck every row")

        val wizard = world.edit(before, BuilderEdit.Entry(1, ChoiceSlotId("creation", "class", 0), "modern4e.class.wizard",
            "fighter", true))
        val wizardDaily = world.outcome(daily, before, wizard)
        assertTrue(Regex("""rebased (\d+)/\1, \d+ new""").matches(wizardDaily), "A class change rechecks every row: $wizardDaily")

        val feat = world.listing(before, 4, ChoiceSlotId("advancement.4", "feat", 0))
        val chosen = world.edit(before, BuilderEdit.Entry(4, feat.slot, "modern4e.feat.toughness", "first-occurrence", true))
        val featListing = world.listing(chosen, 4, feat.slot)
        val decisions = chosen.document.levels.single { it.level == 4 }
        val moved = world.edit(chosen, BuilderEdit.LaterDecisions(decisions.copy(entries = decisions.entries.map {
            if (it.slot == feat.slot) it.copy(instanceId = "changed-occurrence") else it
        })))
        val general = world.outcome(featListing, chosen, moved, FeatGroup.GENERAL)
        assertTrue(general.substringAfter("rebased ").substringBefore("/") == general.substringAfter("/"),
            "A changed occurrence rechecks every row: $general")
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
