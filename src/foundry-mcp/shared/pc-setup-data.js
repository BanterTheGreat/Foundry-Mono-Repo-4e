import { validateShape } from "./npc-data.js";

export const CORE_PC_POWERS = Object.freeze([
  "Melee Basic Attack", "Ranged Basic Attack", "Total Defense", "Charge", "Second Wind"
]);

/**
 * Keep PC setup declarative: callers select identity and catalogue entries,
 * while the browser supplies the fixed character configuration.
 */
export function validatePcSetup(args) {
  validateShape(args, {
    requestId: "string", name: "string", race: "string", class: "string",
    folder: "string", classId: "string", corePack: "string"
  });
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")) {
    throw new Error("Supply a unique requestId of 8 to 128 letters, numbers, underscores or hyphens.");
  }
  for (const key of ["name", "race", "class"]) {
    if (!args[key]?.trim() || args[key].length > 200) {
      throw new Error(`Supply a non-empty ${key} of at most 200 characters.`);
    }
  }
  if ((args.folder !== undefined && (!args.folder.trim() || args.folder.length > 1000))
    || (args.classId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(args.classId))
    || (args.corePack !== undefined && (!args.corePack.trim() || args.corePack.length > 200))) {
    throw new Error("Invalid destination folder or compendium selector.");
  }
}

/**
 * Native DnD4e 0.9.3 source fields. BonusField entries require active:true;
 * values are formulas so the bonuses continue to track the actor's tier.
 */
export function pcSetupSystem({ race, class: className }) {
  const tierBonus = () => [{ name: "Tier", value: "@tier", active: true, note: "" }];
  return {
    details: { race, class: className },
    modifiers: { attack: { bonus: tierBonus() } },
    defences: Object.fromEntries(["fort", "ref", "wil"].map(key => [key, { bonus: tierBonus() }])),
    powerGroupTypes: "actionMod", powerSortTypes: "useType",
    attributes: { hp: { autototal: true } }
  };
}
