import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";
import { ITEM_DESCRIPTION_UUID } from "./item-description-data.js";

export const WEAPON_DAMAGE_SCHEMA = {
  items: [{ uuid: "string", numDice: "integer", numFaces: "integer", description: "string" }], summary: "string"
};

/**
 * Validate base weapon dice and optional full rules text without accepting other mechanics.
 */
export function validateWeaponDamage(args) {
  validateShape(args, WEAPON_DAMAGE_SCHEMA);
  validateChangeSummary(args.summary);
  if (!args.items?.length || args.items.length > 100
    || new Set(args.items.map(item => item.uuid)).size !== args.items.length
    || args.items.some(item => !ITEM_DESCRIPTION_UUID.test(item.uuid ?? "")
      || !Number.isInteger(item.numDice) || item.numDice < 1 || item.numDice > 100
      || ![2, 3, 4, 6, 8, 10, 12, 20, 100].includes(item.numFaces))) {
    throw new Error("Supply 1-100 distinct world/world-actor weapon UUIDs, numDice (1-100), and numFaces (2, 3, 4, 6, 8, 10, 12, 20 or 100).");
  }
  if (JSON.stringify(args).length > 1000000) {
    throw new Error("Weapon damage batches must not exceed 1,000,000 characters.");
  }
}
