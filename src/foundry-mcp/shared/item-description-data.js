import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const ITEM_DESCRIPTION_SCHEMA = {
  items: [{ uuid: "string", description: { value: "string", chat: "string" } }], summary: "string"
};
export const ITEM_DESCRIPTION_UUID = /^(?:Item\.[A-Za-z0-9_-]{1,128}|Actor\.[A-Za-z0-9_-]{1,128}\.Item\.[A-Za-z0-9_-]{1,128})$/;

/**
 * Accept only absolute description replacements on explicitly selected Items.
 */
export function validateItemDescriptions(args) {
  validateShape(args, ITEM_DESCRIPTION_SCHEMA);
  validateChangeSummary(args.summary);
  if (!args.items?.length || args.items.length > 100
    || new Set(args.items.map(item => item.uuid)).size !== args.items.length
    || args.items.some(item => !ITEM_DESCRIPTION_UUID.test(item.uuid ?? "")
      || !item.description || !Object.keys(item.description).length)) {
    throw new Error("Supply 1-100 distinct world or world-actor Item UUIDs, each with description.value and/or description.chat.");
  }
  if (JSON.stringify(args).length > 1000000) {
    throw new Error("Description batches must not exceed 1,000,000 characters.");
  }
}
