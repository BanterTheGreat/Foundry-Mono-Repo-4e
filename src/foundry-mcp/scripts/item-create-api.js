import { MODULE_ID, MAX_MESSAGE_BYTES } from "../shared/protocol.js";
import { validateItemRequest } from "../shared/item-data.js";
import { assertEnabledGM } from "./read-api.js";
import { canonical, resolveCreationFolder } from "./creation-utils.js";

const pending = new WeakMap();

/**
 * Create a new world Item, with a persistent receipt for safe retries.
 * Caller-supplied effects, macros, IDs and document links are excluded.
 */
export async function createItem(args, { game = globalThis.game, Item = globalThis.Item, Folder = globalThis.Folder, crypto = globalThis.crypto } = {}) {
  assertEnabledGM(game);
  validateItemRequest(args);
  if (game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
    throw new Error("Item creation supports DnD4e 0.9.3 only.");
  }
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    if (game.world.id !== worldId || game.user.id !== userId) {
      throw new Error("GM session changed.");
    }
  };
  const payload = JSON.stringify(canonical(args));
  if (new TextEncoder().encode(payload).length > MAX_MESSAGE_BYTES / 2) {
    throw new Error("Item data exceeds 2 MiB.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  assertSession();
  let requests = pending.get(game);
  if (!requests) {
    requests = new Map();
    pending.set(game, requests);
  }
  const key = `${userId}:${args.requestId}`;
  const inFlight = requests.get(key);
  if (inFlight) {
    if (inFlight.hash !== hash) {
      throw new Error("Request ID already used with different Item data.");
    }
    const result = await inFlight.promise;
    assertSession();
    return { ...result, reused: true };
  }
  const promise = (async () => {
    const existing = Array.from(game.items.values()).find(item => {
      const marker = item.getFlag(MODULE_ID, "creationRequest");
      return marker?.id === args.requestId && marker.userId === userId;
    });
    if (existing) {
      const marker = existing.getFlag(MODULE_ID, "creationRequest");
      if (existing.parent || existing.pack || existing.type !== args.type || marker.hash !== hash) {
        throw new Error("Request ID already used with different Item data.");
      }
      return creationResult(existing, true);
    }
    const folder = await resolveCreationFolder(game, args.folder, Folder, assertSession, "Item");
    assertSession();
    const data = {
      name: args.name, type: args.type, folder: folder.id, system: args.system,
      ...(args.img === undefined ? {} : { img: args.img }),
      flags: { [MODULE_ID]: { creationRequest: { id: args.requestId, userId, hash } } }
    };
    const item = await Item.create(data, { renderSheet: false });
    if (!item) {
      throw new Error("Item creation was cancelled.");
    }
    assertSession();
    return creationResult(item, false);
  })();
  requests.set(key, { hash, promise });
  try {
    return await promise;
  } finally {
    requests.delete(key);
  }
}

/**
 * Return a bounded receipt; full verification uses get_document.
 */
function creationResult(item, reused) {
  return {
    id: item.id, uuid: item.uuid, name: item.name, type: item.type,
    folder: item.folder?.id ?? null, reused
  };
}
