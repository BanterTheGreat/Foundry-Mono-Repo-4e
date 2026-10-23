import { MODULE_ID } from "../shared/protocol.js";
import { cleanPowerName, PC_INVENTORY_TYPES, validatePcImport } from "../shared/pc-import-data.js";
import { assertEnabledGM } from "./read-api.js";
import { canonical } from "./creation-utils.js";

const pending = new WeakSet();
const normalize = name => name.trim().toLocaleLowerCase();

/**
 * Resolve only the named Item packs owned by the requested compendium module.
 */
function resolvePack(game, label) {
  const labels = label === "Equipment Powers" ? ["Equipment Powers", "Powers (Equipment)"] : [label];
  const packs = Array.from(game.packs.values()).filter(pack =>
    pack.metadata.packageName === "dnd-4e-compendium"
    && pack.documentName === "Item"
    && labels.some(name => normalize(pack.metadata.label) === normalize(name)));
  if (packs.length !== 1 || !packs[0].testUserPermission(game.user, "OBSERVER")) {
    throw new Error(`Require one accessible ${label} Item pack from dnd-4e-compendium.`);
  }
  return packs[0];
}

/**
 * Select a discovered inventory pack without allowing arbitrary source data.
 */
function resolveInventoryPack(game, id) {
  const pack = game.packs.get(id);
  if (!pack || pack.metadata.packageName !== "dnd-4e-compendium"
    || pack.documentName !== "Item" || !pack.testUserPermission(game.user, "OBSERVER")) {
    throw new Error("Magic items require an accessible Item pack from dnd-4e-compendium.");
  }
  return pack;
}

/**
 * Import selected compendium options and inventory into an existing world PC. Resolve
 * the entire batch before writing; persisted per-item markers recover partial
 * saves and disconnected retries without modifying existing character items.
 */
export async function importPcOptions(args, {
  game = globalThis.game, crypto = globalThis.crypto, assertConnection = () => {}
} = {}) {
  assertEnabledGM(game);
  validatePcImport(args);
  args = JSON.parse(JSON.stringify(args));
  const worldId = game.world.id;
  const userId = game.user.id;
  const actor = game.actors.get(args.uuid.slice(6));
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3"
      || !actor || actor.type !== "Player Character" || actor.parent || actor.pack
      || actor.uuid !== args.uuid || game.actors.get(actor.id) !== actor) {
      throw new Error("Import requires a world Player Character and the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another PC import is in progress.");
  }
  pending.add(game);
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(args))));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    assertSession();
    for (const item of actor.items.values()) {
      const marker = item.getFlag(MODULE_ID, "pcImport");
      if (marker?.requestId === args.requestId && marker.userId === userId && marker.hash !== hash) {
        throw new Error("Request ID already used with different PC import data.");
      }
    }
    const choices = [];
    for (const [key, label, type] of [["powers", "Powers", "power"], ["equipmentPowers", "Equipment Powers", "power"], ["feats", "Feats", "feature"], ["rituals", "Rituals", "ritual"], ["magicItems", "Magic Items", null]]) {
      if (!args[key]?.length) {
        continue;
      }
      for (const entry of args[key]) {
        const inventory = key === "magicItems";
        const pack = inventory ? resolveInventoryPack(game, entry.pack) : resolvePack(game, label);
        const index = await pack.getIndex();
        assertSession();
        const rows = Array.from(index.values());
        const exact = rows.filter(row => entry.id ? row._id === entry.id : normalize(row.name) === normalize(entry.name));
        const matches = exact.length || entry.id || type !== "power" ? exact
          : rows.filter(row => normalize(cleanPowerName(row.name)) === normalize(cleanPowerName(entry.name)));
        if (matches.length !== 1) {
          return { status: "unresolved", uuid: actor.uuid, pack: pack.collection, choice: entry,
            message: matches.length ? "Ambiguous name; select a compendium entry id." : "No matching entry; inspect the compendium index.",
            candidates: matches.slice(0, 100).map(row => ({ id: row._id, name: row.name })) };
        }
        const source = await pack.getDocument(matches[0]._id);
        assertSession();
        if ((inventory ? !PC_INVENTORY_TYPES.includes(source?.type) : source?.type !== type)
          || (type === "feature" && source.system.featureType !== "feat")) {
          throw new Error(`Selected ${label} entry has the wrong Item type.`);
        }
        const sourceId = source.uuid;
        if (choices.some(choice => choice.sourceId === sourceId)) {
          throw new Error("The same compendium entry was selected more than once.");
        }
        const data = source.toObject(true);
        for (const field of ["_id", "folder", "ownership", "_stats", "sort"]) {
          delete data[field];
        }
        data.name = type === "power" ? cleanPowerName(data.name) : data.name;
        if (entry.level !== undefined) {
          data.system.level = entry.level;
        }
        if (inventory) {
          data.system.equipped = false;
        }
        data.flags ??= {};
        data.flags.core = { ...data.flags.core, sourceId };
        data.flags[MODULE_ID] = { pcImport: { requestId: args.requestId, userId, hash, sourceId, level: data.system.level } };
        choices.push({ sourceId, data, inventory });
      }
    }
    const results = [];
    const missing = [];
    for (const choice of choices) {
      const existing = Array.from(actor.items.values()).filter(item =>
        item.getFlag(MODULE_ID, "pcImport")?.sourceId === choice.sourceId
        || item.getFlag("core", "sourceId") === choice.sourceId
        || (!choice.inventory && item.type === choice.data.type && normalize(item.type === "power" ? cleanPowerName(item.name) : item.name) === normalize(choice.data.name)));
      if (existing.length) {
        results.push(...existing.map(item => ({ uuid: item.uuid, name: item.name, level: item.system.level, status: "existing", sourceId: choice.sourceId })));
      } else {
        missing.push(choice);
      }
    }
    assertSession();
    let failed = false;
    if (missing.length) {
      try {
        await actor.createEmbeddedDocuments("Item", missing.map(choice => choice.data), { keepId: false });
      } catch {
        failed = true;
      }
      assertSession();
      for (const choice of missing) {
        const item = Array.from(actor.items.values()).find(item => {
          const marker = item.getFlag(MODULE_ID, "pcImport");
          return marker?.hash === hash && marker.sourceId === choice.sourceId;
        });
        results.push({ sourceId: choice.sourceId, status: item ? "imported" : "missing",
          ...(item ? { uuid: item.uuid, name: item.name, level: item.system.level } : {}) });
      }
    }
    return { uuid: actor.uuid, name: actor.name,
      status: failed || results.some(item => item.status === "missing") ? "incomplete" : "complete", items: results };
  } finally {
    pending.delete(game);
  }
}
