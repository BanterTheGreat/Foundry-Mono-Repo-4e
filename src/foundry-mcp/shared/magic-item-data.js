import { validateShape } from "./npc-data.js";

export const COMPENDIUM_ITEM_UUID = /^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+\.(?:Item\.)?[A-Za-z0-9_-]{1,128}$/;

/**
 * Select two compendium documents; never accept caller-authored merge patches.
 */
export function validateMagicItemRequest(args) {
  validateShape(args, { requestId: "string", baseUuid: "string", enchantmentUuid: "string", folder: "string", quantity: "integer" });
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")
    || !COMPENDIUM_ITEM_UUID.test(args.baseUuid ?? "") || !COMPENDIUM_ITEM_UUID.test(args.enchantmentUuid ?? "")
    || args.baseUuid === args.enchantmentUuid || !args.folder?.trim() || args.folder.length > 1000
    || (args.quantity !== undefined && (!Number.isSafeInteger(args.quantity) || args.quantity < 1 || args.quantity > 1000000))) {
    throw new Error("Supply requestId, distinct base/enchantment compendium Item UUIDs, an Item folder, and optional positive quantity up to 1000000.");
  }
}

// DnD 4e Compendium 1.37.13, tools/lookup_tables.js, five-level bands.
const masterwork = {
  "Cloth Armor (Basic Clothing)": [0, 0, 0, 1, 1, 2],
  "Leather Armor": [2, 2, 2, 3, 3, 4],
  "Studded Leather": [3, 3, 3, 4, 4, 5], "Hide Armor": [3, 3, 3, 4, 4, 5], "Ring Armor": [3, 3, 3, 4, 4, 5],
  "Chainmail": [6, 7, 8, 9, 10, 12], "Splint Mail": [7, 8, 9, 10, 11, 13], "Scale Armor": [7, 8, 9, 10, 11, 13],
  "Plate Armor": [8, 9, 10, 11, 12, 14], "Full Plate": [8, 9, 10, 11, 12, 14], "Spiked Plate": [8, 9, 10, 11, 12, 14]
};

/**
 * Compose the same mundane type plus enchantment name as the compendium button.
 */
function magicItemName(base, enchantment) {
  const position = enchantment.name.indexOf("+");
  const name = (position < 0 ? enchantment.name : enchantment.name.slice(0, position)).trim();
  const bonus = position < 0 ? "" : enchantment.name.slice(position).trim();
  const pattern = base.type === "weapon" && base.system.weaponType === "implement"
    ? /(Implement)|(Weapon)|(Dagger)|(Staff)|(Orb)|(Wand)|(Ki Focus)|(Totem)|(Symbol)|(Rod)|(Tome)/i
    : /(Armor)|(Weapon)|(Shield)/;
  const replaced = name.replace(pattern, () => base.name);
  return [replaced, ...(replaced === name ? [base.name] : []), bonus].filter(Boolean).join(" ");
}

/**
 * Merge serialized sources without creating temporary world documents.
 * Adapt the compendium builder's fields to the pinned system's native crit data.
 */
export function mergeMagicItemSources(base, enchantment, quantity = 1) {
  if (!["weapon", "equipment"].includes(base.type) || base.type !== enchantment.type
    || !base.system || !enchantment.system || !Number.isInteger(enchantment.system.level)
    || enchantment.system.level < 1 || enchantment.system.level > 30) {
    throw new Error("Choose matching weapon/equipment sources and a level 1-30 magic variant.");
  }
  const data = structuredClone(base);
  for (const key of ["_id", "folder", "ownership", "_stats"]) {
    delete data[key];
  }
  data.name = magicItemName(base, enchantment);
  const magic = enchantment.system;
  data.system.description ??= {};
  data.system.description.value = magic.description?.value ?? "";
  for (const key of ["price", "rarity", "level"]) {
    if (magic[key] !== undefined) {
      data.system[key] = structuredClone(magic[key]);
    }
  }
  data.system.quantity = quantity;
  data.system.equipped = false;
  if (base.type === "weapon") {
    if (!Number.isInteger(magic.enhance) || magic.enhance < 1 || magic.enhance > 6) {
      throw new Error("Select a magical weapon variant with enhancement 1-6.");
    }
    for (const key of ["enhance", "critDamageForm", "critDamageFormImp", "damageCrit", "damageCritImp"]) {
      if (magic[key] !== undefined) {
        data.system[key] = structuredClone(magic[key]);
      }
    }
  } else {
    if (!base.system.armour || !magic.armour || !Number.isInteger(magic.armour.enhance)
      || magic.armour.enhance < 0 || magic.armour.enhance > 6) {
      throw new Error("Select compatible equipment with native armour data.");
    }
    data.system.armour.enhance = magic.armour.enhance;
    const ac = Object.hasOwn(masterwork, base.name) ? masterwork[base.name][Math.floor((magic.level - 1) / 5)] : null;
    if (ac) {
      data.system.armour.ac = ac;
    }
  }
  if (enchantment.img && !enchantment.img.startsWith("icons/svg/")) {
    data.img = enchantment.img;
  } else if (base.img?.startsWith("modules/dnd-4e-compendium/") && base.img.endsWith(".webp")) {
    // Tiered compendium art follows the original builder's numbered filenames.
    data.img = `${base.img.slice(0, -5)}${Math.ceil(magic.level / 5)}.webp`;
  }
  data.effects = [...(base.effects ?? []), ...(enchantment.effects ?? [])].map(effect => {
    const copy = structuredClone(effect);
    delete copy._id;
    return copy;
  });
  return data;
}
