package dev.modern4e.builder

/**
 * Proves that an already checked row is independent of changed entry selections. The caller must
 * establish unchanged content, acquisition level, slot identity and pool rules first. Unknown or
 * active candidates are checked again rather than guessing which effects could change their proof.
 */
object ChoiceCacheDependencies {
    /** Changes include both removed and added definitions, including displaced replacement powers. */
    fun canRetain(candidate: ContentEntry, changes: List<ContentEntry>, categories: Map<String, EntryCategory>): Boolean {
        if (!passive(candidate)) {
            return false
        }
        val requirements = (candidate.mechanics.prerequisites + listOfNotNull(candidate.mechanics.access))
            .flatMap { it.leaves() }
        return changes.all { changed ->
            val profile = EffectProfile.of(changed)
            candidate.id != changed.id && changed.mechanics.version == 2 && when (changed.category) {
                EntryCategory.POWER -> passive(changed) &&
                    !samePowerFamily(candidate.mechanics.powerProfile, changed.mechanics.powerProfile) &&
                    requirements.none { profile.canAffect(it) }
                EntryCategory.FEAT -> SuppliedFact.POOL_RULES !in profile.supplies &&
                    requirements.none { leaf ->
                        // An entry requirement whose target is not in the catalog cannot be proven independent.
                        val category = (leaf as? Prerequisite.Entry)?.let { categories[it.entryId] ?: return@none true }
                        profile.canAffect(leaf, category)
                    }
                else -> false
            }
        }
    }

    /** Passive selections cannot supply facts that change the candidate's dependency exclusions. */
    private fun passive(entry: ContentEntry): Boolean = when (entry.category) {
        EntryCategory.FEAT -> EffectProfile.of(entry).kind != EffectKind.ACTIVE
        EntryCategory.POWER -> EffectProfile.of(entry).kind == EffectKind.PLAIN_POWER
        else -> false
    }

    /** Utilities form one family even when their activation usages differ. */
    private fun samePowerFamily(left: PowerProfile?, right: PowerProfile?): Boolean =
        left != null && right != null && left.powerKind == right.powerKind &&
            (left.powerKind == "UTILITY" || left.usage == right.usage)
}
