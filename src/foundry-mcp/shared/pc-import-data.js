import { validateShape } from "./npc-data.js";

export const PC_INVENTORY_TYPES = Object.freeze(["weapon", "equipment", "consumable", "tool", "loot", "backpack"]);

/**
 * Validate the narrow compendium import boundary in both processes.
 */
export function validatePcImport(args) {
  validateShape(args, {
    uuid: "string", requestId: "string",
    equipmentPowers: [{ name: "string", id: "string", level: "integer" }],
    powers: [{ name: "string", id: "string", level: "integer" }],
    feats: [{ name: "string", id: "string", level: "integer" }],
    rituals: [{ name: "string", id: "string", level: "integer" }],
    magicItems: [{ pack: "string", name: "string", id: "string" }]
  });
  if (!/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")
    || !/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")) {
    throw new Error("Supply a world Actor UUID and a unique requestId.");
  }
  const entries = [...(args.powers ?? []), ...(args.equipmentPowers ?? []), ...(args.feats ?? []), ...(args.rituals ?? []), ...(args.magicItems ?? [])];
  if (!entries.length || entries.length > 100) {
    throw new Error("Supply between 1 and 100 powers/equipment powers/feats/rituals/magic items.");
  }
  for (const [kind, choices] of [["powers", args.powers ?? []], ["equipmentPowers", args.equipmentPowers ?? []], ["feats", args.feats ?? []], ["rituals", args.rituals ?? []]]) {
    for (const entry of choices) {
      const validLevel = kind !== "feats" && entry.level === undefined
        || Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 30;
      if ((entry.name === undefined) === (entry.id === undefined)
        || (entry.name !== undefined && (!entry.name.trim() || entry.name.length > 200))
        || (entry.id !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(entry.id))
        || !validLevel) {
        throw new Error("Each choice needs one name or entry id. Feats require level 1-30; powers, equipment powers and rituals may omit level to retain the source level.");
      }
    }
  }
  for (const entry of args.magicItems ?? []) {
    if (typeof entry.pack !== "string" || !entry.pack.trim() || entry.pack.length > 200
      || (entry.name === undefined) === (entry.id === undefined)
      || (entry.name !== undefined && (!entry.name.trim() || entry.name.length > 200))
      || (entry.id !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(entry.id))) {
      throw new Error("Each magic item needs a compendium pack ID and exactly one name or entry id. Source levels and quantities are preserved.");
    }
  }
}

/**
 * Remove class/level catalogue labels while retaining the actual power title.
 */
export function cleanPowerName(name) {
  const label = "[\\p{L}][\\p{L}\\p{N} '&’/()–-]*?\\s+(?:(?:Attack|Utility|Feature)\\s+)?(?:Level\\s+)?\\d{1,2}";
  const classes = "Ardent|Artificer|Assassin|Avenger|Barbarian|Bard|Battlemind|Cleric|Druid|Fighter|Invoker|Monk|Paladin|Psion|Ranger|Rogue|Runepriest|Seeker|Shaman|Sorcerer|Swordmage|Vampire|Warlock|Warlord|Wizard";
  return name.trim()
    .replace(new RegExp(`\\s*[([]${label}[)\\]]$`, "iu"), "")
    .replace(new RegExp(`\\s+(?:[-–—:]|\\|)\\s*${label}$`, "iu"), "")
    .replace(new RegExp(`^${label}\\s*:\\s*`, "iu"), "")
    .replace(new RegExp(`^${label}\\s*[-–—]\\s*`, "iu"), "")
    .replace(new RegExp(`^(?:${classes})\\s*[-–—]\\s*`, "iu"), "")
    .replace(/^[\p{L}][\p{L} '&’–-]*\s+Power\s*[-–—]\s*/iu, "")
    .trim();
}
