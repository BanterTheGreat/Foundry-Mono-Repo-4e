package dev.modern4e.builder

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Editable equipment positions in the Android builder. */
internal enum class EquipmentSlot(val title: String, val kind: String, val instanceId: String) {
    WEAPON_ONE("Weapon 1", "WEAPON", "builder.equipment.weapon-1"),
    WEAPON_TWO("Weapon 2", "WEAPON", "builder.equipment.weapon-2"),
    ARMOR("Armor", "ARMOR", "builder.equipment.armor"),
    SHIELD("Shield", "SHIELD", "builder.equipment.shield"),
    IMPLEMENT("Implement", "IMPLEMENT", "builder.equipment.implement"),
}

internal val WeaponSlots = listOf(EquipmentSlot.WEAPON_ONE, EquipmentSlot.WEAPON_TWO)
private const val ImplementLink = "builder.equipment.use-as-implement"

internal val EquipmentSelection.isLinkedImplement: Boolean
    get() = equipped && configuration[ImplementLink] == "true"

/** Store the implement role on the existing weapon occurrence. */
internal fun EquipmentSelection.withImplementLink(linked: Boolean): EquipmentSelection =
    copy(configuration = if (linked) configuration + (ImplementLink to "true") else configuration - ImplementLink)

internal data class EquippedImplementWeapon(
    val slot: EquipmentSlot,
    val selection: EquipmentSelection,
    val definition: ResolvedEntry,
    val eligible: Boolean,
)

internal data class EquipmentOptions(
    val selected: EquipmentSelection? = null,
    val selectedEntry: ResolvedEntry? = null,
    val eligible: List<ResolvedEntry> = emptyList(),
    val ineligible: List<ResolvedEntry> = emptyList(),
    val diagnostics: List<Diagnostic> = emptyList(),
    val linkedWeapons: List<EquippedImplementWeapon> = emptyList(),
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
        "SHIELD", "IMPLEMENT" -> return profile.equipmentString("proficiencyKey") in proficiencies
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

/** True for weapons with an authored implement property or an explicit class implement proficiency. */
internal fun ContentEntry.canUseWeaponAsImplement(rules: EngineResult): Boolean {
    val profile = equipmentProfile ?: return false
    if (profile.equipmentString("kind") != "WEAPON") {
        return false
    }
    val properties = (profile["properties"] as? JsonArray).orEmpty()
    if (properties.any { (it as? JsonObject)?.equipmentString("id") == "IMPLEMENT" } &&
        meetsEquipmentProficiencyRequirement(rules.equipmentProficiencies.keys)) {
        return true
    }
    val proficiencies = rules.entries.flatMap { it.definition.entry.mechanics.classProfile?.proficiencies
        ?.get("implements").orEmpty() }.toSet()
    val groups = (profile["groups"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    val name = id.substringAfterLast('.').replace('-', '_').uppercase()
    return name in proficiencies || groups.any { it in proficiencies }
}

/** Keep an unresolved saved link clearable, even when the weapon package is missing. */
internal fun List<EquipmentSelection>.savedEquipment(slot: EquipmentSlot): EquipmentSelection? =
    firstOrNull { it.instanceId == slot.instanceId } ?: if (slot == EquipmentSlot.IMPLEMENT) {
        firstOrNull { it.isLinkedImplement }
    } else {
        null
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
    val diagnostics = rules.entries.flatMap { equipped ->
        val entry = equipped.definition.entry
        if (equipped.slot != ChoiceSlotId(equipped.instanceId, "equipment", 0) || entry.equipmentProfile == null) {
            return@flatMap emptyList()
        }
        buildList {
            if (!entry.meetsEquipmentProficiencyRequirement(rules.equipmentProficiencies.keys)) {
                add(Diagnostic("android.equipment.unproficient", DiagnosticKind.INVALID_SELECTION,
                    "${entry.presentation.title} requires equipment proficiency.", equipped.slot, entry.id))
            }
            val linked = document.equipment.any { it.instanceId == equipped.instanceId && it.isLinkedImplement }
            if (linked && !entry.canUseWeaponAsImplement(rules)) {
                add(Diagnostic("android.equipment.implement", DiagnosticKind.INVALID_SELECTION,
                    "${entry.presentation.title} can no longer be used as an implement.", equipped.slot, entry.id))
            }
        }
    }
    return copy(rules = rules.copy(diagnostics = rules.diagnostics + diagnostics))
}

/** The key under which a submitted but uncommitted equipment change is shown, matching how the engine keys equipped items. */
internal val EquipmentSlot.pendingSlot: ChoiceSlotId
    get() = ChoiceSlotId(instanceId, "equipment", 0)
