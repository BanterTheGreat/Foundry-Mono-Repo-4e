package dev.modern4e.builder

import kotlin.coroutines.*
import kotlin.test.*

/** The listing-wide and per-row proofs must agree on which feat mechanics can reach a power candidate. */
class FeatChangeListingReuseTest {
    private val plainFeat = ContentEntry("test.feat.plain", EntryCategory.FEAT, Presentation("Plain"),
        Mechanics(version = 2), Coverage(CoverageStatus.SUPPORTED))

    /** No production feat carries a class profile today; one could still supply facts such as proficiencies. */
    private val classProfileFeat = plainFeat.copy(id = "test.feat.class-profile", mechanics = Mechanics(version = 2,
        classProfile = ClassProfile("DEFENDER", listOf("MARTIAL"), listOf(Ability.STRENGTH), emptyList(),
            listOf("armor", "shields", "weapons", "implements").associateWith { emptyList() },
            listOf(Statistic.FORTITUDE, Statistic.REFLEX, Statistic.WILL, Statistic.HIT_POINTS, Statistic.HEALING_SURGES)
                .associateWith { ClassFormula(10) })))

    @Test
    fun aFeatClassProfileKeepsADependentPowerListingFromBeingIgnored() = synchronous {
        val document = assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(contractFixtures.getValue("sample-regression-fighter-19.json"))).value
        val catalog = assertIs<ContractResult.Available<ContentCatalog>>(
            ContentCatalog.open(CurrentDataFixtures, "modern4e.classes", document.packages)).value
        val slot = ChoiceSlotId("fighter", "modern4e.choice.class-utility-17", 0)
        val listing = BuilderOperations(catalog).browsingSession().optionListing(document, 17, slot, "utility-17")
        val rows = listing.check(listing.rows().map { it.metadata.metadata.id })
        assertTrue(rows.all { it.checked })
        val skillGated = rows.mapNotNull { it.option?.entry?.entry }.first { power ->
            (power.mechanics.prerequisites + listOfNotNull(power.mechanics.access)).flatMap { it.leaves() }
                .any { it is Prerequisite.Proficiency }
        }

        assertTrue(ListingRetention.canIgnoreFeatChange(listing, plainFeat), "A passive feat cannot reach these utilities")
        assertFalse(ListingRetention.canIgnoreFeatChange(listing, classProfileFeat), "A class profile is an indirect effect")
        val categories = catalog.search().associate { it.metadata.id to it.metadata.category }
        assertTrue(ChoiceCacheDependencies.canRetain(skillGated, listOf(plainFeat), categories))
        assertFalse(ChoiceCacheDependencies.canRetain(skillGated, listOf(classProfileFeat), categories),
            "The per-row proof already treats a class profile as indirect")
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
