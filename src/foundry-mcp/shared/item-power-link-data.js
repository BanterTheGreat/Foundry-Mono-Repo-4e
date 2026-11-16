import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";
import { ITEM_DESCRIPTION_UUID } from "./item-description-data.js";

export const ITEM_POWER_LINK_SCHEMA = { items: [{ uuid: "string", powers: ["string"] }], summary: "string" };

/**
 * Accept only explicit equipment selections and existing world power UUIDs.
 */
export function validateItemPowerLinks(args) {
  validateShape(args, ITEM_POWER_LINK_SCHEMA);
  validateChangeSummary(args.summary);
  if (!args.items?.length || args.items.length > 100
    || new Set(args.items.map(item => item.uuid)).size !== args.items.length
    || args.items.some(item => !ITEM_DESCRIPTION_UUID.test(item.uuid ?? "")
      || !item.powers?.length || item.powers.length > 100
      || new Set(item.powers).size !== item.powers.length
      || item.powers.some(uuid => !/^Item\.[A-Za-z0-9_-]{1,128}$/.test(uuid)))
    || new Set(args.items.flatMap(item => item.powers)).size > 100) {
    throw new Error("Select 1-100 distinct world/world-actor equipment Items and 1-100 distinct world power UUIDs per Item, with at most 100 unique powers in the batch.");
  }
}
