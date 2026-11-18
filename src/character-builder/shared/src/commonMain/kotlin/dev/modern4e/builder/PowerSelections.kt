@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package dev.modern4e.builder

import kotlinx.serialization.Serializable
import kotlinx.serialization.EncodeDefault

/** Acquisition/filter facts are independent of benefit scaling and activation rules. */
@Serializable
data class PowerProfile(val level: Int, val usage: String, val powerKind: String, val keywords: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val pickKinds: List<String> = emptyList()) {
    init {
        require(level in 1..30)
        require(usage in listOf("AT_WILL", "ENCOUNTER", "DAILY"))
        require(powerKind in listOf("ATTACK", "UTILITY"))
        require(pickKinds == pickKinds.distinct() && pickKinds.all { it in listOf("COMBAT", "NON_COMBAT") })
        require(pickKinds.isEmpty() || powerKind == "UTILITY")
    }
}

/** Closed candidate query; prerequisites/access are evaluated separately for each result. */
@Serializable
data class PowerQuery(val category: EntryCategory = EntryCategory.POWER, val usage: String? = null,
    val powerKind: String? = null, val levelMaximum: Int? = null, val characterLevel: Boolean = false,
    val keywords: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.NEVER) val pickKind: String? = null) {
    init {
        require(category in listOf(EntryCategory.POWER, EntryCategory.TECHNIQUE, EntryCategory.FEATURE, EntryCategory.FEAT))
        require(usage == null || usage in listOf("AT_WILL", "ENCOUNTER", "DAILY"))
        require(powerKind == null || powerKind in listOf("ATTACK", "UTILITY"))
        require(levelMaximum == null || levelMaximum in 1..30)
        require(pickKind == null || pickKind in listOf("COMBAT", "NON_COMBAT"))
        require(pickKind == null || powerKind == "UTILITY")
    }
}

@Serializable
data class ChoiceCount(val atLevel: Int, val count: Int) {
    init {
        require(atLevel in 1..30 && count in 0..100)
    }
}

/** Keyword bounds apply only to this choice set, never automatic or unrelated grants. */
@Serializable
data class SelectionConstraint(val type: String, val keyword: String? = null, val minimum: Int = 0, val maximum: Int? = null) {
    init {
        require(type in listOf("distinct", "keywordCount", "notKnown"))
        require(minimum >= 0 && (maximum == null || maximum >= minimum))
        require(type != "keywordCount" || !keyword.isNullOrBlank())
    }
}

@Serializable
data class PowerCollection(val id: String, val title: String, val capacity: Int) {
    init {
        require(id.isNotBlank() && capacity > 0)
    }
}

/** Count replacements must agree; constraints are additive and idempotent. */
@Serializable
data class SelectionModifier(val choiceId: String, val count: Int, val constraints: List<SelectionConstraint> = emptyList(),
    val collection: String? = null, val replacement: String? = null, val countByLevel: List<ChoiceCount> = emptyList()) {
    init {
        require(choiceId.isNotBlank() && count in 0..100)
        require(replacement == null || replacement == "FOLLOW_TARGET")
        require(countByLevel.isEmpty() || countByLevel.first().atLevel == 1 &&
            countByLevel.map { it.atLevel } == countByLevel.map { it.atLevel }.distinct().sorted())
    }
}

/** Whole-set validity is separate from an individual candidate's eligibility. */
@Serializable
data class SelectionSetResult(val sourceInstanceId: String, val choiceId: String, val required: Int,
    val selected: Int, val remaining: Int, val diagnostics: List<Diagnostic>)
