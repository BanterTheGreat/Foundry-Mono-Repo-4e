import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const LOCALIZE_ITEM_POWERS_SCHEMA = { items: ["string"], folder: "string", summary: "string" };

/** Validate exact equipment selections; callers cannot supply replacement source data. */
export function validateLocalizeItemPowers(args) {
  validateShape(args, LOCALIZE_ITEM_POWERS_SCHEMA);
  validateChangeSummary(args.summary);
  if (!args.items?.length || args.items.length > 100 || new Set(args.items).size !== args.items.length
    || args.items.some(uuid => !/^Actor\.[A-Za-z0-9_-]{1,128}\.Item\.[A-Za-z0-9_-]{1,128}$/.test(uuid))) {
    throw new Error("Select 1-100 distinct equipment UUIDs on world PCs.");
  }
  if (args.folder !== undefined && (!args.folder.trim() || args.folder.length > 1000)) {
    throw new Error("Supply a nonempty world Item folder path or ID.");
  }
}
