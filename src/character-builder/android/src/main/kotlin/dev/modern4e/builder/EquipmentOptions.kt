package dev.modern4e.builder

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** The four independently editable equipment positions in the Android builder. */
internal enum class EquipmentSlot(val title: String, val kind: String, val instanceId: String) {
    WEAPON_ONE("Weapon 1", "WEAPON", "builder.equipment.weapon-1"),
    WEAPON_TWO("Weapon 2", "WEAPON", "builder.equipment.weapon-2"),
    ARMOR("Armor", "ARMOR", "builder.equipment.armor"),
    SHIELD("Shield", "SHIELD", "builder.equipment.shield"),
}

internal data class EquipmentOptions(
    val selected: EquipmentSelection? = null,
    val selectedEntry: ResolvedEntry? = null,
    val eligible: List<ResolvedEntry> = emptyList(),
    val ineligible: List<ResolvedEntry> = emptyList(),
    val diagnostics: List<Diagnostic> = emptyList(),
)

internal val ContentEntry.equipmentProfile: JsonObject?
    get() = sharedData?.get("equipment") as? JsonObject

internal fun JsonObject.equipmentString(key: String): String? =
    (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

/** Check equipment proficiency requirements. Improvised weapons are available to everyone. */
internal fun ContentEntry.meetsEquipmentProficiencyRequirement(proficiencies: Set<String>): Boolean {
    val profile = equipmentProfile ?: return false
    when (profile.equipmentString("kind")) {
        "ARMOR" -> return isArmorProficient(profile.equipmentString("proficiencyKey"),
            profile.equipmentString("armorCategory"), proficiencies)
        "SHIELD" -> return profile.equipmentString("proficiencyKey") in proficiencies
        "WEAPON" -> {
            val category = profile.equipmentString("proficiencyCategory")
            if (category == "IMPROVISED") {
                return true
            }
            val attack = profile.equipmentString("attackCategory")
            val groups = (profile["groups"] as? JsonArray).orEmpty().mapNotNull {
                (it as? JsonPrimitive)?.takeIf { value -> value.isString }?.contentOrNull
            }
            val namedKey = id.substringAfterLast('.').replace('-', '_').uppercase()
            val alias = when (id) {
                "modern4e.weapon.shortsword" -> "SHORT_SWORD"
                "modern4e.weapon.quarterstaff" -> "STAFF"
                else -> null
            }
            return id in proficiencies || namedKey in proficiencies || alias in proficiencies ||
                (category != null && (attack != null && "${category}_${attack}" in proficiencies ||
                    groups.any { group -> "${category}_${group}" in proficiencies }))
        }
        else -> return false
    }
}

/** Reserve Android positions first, then show compatible equipped imports in document order. */
internal fun equipmentSlots(
    selections: List<EquipmentSelection>,
    definitions: Map<SavedSelection, ResolvedEntry>,
): Map<EquipmentSlot, EquipmentSelection> = buildMap {
    for (slot in EquipmentSlot.entries) {
        selections.firstOrNull { it.instanceId == slot.instanceId }?.let { put(slot, it) }
    }
    for (selection in selections) {
        if (!selection.equipped || selection in values) {
            continue
        }
        val kind = definitions[selection.selection]?.entry?.equipmentProfile?.equipmentString("kind")
        val slot = EquipmentSlot.entries.firstOrNull { it.kind == kind && it !in keys } ?: continue
        put(slot, selection)
    }
}

/** Keep existing selections while reporting lost class or feat proficiency in Validation. */
internal fun BuilderState.withEquipmentValidation(): BuilderState {
    val diagnostics = rules.entries.mapNotNull { equipped ->
        val entry = equipped.definition.entry
        if (equipped.slot != ChoiceSlotId(equipped.instanceId, "equipment", 0) ||
            entry.equipmentProfile == null || entry.meetsEquipmentProficiencyRequirement(rules.equipmentProficiencies.keys)
        ) {
            return@mapNotNull null
        }
        Diagnostic("android.equipment.unproficient", DiagnosticKind.INVALID_SELECTION,
            "${entry.presentation.title} requires equipment proficiency.", equipped.slot, entry.id)
    }
    return copy(rules = rules.copy(diagnostics = rules.diagnostics + diagnostics))
}
