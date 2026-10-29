import { MODULE_ID } from "../shared/protocol.js";
import { ELEVATION_BEHAVIOR_TYPE, validateElevationRegions } from "../shared/elevation-region-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";
import { canonical } from "./creation-utils.js";

const pending = new WeakSet();

/**
 * Add elevation Regions to one world scene after active-GM review.
 * Persist per-region retry markers with creation, including partial batches.
 */
export async function addElevationRegions(args, {
  game = globalThis.game, assertConnection = () => {}, confirm = confirmNpcEdit,
  crypto = globalThis.crypto
} = {}) {
  assertEnabledGM(game);
  validateElevationRegions(args);
  args = JSON.parse(JSON.stringify(args));
  const worldId = game.world.id;
  const userId = game.user.id;
  const scene = game.scenes.get(args.uuid.slice(6));
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || !scene || scene.pack || scene.parent || scene.uuid !== args.uuid || game.scenes.get(scene.id) !== scene) {
      throw new Error("Region creation requires a world Scene and the paired active GM.");
    }
  };
  const assertModule = () => {
    if (!(Number.parseInt(game.version, 10) >= 14) || !scene?.regions
      || !game.modules?.get("scene-elevation-region")?.active
      || !globalThis.CONFIG?.RegionBehavior?.dataModels?.[ELEVATION_BEHAVIOR_TYPE]) {
      throw new Error("Elevation regions require Foundry v14+, active Scene Elevation Region and its registered Elevation behavior.");
    }
  };
  assertSession();
  assertModule();
  if (pending.has(game)) {
    throw new Error("Another scene region request is in progress.");
  }
  pending.add(game);
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical({
      uuid: args.uuid, regions: args.regions
    }))));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    assertSession();
    const sources = args.regions.map(region => ({
      name: region.name, color: region.color ?? "#66CCFF",
      shapes: region.shapes, ownership: { default: 0, [userId]: 3 },
      visibility: globalThis.CONST?.REGION_VISIBILITY?.GAMEMASTER ?? 1, highlightMode: "coverage",
      behaviors: [{ name: "Elevation", type: ELEVATION_BEHAVIOR_TYPE,
        system: { elevation: region.elevation, shadowStrength: 2.15,
          modifyTokenElevation: true, modifyTokenScaling: true, ...region.behavior } }]
    }));
    const existing = () => {
      const matches = new Map();
      for (const region of scene.regions.values()) {
        const marker = region.getFlag(MODULE_ID, "elevationRegionRequest");
        if (marker?.id !== args.requestId || marker.userId !== userId) {
          continue;
        }
        if (marker.hash !== hash || !Number.isInteger(marker.index) || !sources[marker.index] || matches.has(marker.index)) {
          throw new Error("Region requestId already used with different data or duplicate markers; inspect the scene.");
        }
        matches.set(marker.index, region);
      }
      return matches;
    };
    const result = (status, reused) => ({
      status, uuid: scene.uuid, requestId: args.requestId, reused,
      regions: Array.from(existing(), ([index, region]) => ({ index, id: region.id, uuid: region.uuid }))
    });
    const matches = existing();
    if (matches.size === sources.length) {
      return result("unchanged", true);
    }
    const additions = sources.flatMap((source, index) => matches.has(index) ? [] : [{ ...source,
      flags: { [MODULE_ID]: { elevationRegionRequest: { id: args.requestId, userId, hash, index } } }
    }]);
    // Geometry/grid changes can invalidate placement even when regions are unchanged.
    const snapshot = JSON.stringify(scene.toObject(true));
    const approved = await confirm({ name: scene.name, title: "Foundry MCP: Confirm elevation regions",
      summary: args.summary ?? `Add ${additions.length} elevation region(s) to ${scene.name}.`,
      changes: additions.map((source, index) => ({ document: scene.name, path: `New elevation region ${index + 1}`,
        before: null, after: source })) });
    assertSession();
    assertModule();
    if (approved !== true) {
      return result("cancelled", false);
    }
    if (JSON.stringify(scene.toObject(true)) !== snapshot) {
      throw new Error("Scene changed while awaiting confirmation; read the scene and request a fresh review.");
    }
    let failed = false;
    try {
      await scene.createEmbeddedDocuments("Region", additions);
    } catch {
      failed = true;
    }
    assertSession();
    return result(failed || existing().size !== sources.length ? "incomplete" : "updated", false);
  } finally {
    pending.delete(game);
  }
}
