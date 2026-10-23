import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";
import { pagination } from "./protocol.js";
import { COMPENDIUM_ITEM_UUID } from "./magic-item-data.js";

export const MERCHANT_ITEM_TYPES = Object.freeze(["weapon", "equipment", "consumable", "tool", "loot", "backpack"]);

/**
 * Validate merchant selectors and declarative stock operations at both ends.
 */
export function validateMerchantRequest(args, edit = false) {
  validateShape(args, edit ? {
    uuid: "string", requestId: "string", summary: "string",
    add: [{ uuid: "string", baseUuid: "string", quantity: "integer" }],
    quantities: [{ id: "string", quantity: "integer" }], remove: ["string"]
  } : { uuid: "string", offset: "integer", limit: "integer", query: "string" });
  if (!/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")) {
    throw new Error("Supply a world NPC Actor UUID.");
  }
  if (!edit) {
    pagination(args);
    return;
  }
  validateChangeSummary(args.summary);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")
    || ["constructor", "prototype", "__proto__"].includes(args.requestId)) {
    throw new Error("Supply a unique requestId; reuse it with identical operations after uncertain results.");
  }
  const { add = [], quantities = [], remove = [] } = args;
  if (!add.length && !quantities.length && !remove.length) {
    throw new Error("Supply at least one inventory operation.");
  }
  const ids = [...quantities.map(entry => entry.id), ...remove];
  if (ids.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Use distinct embedded Item IDs; do not update and remove the same Item.");
  }
  for (const entry of [...add, ...quantities]) {
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < (add.includes(entry) ? 1 : 0) || entry.quantity > 1000000) {
      throw new Error("Quantities must be whole numbers up to 1000000; additions require at least one.");
    }
  }
  for (const entry of add) {
    if (entry.baseUuid !== undefined && (!COMPENDIUM_ITEM_UUID.test(entry.baseUuid)
      || !COMPENDIUM_ITEM_UUID.test(entry.uuid ?? "") || entry.baseUuid === entry.uuid)) {
      throw new Error("Magic stock needs distinct base and enchantment compendium Item UUIDs.");
    }
    if (!/^(Item\.[A-Za-z0-9_-]{1,128}|Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+\.(?:Item\.)?[A-Za-z0-9_-]{1,128})$/.test(entry.uuid ?? "")) {
      throw new Error("Add items using discovered world Item or compendium Item UUIDs.");
    }
  }
  if (new Set(add.map(entry => JSON.stringify([entry.uuid, entry.baseUuid ?? null]))).size !== add.length) {
    throw new Error("Combine duplicate source UUIDs into one addition.");
  }
}
