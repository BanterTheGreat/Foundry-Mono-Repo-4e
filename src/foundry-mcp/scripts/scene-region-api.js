import { ELEVATION_BEHAVIOR_TYPE } from "../shared/elevation-region-data.js";
import { validateSceneRegionEdit } from "../shared/scene-region-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();

/**
 * Edit or delete existing native Regions on one world scene after active-GM review.
 * Edits set absolute values, so retrying an uncertain request is safe: matching
 * values are skipped and already-deleted Regions are no-ops.
 */
export async function editSceneRegions(args, {
  game = globalThis.game, assertConnection = () => {}, confirm = confirmNpcEdit
} = {}) {
  assertEnabledGM(game);
  validateSceneRegionEdit(args);
  args = JSON.parse(JSON.stringify(args));
  const worldId = game.world.id;
  const userId = game.user.id;
  const scene = game.scenes.get(args.uuid.slice(6));
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || !scene || scene.pack || scene.parent || scene.uuid !== args.uuid || game.scenes.get(scene.id) !== scene
      || !scene.regions) {
      throw new Error("Region edits require a world Scene and the paired active GM.");
    }
  };
  const assertElevationModule = () => {
    if (!(Number.parseInt(game.version, 10) >= 14)
      || !game.modules?.get("scene-elevation-region")?.active
      || !globalThis.CONFIG?.RegionBehavior?.dataModels?.[ELEVATION_BEHAVIOR_TYPE]) {
      throw new Error("Elevation edits require Foundry v14+, active Scene Elevation Region and its registered Elevation behavior.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another scene region request is in progress.");
  }
  pending.add(game);
  const applied = [];
  let writing = false;
  try {
    const snapshot = JSON.stringify(scene.toObject(true));
    const sources = new Map();
    const updates = [];
    const removals = [];
    const changes = [];
    const differs = (before, after) => JSON.stringify(before) !== JSON.stringify(after);
    for (const input of args.update ?? []) {
      const region = scene.regions.get(input.id);
      if (!region) {
        throw new Error("Updates require an existing Region ID in this scene.");
      }
      const source = region.toObject(true);
      sources.set(region.id, JSON.stringify(source));
      const patch = { _id: region.id };
      for (const field of ["name", "color", "shapes"]) {
        if (input[field] !== undefined && differs(source[field], input[field])) {
          patch[field] = input[field];
          changes.push({ document: region.name, path: field, before: source[field] ?? null, after: input[field] });
        }
      }
      let behaviorPatch;
      if (input.elevation !== undefined || input.behavior !== undefined) {
        assertElevationModule();
        const behaviors = (source.behaviors ?? []).filter(behavior => behavior.type === ELEVATION_BEHAVIOR_TYPE);
        if (behaviors.length !== 1) {
          throw new Error(`Region ${region.id} needs exactly one Elevation behavior for elevation/behavior edits.`);
        }
        const [behavior] = behaviors;
        const requested = { ...(input.behavior ?? {}) };
        if (input.elevation !== undefined) {
          requested.elevation = input.elevation;
        }
        if (requested.slopeHeight && (requested.slope ?? behavior.system?.slope) !== true) {
          throw new Error("slopeHeight requires slope to be enabled.");
        }
        const system = {};
        for (const [key, value] of Object.entries(requested)) {
          if (differs(behavior.system?.[key], value)) {
            system[key] = value;
            changes.push({ document: region.name, path: `Elevation behavior ${key}`, before: behavior.system?.[key] ?? null, after: value });
          }
        }
        if (Object.keys(system).length) {
          behaviorPatch = { _id: behavior._id, system };
        }
      }
      if (Object.keys(patch).length > 1 || behaviorPatch) {
        updates.push({ id: region.id, patch: Object.keys(patch).length > 1 ? patch : null, behaviorPatch });
      }
    }
    for (const id of args.remove ?? []) {
      const region = scene.regions.get(id);
      if (region) {
        sources.set(id, JSON.stringify(region.toObject(true)));
        removals.push(id);
        changes.push({ document: region.name, path: "Remove region", before: region.toObject(true), after: null });
      }
    }
    if (!changes.length) {
      return { uuid: scene.uuid, status: "unchanged", applied };
    }
    const approved = await confirm({ name: scene.name, title: "Foundry MCP: Confirm scene region changes",
      summary: args.summary ?? `Apply ${changes.length} region change(s) to ${scene.name}.`, changes });
    assertSession();
    if (approved !== true) {
      return { uuid: scene.uuid, status: "cancelled", applied };
    }
    if (JSON.stringify(scene.toObject(true)) !== snapshot) {
      throw new Error("Scene changed while awaiting confirmation; read its regions and request a fresh review.");
    }
    writing = true;
    const assertSource = id => {
      assertSession();
      if (sources.get(id) !== JSON.stringify(scene.regions.get(id)?.toObject(true))) {
        throw new Error("Region source changed before writing; read it and propose again.");
      }
    };
    for (const { id, patch, behaviorPatch } of updates) {
      assertSource(id);
      const region = scene.regions.get(id);
      if (patch) {
        const updated = await scene.updateEmbeddedDocuments("Region", [patch]);
        assertSession();
        if (updated.length !== 1) {
          throw new Error("Region update was cancelled.");
        }
      }
      if (behaviorPatch) {
        const updated = await region.updateEmbeddedDocuments("RegionBehavior", [behaviorPatch]);
        assertSession();
        if (updated.length !== 1) {
          throw new Error("Region behavior update was cancelled.");
        }
      }
      applied.push({ action: "update", id, uuid: region.uuid });
    }
    for (const id of removals) {
      assertSource(id);
      const deleted = await scene.deleteEmbeddedDocuments("Region", [id]);
      assertSession();
      if (deleted.length !== 1) {
        throw new Error("Region deletion was cancelled.");
      }
      applied.push({ action: "remove", id });
    }
    return { uuid: scene.uuid, status: "updated", applied };
  } catch (error) {
    if (writing) {
      return { uuid: scene.uuid, status: "incomplete", applied,
        message: "Some changes may have saved. Read the scene regions before retrying identical arguments.", error: error.message };
    }
    throw error;
  } finally {
    pending.delete(game);
  }
}
