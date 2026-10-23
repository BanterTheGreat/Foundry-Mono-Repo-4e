import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const BASIC_ATTACK_ABILITIES = Object.freeze({
  str: "Strength", con: "Constitution", dex: "Dexterity",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma"
});

/**
 * Accept only a world PC and a fixed ability choice, never caller patches.
 */
export function validatePcBasicAttacks(args) {
  validateShape(args, { uuid: "string", ability: "string", summary: "string" });
  validateChangeSummary(args.summary);
  if (!/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")
    || !Object.hasOwn(BASIC_ATTACK_ABILITIES, args.ability ?? "")) {
    throw new Error("Supply a world PC UUID and an ability key (str/con/dex/int/wis/cha).");
  }
}
