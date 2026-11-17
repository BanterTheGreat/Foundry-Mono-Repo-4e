package dev.modern4e.builder

/** Printed advancement schedule; totals describe grants, never calculated combat statistics. */
data class ProgressionLevel(val level: Int, val powers: List<String>, val feat: Boolean,
    val ability: String? = null, val replacement: String? = null, val automatic: List<String> = emptyList())

object Progression {
    fun level(n: Int): ProgressionLevel {
        require(n in 1..30)
        val powers = when (n) {
            1 -> listOf("At-will", "At-will", "Encounter", "Daily", "Daily")
            2, 6, 10, 17, 22 -> listOf("Utility") + if (n == 17) listOf("Encounter") else emptyList()
            3, 7, 13, 27 -> listOf("Encounter")
            5 -> listOf("Daily")
            11 -> listOf("Paragon encounter")
            12 -> listOf("Paragon utility")
            20 -> listOf("Paragon daily")
            26 -> listOf("Epic utility")
            else -> emptyList()
        }
        return ProgressionLevel(n, powers, n in setOf(1, 2, 4, 6, 8, 10, 11, 12, 14, 16, 17, 18, 20, 21, 22, 24, 26, 28, 30),
            when (n) { 4, 12, 24 -> "non-main"; 8, 20, 28 -> "main"; 16 -> "all"; else -> null },
            when (n) { 9, 15, 19, 25, 29 -> "daily"; 23 -> "encounter"; else -> null },
            when (n) { 11 -> listOf("Paragon path features"); 16 -> listOf("Paragon path feature");
                21, 24, 30 -> listOf("Epic destiny feature"); else -> emptyList() })
    }

    fun tally(level: Int) = (1..level).flatMap { level(it).powers }.groupingBy {
        it.substringAfterLast(' ').replaceFirstChar { c -> c.uppercase() }
    }.eachCount()

    fun background(document: CharacterDocument, kind: String): String =
        (if (kind == "environment") document.identity.environment else document.identity.upbringing).ifBlank {
            document.levels.flatMap { it.proficiencies }.firstOrNull {
                it.slot.sourceInstanceId.startsWith("background.$kind.")
            }?.slot?.sourceInstanceId?.removePrefix("background.$kind.").orEmpty()
        }

    /** The main ability is fixed and does not spend the five-point allocation budget. */
    fun remainingPoints(allocation: AbilityAllocation): Int =
        5 - Ability.entries.filter { it != allocation.mainAbility }.sumOf { allocation.points[it] ?: 0 }

    /** Compact labels for the skill picker; proficiency is already conveyed by selection/status. */
    fun skillContributorLabel(label: String): String? = when {
        label == "Proficiency" -> null
        Ability.entries.any { label == "${it.name} points" } -> label.removeSuffix(" points").readable()
        else -> label
    }

    /** Whether a stepper can move this ability by one point. */
    fun canAdjustAbility(allocation: AbilityAllocation, ability: Ability, delta: Int): Boolean {
        if (ability == allocation.mainAbility || delta !in listOf(-1, 1)) {
            return false
        }
        val next = (allocation.points[ability] ?: 0) + delta
        if (next !in -1..3) {
            return false
        }
        val points = allocation.points + (ability to next)
        val values = Ability.entries.filter { it != allocation.mainAbility }.map { points[it] ?: 0 }
        val negatives = values.count { it < 0 }
        val boosted = values.count { it > 2 }
        return negatives <= 1 && boosted <= 1 && (boosted == 0 || negatives == 1)
    }

    fun validAllocation(allocation: AbilityAllocation): Boolean {
        val values = Ability.entries.filter { it != allocation.mainAbility }.map { allocation.points[it] ?: 0 }
        return allocation.points[allocation.mainAbility] == 4 && values.sum() == 5 &&
            (values.all { it in 0..2 } || (values.count { it == -1 } == 1 && values.count { it == 3 } == 1 && values.all { it in -1..3 }))
    }

    fun missing(state: BuilderState): Int {
        val doc = state.document
        val entries = doc.levels.flatMap { it.entries }.map { it.slot }.toSet()
        val skills = doc.levels.flatMap { it.proficiencies }.map { it.slot }.toSet()
        val slots = state.rules.choices.filter { it.abilities.isEmpty() }.map { it.slot }.toMutableSet()
        listOf("class", "ancestry", "feat").forEach { slots += ChoiceSlotId("creation", it, 0) }
        if (doc.level >= 2) { slots += ChoiceSlotId("advancement.2", "feat", 0) }
        (3..doc.level).forEach { level ->
            val schedule = level(level)
            if (schedule.feat) { slots += ChoiceSlotId("advancement.$level", "feat", 0) }
            schedule.powers.indices.forEach { slots += ChoiceSlotId("advancement.$level", "power", it) }
        }
        return slots.count { it !in entries && it !in skills } +
            listOf("environment", "upbringing").count { background(doc, it).isEmpty() } +
            if (validAllocation(doc.abilities)) 0 else 1
    }
}

/** Modern background prose; proficiency options remain owned by ModernCreation. */
internal val BackgroundDescriptions = mapOf(
    "nomadic" to "Your adventurer grew up traveling from place to place, never staying in one location for too long. They might have been part of a caravan, or a tribe that roamed the land. Those who grow up in a nomadic environment learn to navigate the wilderness and work together to survive.",
    "rural" to "Your adventurer grew up in a small town or village, surrounded by farmland and open fields. Life in a rural environment is often simple and hard-working, with a strong sense of community. Those who grow up in rural areas learn to get along with eachother, and everyone has to contribute to the community in some way through a trade.",
    "wilderness" to "Your adventurer grew up in the wilds, far from civilization. They might have lived in a forest, a desert, or a mountainous region. Life in the wilderness is often harsh and unforgiving, requiring resourcefulness and adaptability to survive. Those who grow up in the wilderness learn to be self-reliant and attuned to nature.",
    "urban" to "Your adventurer grew up in a bustling city or town, surrounded by people and activity. Life in an urban environment is often fast-paced and diverse, with a wide range of cultures and experiences. Those who grow up in urban areas learn to navigate social situations and political movements as part of the city life.",
    "secluded" to "Your adventurer grew up in a secluded environment, such as a monastery, a fortress, or a hidden village. Life in a secluded environment is often disciplined and focused, with a strong emphasis on tradition and values. Those who grow up in secluded areas have enough time to study and self-discipline.",
    "academic" to "Your adventurer was raised in an environment that valued knowledge and learning. They might have attended a prestigious academy, or been part of a scholarly community. Those who grow up with an academic upbringing learn to think critically and value education.",
    "militaristic" to "Your adventurer was raised in a disciplined and structured environment, such as a military academy or a warrior clan. Those who grow up with a militaristic upbringing learn the value of order, strategy, and physical fitness.",
    "lawless" to "Your adventurer was raised in a chaotic and unpredictable environment, such as a gang, a thieves' guild, or a rough neighborhood. Those who grow up with a lawless upbringing learn to be resourceful and adaptable, often relying on their wits to get by.",
    "labor" to "Your adventurer was raised in a working-class environment that valued hard work and practical skills. They might have grown up in a family of laborers, craftsmen, or farmers. Those who grow up with a labor upbringing learn the value of perseverance and dedication.",
    "spiritual" to "Your adventurer was raised in a religious or spiritual environment, such as a temple, a monastery, or a faith-based community. Those who grow up with a spiritual upbringing learn to value faith, compassion, and inner strength.",
    "creative" to "Your adventurer was raised in an environment that valued artistic expression and creativity. They might have grown up in a family of artists, performers, or musicians. Those who grow up with a creative upbringing learn to think outside the box and value individuality.",
)
