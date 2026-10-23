import { MODULE_ID } from "../shared/protocol.js";
import { DEFAULT_RITUAL_IMAGE, validateRitualRequest } from "../shared/ritual-data.js";
import { assertEnabledGM } from "./read-api.js";
import { canonical, resolveCreationFolder } from "./creation-utils.js";

const pending = new WeakMap();

/**
 * Create an authored ritual either in a world Item folder or directly on a PC.
 * A single persisted creation marker covers retries, including uncertain saves
 * and attempts to reuse the same request ID with a different destination.
 */
export async function createRitual(args, {
  game = globalThis.game, Item = globalThis.Item, Folder = globalThis.Folder,
  crypto = globalThis.crypto, assertConnection = () => {}
} = {}) {
  assertEnabledGM(game);
  validateRitualRequest(args);
  args = { ...args, img: DEFAULT_RITUAL_IMAGE,
    ...(args.actorUuid === undefined ? { folder: args.folder ?? "Rituals" } : {}) };
  const actor = args.actorUuid === undefined ? null : game.actors.get(args.actorUuid.slice(6));
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Ritual creation requires the paired GM and DnD4e 0.9.3.");
    }
    if (args.actorUuid !== undefined && (!game.user.isActiveGM || !actor
      || actor.uuid !== args.actorUuid || actor.type !== "Player Character" || actor.pack || actor.parent
      || game.actors.get(actor.id) !== actor)) {
      throw new Error("Direct ritual creation requires a world PC and the paired active GM.");
    }
  };
  assertSession();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(args))));
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
      throw new Error("Request ID already used with different ritual data or destination.");
    }
    const result = await inFlight.promise;
    assertSession();
    return { ...result, reused: true };
  }
  const promise = (async () => {
    // Include embedded Items so changing the target on a retry cannot silently
    // create a second ritual, or turn a PC ritual into a separate world Item.
    const candidates = [...game.items.values(), ...Array.from(game.actors.values())
      .filter(document => !document.pack && !document.parent)
      .flatMap(document => Array.from(document.items.values()))];
    const existing = candidates.filter(item => {
      const marker = item.getFlag(MODULE_ID, "creationRequest");
      return marker?.id === args.requestId && marker.userId === userId;
    });
    if (existing.length) {
      const item = existing[0];
      const marker = item.getFlag(MODULE_ID, "creationRequest");
      if (existing.length !== 1 || marker.operation !== "create_ritual" || marker.hash !== hash
        || item.type !== "ritual" || item.pack
        || (item.parent ?? null) !== actor) {
        throw new Error("Request ID already used with different ritual data or destination.");
      }
      return ritualResult(item, true);
    }
    const data = {
      name: args.name, type: "ritual", img: args.img,
      system: { level: args.level,
        description: { chat: args.text, value: args.description } },
      flags: { [MODULE_ID]: { creationRequest: {
        id: args.requestId, userId, hash, operation: "create_ritual"
      } } }
    };
    let item;
    if (actor) {
      assertSession();
      [item] = await actor.createEmbeddedDocuments("Item", [data], { renderSheet: false });
    } else {
      const folder = await resolveCreationFolder(game, args.folder, Folder, assertSession, "Item");
      assertSession();
      item = await Item.create({ ...data, folder: folder.id }, { renderSheet: false });
    }
    assertSession();
    if (!item) {
      throw new Error("Ritual creation was cancelled; inspect the destination before retrying identical data.");
    }
    return ritualResult(item, false);
  })();
  requests.set(key, { hash, promise });
  try {
    return await promise;
  } finally {
    requests.delete(key);
  }
}

/**
 * Return stored identity and destination; use get_document for full content.
 */
function ritualResult(item, reused) {
  return {
    id: item.id, uuid: item.uuid, name: item.name, type: item.type,
    level: item.system.level, img: item.img,
    actorUuid: item.parent?.uuid ?? null, folder: item.folder?.id ?? null, reused
  };
}
