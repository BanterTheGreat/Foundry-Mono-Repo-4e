package dev.modern4e.builder

import kotlinx.serialization.json.*

enum class CraftKnowledgeKind(val title: String, val packageId: String, private val prefix: String) {
    RITUAL("Rituals", "modern4e.rituals", "modern4e.ritual."),
    FORMULA("Crafting Formulas", "modern4e.formulas", "modern4e.formula.");

    fun matches(id: String): Boolean = id.startsWith(prefix)
}

/** Decode each relevant chunk once while reading the catalog. */
suspend fun ContentCatalog.craftKnowledgeEntries(): List<ContentEntry> {
    val reading = readSession()
    return reading.search(category = EntryCategory.ITEM)
        .filter { candidate -> CraftKnowledgeKind.entries.any { it.matches(candidate.metadata.id) } }
        .mapNotNull { (reading.lookup(it.metadata.id) as? ContractResult.Available)?.value?.entry }
}

private const val RitualMaster = "modern4e.feat.technique-master"
private const val Alchemist = "modern4e.feat.alchemist"
private const val Artificer = "modern4e.feature.artificer-techniques"
private const val Bard = "modern4e.feature.bard-techniques"
private const val Cleric = "modern4e.feature.cleric-divine-technique"
private const val Invoker = "modern4e.feature.invoker-ritual-casting"
private const val Wizard = "modern4e.feature.wizard-arcane-techniques"
private const val Spellbook = "modern4e.feature.wizard-spellbook"
private const val AlchemicalCreation = "modern4e.ritual.alchemical-creation"

private data class RitualPick(val maxLevel: Int, val category: String? = null) {
    fun accepts(entry: ContentEntry): Boolean {
        val rank = entry.knowledgeLevel ?: return false
        return rank <= maxLevel && (category == null || category == entry.ritualCategory)
    }
}

private val ContentEntry.knowledgeLevel: Int?
    get() = (sharedData?.get("level") as? JsonPrimitive)?.intOrNull
private val ContentEntry.ritualCategory: String?
    get() = (sharedData?.get("category") as? JsonPrimitive)?.content?.uppercase()

class CraftKnowledgeAccess internal constructor(
    private val level: Int,
    private val entries: Set<String>,
    private val sources: Set<String>,
    private val wizardOnly: Boolean,
    private val knowsAlchemicalCreation: Boolean,
) {
    val grantedRituals = buildSet {
        if (Artificer in entries || Alchemist in entries) {
            add(AlchemicalCreation)
        }
        if (Artificer in entries) {
            add("modern4e.ritual.brew-potion")
        }
        if (Invoker in entries) {
            add("modern4e.ritual.hand-of-fate")
        }
    }

    val hasBardPick: Boolean get() = Bard in entries
    private val picks = buildList {
        if (Bard in entries) {
            add(RitualPick(1))
        }
        if (Cleric in entries) {
            add(RitualPick(2, "DIVINE"))
        }
        if (Spellbook in entries) {
            val highestPick = listOf(1, 5, 11, 15, 21, 25).last { it <= level }
            add(RitualPick(highestPick, "ARCANE"))
        }
    }

    fun shows(kind: CraftKnowledgeKind): Boolean = when (kind) {
        CraftKnowledgeKind.RITUAL -> grantedRituals.isNotEmpty() || picks.isNotEmpty() || RitualMaster in entries
        CraftKnowledgeKind.FORMULA -> AlchemicalCreation in grantedRituals || knowsAlchemicalCreation &&
            (RitualMaster in entries || picks.isNotEmpty())
    }

    /** Eligibility for a new pick, including the Cleric's explicit level-two exception. */
    fun canLearn(kind: CraftKnowledgeKind, entry: ContentEntry): Boolean {
        if (!shows(kind) || !kind.matches(entry.id) || entry.id in grantedRituals) {
            return false
        }
        val rank = entry.knowledgeLevel ?: return false
        if (kind == CraftKnowledgeKind.FORMULA) {
            return rank <= level
        }
        return learnsByMastery(entry) || picks.any { it.accepts(entry) && matchesSource(entry) }
    }

    private fun matchesSource(entry: ContentEntry): Boolean {
        val category = entry.ritualCategory ?: return false
        return category !in setOf("ARCANE", "DIVINE", "PRIMAL") || category in sources
    }

    private fun learnsByMastery(entry: ContentEntry): Boolean {
        val rank = entry.knowledgeLevel ?: return false
        return RitualMaster in entries && rank <= level && matchesSource(entry) &&
            (!wizardOnly || entry.ritualCategory == "ARCANE")
    }
}

/** Use active feature and feat occurrences so planned selections never grant access. */
fun BuilderState.craftKnowledgeAccess(): CraftKnowledgeAccess {
    val active = rules.entries.filter { rules.entryEligibility[it.instanceId]?.status != Eligibility.INELIGIBLE }
    val ids = active.mapTo(mutableSetOf()) { it.definition.entry.id }
    val sources = active.flatMap { it.definition.entry.mechanics.classProfile?.powerSources.orEmpty() }.toSet()
    val masterGrants = active.filter { it.definition.entry.id == RitualMaster }
    val wizardOnly = Wizard in ids && Artificer !in ids && masterGrants.all { it.granted }
    val knowsAlchemicalCreation = document.craftKnowledge.any { it.entryId == AlchemicalCreation }
    return CraftKnowledgeAccess(document.level, ids, sources, wizardOnly, knowsAlchemicalCreation)
}
