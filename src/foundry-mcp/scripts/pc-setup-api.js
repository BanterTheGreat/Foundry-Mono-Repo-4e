import { MODULE_ID } from "../shared/protocol.js";
import { CORE_PC_POWERS, pcSetupSystem, validatePcSetup } from "../shared/pc-setup-data.js";
import { assertEnabledGM } from "./read-api.js";
import { canonical, resolveCreationFolder } from "./creation-utils.js";

const pending = new WeakMap();
const normalize = value => value.trim().toLowerCase();

/**
 * Resolve only the requested named Item pack, never substitute another pack
 * when a required source is missing or ambiguous.
 */
function setupPack(game, label, { classes = false, id } = {}) {
  const matches = Array.from(game.packs.values()).filter(pack => pack.documentName === "Item"
    && normalize(pack.metadata.label) === normalize(label)
    && (!classes || ["dnd-4e-compendium", "dnd-4e-compendiums"].includes(pack.metadata.packageName))
    && (id === undefined || pack.collection === id));
  if (matches.length !== 1 || !matches[0].testUserPermission(game.user, "OBSERVER")) {
    return null;
  }
  return matches[0];
}

/**
 * Serialize trusted compendium source data for a fresh embedded Item, retaining
 * its effects and native mechanics while generating fresh document IDs.
 */
function embeddedSource(item) {
  const data = item.toObject(true);
  for (const field of ["_id", "folder", "ownership", "_stats", "sort"]) {
    delete data[field];
  }
  data.flags ??= {};
  data.flags.core = { ...data.flags.core, sourceId: item.uuid };
  delete data.flags[MODULE_ID];
  return data;
}

/**
 * Create a configured PC and all six compendium Items in one Actor.create.
 * A persisted fingerprint supports retries even after a browser reload.
 */
export async function setupPc(args, {
  game = globalThis.game, Actor = globalThis.Actor, Folder = globalThis.Folder,
  crypto = globalThis.crypto, assertConnection = () => {}
} = {}) {
  assertEnabledGM(game);
  validatePcSetup(args);
  args = { ...args, folder: args.folder ?? "Player Characters" };
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("PC setup requires the paired active GM and DnD4e 0.9.3.");
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
      throw new Error("Request ID already used with different PC setup data.");
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
      const marker = existing.getFlag(MODULE_ID, "creationRequest");
      if (existing.type !== "Player Character" || existing.parent || existing.pack
        || marker.operation !== "setup_pc" || marker.hash !== hash) {
        throw new Error("Request ID already used with different PC setup data.");
      }
      return setupResult(existing, true);
    }
    const classes = setupPack(game, "Classes", { classes: true });
    const core = setupPack(game, "Powers (Core)", { id: args.corePack });
    if (!classes || !core) {
      return { status: "unresolved", message: "Require one accessible Classes Item pack from dnd-4e-compendium and one Powers (Core) Item pack. Discover packs; corePack may disambiguate the latter." };
    }
    const items = [];
    for (const [pack, names, type] of [[classes, [args.class], "feature"], [core, CORE_PC_POWERS, "power"]]) {
      const index = await pack.getIndex();
      assertSession();
      for (const name of names) {
        let matches = Array.from(index.values()).filter(row => pack === classes && args.classId
          ? row._id === args.classId : normalize(row.name) === normalize(name));
        // The core pack calls the Charge action "Charge Attack". Prefer the
        // requested literal title when present, and accept this known alias.
        if (!matches.length && pack === core && name === "Charge") {
          matches = Array.from(index.values()).filter(row => normalize(row.name) === "charge attack");
        }
        if (matches.length !== 1) {
          return { status: "unresolved", pack: pack.collection, name,
            message: "Require one exact case-insensitive match; inspect the index and disambiguate the class with classId.",
            candidates: matches.slice(0, 100).map(row => ({ id: row._id, name: row.name })) };
        }
        const source = await pack.getDocument(matches[0]._id);
        assertSession();
        if (source?.type !== type || (type === "feature" && source.system.featureType !== "class")) {
          throw new Error("Compendium entry has the wrong type for PC setup.");
        }
        items.push(embeddedSource(source));
      }
    }
    const folder = await resolveCreationFolder(game, args.folder, Folder, assertSession, "Actor");
    assertSession();
    const actor = await Actor.create({
      name: args.name, type: "Player Character", folder: folder.id,
      system: pcSetupSystem(args), items,
      prototypeToken: { name: args.name, actorLink: true, disposition: 1 },
      flags: { [MODULE_ID]: { creationRequest: {
        id: args.requestId, userId, hash, operation: "setup_pc",
        sources: items.map(item => item.flags.core.sourceId)
      } } }
    }, { renderSheet: false });
    assertSession();
    if (!actor) {
      throw new Error("PC creation was cancelled.");
    }
    return setupResult(actor, false);
  })();
  requests.set(key, { hash, promise });
  try {
    return await promise;
  } finally {
    requests.delete(key);
  }
}

/**
 * Report missing Items explicitly on uncertain creation or a later retry.
 * Existing actors are never silently repaired or replaced by this operation.
 */
function setupResult(actor, reused) {
  const items = Array.from(actor.items.values(), item => ({
    uuid: item.uuid, name: item.name, type: item.type, sourceId: item.getFlag("core", "sourceId")
  }));
  const expected = actor.getFlag(MODULE_ID, "creationRequest").sources;
  const missing = expected.filter(sourceId => !items.some(item => item.sourceId === sourceId));
  return { uuid: actor.uuid, name: actor.name, type: actor.type, folder: actor.folder?.id ?? null,
    reused, status: missing.length ? "incomplete" : "complete", items, missing };
}
