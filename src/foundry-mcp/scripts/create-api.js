import { MODULE_ID, MAX_MESSAGE_BYTES } from "../shared/protocol.js";
import { validateNpcRequest } from "../shared/npc-data.js";
import { assertEnabledGM } from "./read-api.js";

const pending = new WeakMap();
const folderPending = new WeakMap();

/**
 * Resolve an explicit destination and create missing Actor folder paths.
 * Serialize folder work so concurrent NPC requests share the same new folder.
 */
async function resolveFolder(game, destination, Folder, assertSession) {
  const previous = folderPending.get(game) ?? Promise.resolve();
  const promise = previous.catch(() => {}).then(async () => {
    assertSession();
    return findOrCreateFolder(game, destination, Folder, assertSession);
  });
  folderPending.set(game, promise);
  try {
    return await promise;
  } finally {
    if (folderPending.get(game) === promise) {
      folderPending.delete(game);
    }
  }
}

/**
 * Match Actor folders only; require a path or ID for ambiguous names.
 */
async function findOrCreateFolder(game, destination, Folder, assertSession) {
  const selector = destination.trim();
  const byId = game.folders.get(selector);
  if (byId) {
    if (byId.type !== "Actor" || byId.pack) {
      throw new Error("Choose a world Actor folder.");
    }
    return byId;
  }
  const segments = selector.split("/").map(segment => segment.trim());
  if (segments.some(segment => !segment || segment.length > 200)) {
    throw new Error("Use a folder name or path with non-empty names of at most 200 characters.");
  }
  const path = segments.join("/");
  const actorFolders = () => Array.from(game.folders.values()).filter(folder => folder.type === "Actor" && !folder.pack);
  const matches = actorFolders().filter(folder => segments.length > 1
    ? folderPath(folder) === path
    : folder.name === path);
  if (matches.length > 1) {
    throw new Error("Folder name or path is ambiguous; specify its full path or folder ID.");
  }
  if (matches.length === 1) {
    return matches[0];
  }
  let parent = null;
  for (const name of segments) {
    assertSession();
    const children = actorFolders().filter(folder => folder.name === name && (folder.folder?.id ?? null) === (parent?.id ?? null));
    if (children.length > 1) {
      throw new Error("Folder path is ambiguous; specify a folder ID.");
    }
    if (children.length === 1) {
      parent = children[0];
      continue;
    }
    parent = await Folder.create({ name, type: "Actor", folder: parent?.id ?? null });
    assertSession();
    if (!parent) {
      throw new Error("Actor folder creation was cancelled.");
    }
  }
  return parent;
}

/**
 * Read the parent chain without relying on Foundry's derived folder path.
 */
function folderPath(folder) {
  const names = [];
  const visited = new Set();
  for (let current = folder; current; current = current.folder) {
    if (visited.has(current.id)) {
      throw new Error("Invalid folder hierarchy.");
    }
    visited.add(current.id);
    names.unshift(current.name);
  }
  return names.join("/");
}

/**
 * Canonical JSON makes retry fingerprints independent of property order.
 */
function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

/**
 * Create one world NPC with embedded powers/traits through a single awaited
 * document creation. Persist a request fingerprint so ambiguous retries cannot
 * create duplicates across browser reloads. No existing document is modified.
 */
export async function createNpc(args, { game = globalThis.game, Actor = globalThis.Actor, Folder = globalThis.Folder, crypto = globalThis.crypto } = {}) {
  assertEnabledGM(game);
  validateNpcRequest(args);
  if (game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
    throw new Error("NPC creation supports DnD4e 0.9.3 only.");
  }
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    if (game.world.id !== worldId || game.user.id !== userId) {
      throw new Error("GM session changed.");
    }
  };
  const payload = JSON.stringify(canonical({ ...args, items: args.items ?? [] }));
  if (new TextEncoder().encode(payload).length > MAX_MESSAGE_BYTES / 2) {
    throw new Error("NPC data exceeds 2 MiB.");
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
      throw new Error("Request ID already used with different NPC data.");
    }
    const result = await inFlight.promise;
    assertSession();
    return { ...result, reused: true };
  }
  const promise = (async () => {
    const existing = Array.from(game.actors.values()).find(actor => {
      const marker = actor.getFlag(MODULE_ID, "creationRequest");
      return marker?.id === args.requestId && marker.userId === userId;
    });
    if (existing) {
      if (existing.type !== "NPC" || existing.getFlag(MODULE_ID, "creationRequest").hash !== hash) {
        throw new Error("Request ID already used with different NPC data.");
      }
      return creationResult(existing, true);
    }
    const size = { tiny: 1, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 }[args.system.details?.size ?? "med"];
    if (!size) {
      throw new Error("Unsupported NPC size.");
    }
    const folder = await resolveFolder(game, args.folder, Folder, assertSession);
    assertSession();
    const data = {
      name: args.name, type: "NPC", folder: folder.id,
      ...(args.img === undefined ? {} : { img: args.img }),
      system: {
        ...args.system, advancedCals: false,
        details: { ...args.system.details, tier: Math.max(1, Math.min(3, Math.floor(((args.system.details?.level ?? 1) - 1) / 10) + 1)) }
      },
      items: args.items ?? [],
      prototypeToken: { name: args.name, actorLink: false, disposition: -1, width: size, height: size },
      flags: { [MODULE_ID]: { creationRequest: { id: args.requestId, userId, hash } } }
    };
    assertSession();
    // Foundry validates the complete actor and embedded data during creation.
    const actor = await Actor.create(data, { renderSheet: false });
    if (!actor) {
      throw new Error("NPC creation was cancelled.");
    }
    assertSession();
    return creationResult(actor, false);
  })();
  requests.set(key, { hash, promise });
  try {
    return await promise;
  } finally {
    requests.delete(key);
  }
}

/**
 * Keep the creation receipt bounded; use get_document for full verification.
 */
function creationResult(actor, reused) {
  return {
    id: actor.id, uuid: actor.uuid, name: actor.name, type: actor.type,
    folder: actor.folder?.id ?? null, reused,
    items: Array.from(actor.items.values(), item => ({ id: item.id, uuid: item.uuid, name: item.name, type: item.type }))
  };
}
