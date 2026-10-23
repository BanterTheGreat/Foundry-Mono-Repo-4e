import { MERCHANT_ITEM_TYPES, validateMerchantRequest } from "../shared/merchant-data.js";
import { MODULE_ID, MAX_MESSAGE_BYTES, pagination } from "../shared/protocol.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";
import { prepareMagicItem } from "./magic-item-api.js";

const pending = new WeakSet();
const atPath = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);

/**
 * Resolve only world NPC merchants, using Item Piles' public compatibility API.
 */
function merchantContext(uuid, game, assertConnection) {
  const actor = game.actors.get(uuid.slice(6));
  const api = game.itempiles?.API;
  const worldId = game.world.id;
  const userId = game.user.id;
  const path = api?.ITEM_QUANTITY_ATTRIBUTE;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3"
      || !actor || actor.type !== "NPC" || actor.parent || actor.pack || actor.uuid !== uuid
      || game.actors.get(actor.id) !== actor || !game.modules.get("item-piles")?.active
      || game.itempiles?.API !== api || typeof api?.isItemPileMerchant !== "function"
      || typeof api?.getActorItems !== "function" || !api.isItemPileMerchant(actor)
      || path !== api.ITEM_QUANTITY_ATTRIBUTE
      || !/^system(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(path ?? "")
      || path.split(".").some(key => ["constructor", "prototype", "__proto__"].includes(key))) {
      throw new Error("Requires an Item Piles world NPC merchant, a supported quantity attribute and the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  const stock = () => api.getActorItems(actor).filter(item => MERCHANT_ITEM_TYPES.includes(item.type));
  return { actor, api, path, assertSession, stock };
}

/**
 * Read filtered stock, preserving finite stored quantities and infinite flags.
 */
export async function getMerchantInventory(args, { game = globalThis.game, assertConnection = () => {} } = {}) {
  assertEnabledGM(game);
  validateMerchantRequest(args);
  const { actor, path, stock, assertSession } = merchantContext(args.uuid, game, assertConnection);
  const { offset, limit, query } = pagination(args);
  const items = stock().filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  const entries = items.slice(offset, offset + limit).map(item => {
    const source = item.toObject(true);
    return { id: item.id, uuid: item.uuid, name: item.name, type: item.type, img: source.img,
      quantity: atPath(source, path) ?? null, itemPiles: source.flags?.["item-piles"] ?? {} };
  });
  assertSession();
  return { uuid: actor.uuid, name: actor.name, quantityPath: path, total: items.length, offset, limit, entries,
    merchant: actor.toObject(true).flags?.["item-piles"] ?? {} };
}

/**
 * Confirm stock changes, reject stale approvals and persist retry receipts.
 * Native embedded-document writes keep exact stock IDs and avoid auto-stacking.
 */
export async function editMerchantInventory(args, {
  game = globalThis.game, assertConnection = () => {}, confirm = confirmNpcEdit, fromUuid = globalThis.fromUuid
} = {}) {
  assertEnabledGM(game);
  validateMerchantRequest(args, true);
  args = structuredClone(args);
  const { actor, path, assertSession, stock } = merchantContext(args.uuid, game, assertConnection);
  if (pending.has(game)) {
    throw new Error("Another merchant edit is in progress.");
  }
  pending.add(game);
  try {
    const { uuid, requestId, summary, add = [], quantities = [], remove = [] } = args;
    const fingerprint = JSON.stringify({ uuid, add, quantities, remove });
    const ledgerPath = `merchantRequests.${requestId}`;
    const previous = actor.getFlag(MODULE_ID, ledgerPath);
    if (previous && previous.fingerprint !== fingerprint) {
      throw new Error("This requestId already belongs to different inventory operations.");
    }
    if (previous?.result) {
      return { ...previous.result, replayed: true };
    }
    const snapshot = JSON.stringify(actor.toObject(true));
    const stockIds = new Set(stock().map(item => item.id));
    const changes = [];
    const additions = [];
    const targetSources = new Map();
    for (const [index, entry] of add.entries()) {
      const key = `${requestId}:${index}`;
      const existing = Array.from(actor.items.values()).find(item => item.getFlag(MODULE_ID, "merchantAddition")?.key === key);
      if (existing) {
        continue;
      }
      let data;
      let assertSources;
      if (entry.baseUuid) {
        ({ data, assertSources } = await prepareMagicItem({ baseUuid: entry.baseUuid, enchantmentUuid: entry.uuid, quantity: entry.quantity },
          { game, fromUuid, assertSession }));
      } else {
        const sourceItem = await fromUuid(entry.uuid);
        assertSession();
        if (!sourceItem || sourceItem.documentName !== "Item" || sourceItem.parent
          || (!sourceItem.pack && game.items.get(sourceItem.id) !== sourceItem)
          || !sourceItem.testUserPermission(game.user, "OBSERVER")
          || (sourceItem.pack && !game.packs.get(sourceItem.pack)?.testUserPermission(game.user, "OBSERVER"))) {
          throw new Error("Choose an accessible world or compendium inventory Item.");
        }
        data = sourceItem.toObject(true);
        const snapshot = JSON.stringify(data);
        assertSources = () => {
          assertSession();
          if (JSON.stringify(sourceItem.toObject(true)) !== snapshot) {
            throw new Error("Source Item changed during review; propose a fresh edit.");
          }
        };
      }
      if (!MERCHANT_ITEM_TYPES.includes(data.type) || !Number.isFinite(atPath(data, path))) {
        throw new Error("Only physical inventory Items with a numeric quantity field can be stocked.");
      }
      delete data._id;
      delete data.folder;
      delete data.ownership;
      const keys = path.split(".");
      const last = keys.pop();
      keys.reduce((value, key) => value[key], data)[last] = entry.quantity;
      data.flags ??= {};
      data.flags[MODULE_ID] = { merchantAddition: { key, sourceUuid: entry.uuid, ...(entry.baseUuid ? { baseUuid: entry.baseUuid } : {}) } };
      additions.push({ data, assertSources });
      changes.push({ document: data.name, path: "inventory.add", before: null, after: data });
    }
    const updates = [];
    const deletions = [];
    for (const id of [...quantities.map(entry => entry.id), ...remove]) {
      const item = actor.items.get(id);
      if (!item && remove.includes(id)) {
        continue;
      }
      if (!item || item.parent !== actor || !stockIds.has(id)) {
        throw new Error("Select an existing physical merchant stock Item by embedded ID.");
      }
      const source = item.toObject(true);
      targetSources.set(id, JSON.stringify(source));
      if (remove.includes(id)) {
        deletions.push(id);
        changes.push({ document: item.name, path: "inventory.remove", before: source, after: null });
      } else {
        const quantity = quantities.find(entry => entry.id === id).quantity;
        const before = atPath(source, path);
        if (!Number.isFinite(before)) {
          throw new Error("Stock quantity is not numeric.");
        }
        if (quantity !== before) {
          updates.push({ _id: id, [path]: quantity });
          changes.push({ document: item.name, path, before, after: quantity });
        }
      }
    }
    const receipt = { uuid, name: actor.name, requestId, changes };
    if (!changes.length) {
      const result = { ...receipt, status: "unchanged" };
      // A partial retry may already have applied every operation.
      await actor.setFlag(MODULE_ID, ledgerPath, { fingerprint, result });
      assertSession();
      return result;
    }
    if (new TextEncoder().encode(JSON.stringify(changes)).length > MAX_MESSAGE_BYTES / 2) {
      throw new Error("Merchant edit exceeds 2 MiB; use a smaller batch.");
    }
    const approved = await confirm({ name: actor.name, changes, summary: summary ?? `Update ${actor.name}'s merchant inventory.`,
      title: "Foundry MCP: Confirm merchant inventory" });
    assertSession();
    if (approved !== true) {
      return { ...receipt, status: "cancelled" };
    }
    if (JSON.stringify(actor.toObject(true)) !== snapshot) {
      throw new Error("Merchant or source Items changed during review; read inventory and propose a fresh edit.");
    }
    additions.forEach(entry => entry.assertSources());
    const applied = [];
    const assertTargets = ids => {
      assertSession();
      const currentStock = new Set(stock().map(item => item.id));
      if (ids.some(id => !currentStock.has(id)
        || JSON.stringify(actor.items.get(id)?.toObject(true)) !== targetSources.get(id))) {
        throw new Error("Stock changed after review; read inventory before retrying.");
      }
    };
    try {
      await actor.setFlag(MODULE_ID, ledgerPath, { fingerprint });
      assertSession();
      for (const { data, assertSources } of additions) {
        assertSession();
        assertSources();
        const created = await actor.createEmbeddedDocuments("Item", [data]);
        assertSession();
        if (created.length !== 1 || !actor.items.has(created[0].id)
          || atPath(created[0].toObject(true), path) !== atPath(data, path)) {
          throw new Error("Addition was not saved as proposed.");
        }
        applied.push({ action: "add", id: created[0].id, uuid: created[0].uuid });
      }
      if (updates.length) {
        assertTargets(updates.map(update => update._id));
        await actor.updateEmbeddedDocuments("Item", updates);
        assertSession();
        for (const update of updates) {
          if (atPath(actor.items.get(update._id)?.toObject(true), path) !== update[path]) {
            throw new Error("Quantity was not saved as proposed.");
          }
          applied.push({ action: "quantity", id: update._id, quantity: update[path] });
        }
      }
      if (deletions.length) {
        assertTargets(deletions);
        await actor.deleteEmbeddedDocuments("Item", deletions);
        assertSession();
        for (const id of deletions) {
          if (actor.items.has(id)) {
            throw new Error("Item was not removed.");
          }
          applied.push({ action: "remove", id });
        }
      }
      const result = { ...receipt, status: "updated", applied };
      await actor.setFlag(MODULE_ID, ledgerPath, { fingerprint, result });
      assertSession();
      return result;
    } catch {
      assertSession();
      return { ...receipt, status: "incomplete", applied,
        warning: "Some writes may have saved. Read inventory before retrying identical operations with the same requestId." };
    }
  } finally {
    pending.delete(game);
  }
}
