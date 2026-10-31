import test from "node:test";
import assert from "node:assert/strict";
import { editSceneRegions } from "../scripts/scene-region-api.js";
import { validateSceneRegionEdit } from "../shared/scene-region-data.js";
import { executeRead } from "../scripts/read-api.js";

const ELEVATION = "scene-elevation-region.elevation";

/**
 * Model persisted Regions with embedded behaviors, approval and Foundry writes.
 */
function fixture() {
  globalThis.CONFIG = { RegionBehavior: { dataModels: { [ELEVATION]: class {} } } };
  const scene = { id: "map", uuid: "Scene.map", name: "Battlefield", documentName: "Scene", width: 1000, height: 800, padding: 0.25,
    grid: { size: 100, distance: 5, units: "ft" }, regions: new Map(),
    testUserPermission: () => true,
    toObject: () => ({ width: scene.width, regions: Array.from(scene.regions.values(), entry => entry.toObject(true)) }) };
  const add = (id, data) => {
    const region = { id, uuid: `Scene.map.Region.${id}`, name: data.name, data,
      toObject: () => structuredClone({ _id: id, ...region.data }) };
    region.updateEmbeddedDocuments = async (type, patches) => {
      assert.equal(type, "RegionBehavior");
      for (const patch of patches) {
        const behavior = region.data.behaviors.find(entry => entry._id === patch._id);
        Object.assign(behavior.system, patch.system);
      }
      return patches;
    };
    scene.regions.set(id, region);
    return region;
  };
  add("platform", { name: "Platform", color: "#66CCFF", visibility: 1,
    shapes: [{ type: "rectangle", x: 100, y: 200, width: 300, height: 200 }],
    behaviors: [{ _id: "elev", name: "Elevation", type: ELEVATION, system: { elevation: 5, slope: false, shadowStrength: 2.15 } }] });
  add("pit", { name: "Pit", color: "#FF0000", visibility: 1,
    shapes: [{ type: "ellipse", x: 500, y: 200, radiusX: 100, radiusY: 100 }],
    behaviors: [{ _id: "elev", name: "Elevation", type: ELEVATION, system: { elevation: -5 } }] });
  add("plain", { name: "Plain", color: "#00FF00", visibility: 1,
    shapes: [{ type: "rectangle", x: 0, y: 0, width: 50, height: 50 }], behaviors: [] });
  scene.updateEmbeddedDocuments = async (type, patches) => {
    assert.equal(type, "Region");
    for (const { _id, ...fields } of patches) {
      const region = scene.regions.get(_id);
      Object.assign(region.data, fields);
      region.name = region.data.name;
    }
    return patches;
  };
  scene.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(type, "Region");
    ids.forEach(id => scene.regions.delete(id));
    return ids;
  };
  const game = { version: "14.360", modules: new Map([["scene-elevation-region", { active: true }]]), ready: true,
    socket: { connected: true }, settings: { get: () => true }, user: { id: "gm", isGM: true, isActiveGM: true },
    world: { id: "world" }, scenes: new Map([[scene.id, scene]]) };
  const deps = { game, confirm: async report => { deps.report = report; return true; } };
  return { scene, game, deps };
}

test("updates names, colors, shapes and the Elevation behavior after confirmation", async () => {
  const f = fixture();
  const shapes = [{ type: "polygon", points: [0, 0, 100, 0, 100, 100] }];
  const result = await editSceneRegions({ uuid: "Scene.map", summary: "Rework the platform.", update: [
    { id: "platform", name: "Dais", color: "#112233", shapes, elevation: 10, behavior: { slope: true, slopeHeight: 5 } },
    { id: "plain", name: "Floor" }
  ] }, f.deps);
  assert.equal(result.status, "updated");
  assert.deepEqual(result.applied.map(entry => entry.id), ["platform", "plain"]);
  const platform = f.scene.regions.get("platform").data;
  assert.equal(platform.name, "Dais");
  assert.equal(platform.color, "#112233");
  assert.deepEqual(platform.shapes, shapes);
  assert.deepEqual(platform.behaviors[0].system, { elevation: 10, slope: true, slopeHeight: 5, shadowStrength: 2.15 });
  assert.equal(f.scene.regions.get("plain").data.name, "Floor");
  assert.equal(f.deps.report.summary, "Rework the platform.");
  assert.ok(f.deps.report.changes.some(change => change.path === "Elevation behavior elevation" && change.before === 5 && change.after === 10));
  const retry = await editSceneRegions({ uuid: "Scene.map", update: [{ id: "plain", name: "Floor" }] }, f.deps);
  assert.equal(retry.status, "unchanged");
});

test("removes exact regions, treats missing IDs as no-ops and shows the removed source", async () => {
  const f = fixture();
  const result = await editSceneRegions({ uuid: "Scene.map", remove: ["pit", "gone"] }, f.deps);
  assert.equal(result.status, "updated");
  assert.deepEqual(result.applied, [{ action: "remove", id: "pit" }]);
  assert.equal(f.scene.regions.has("pit"), false);
  assert.equal(f.deps.report.changes[0].before.name, "Pit");
  assert.equal((await editSceneRegions({ uuid: "Scene.map", remove: ["pit"] }, f.deps)).status, "unchanged");
});

test("cancel, close and expiry save nothing", async () => {
  for (const approved of [false, undefined]) {
    const f = fixture();
    f.deps.confirm = async () => approved;
    assert.equal((await editSceneRegions({ uuid: "Scene.map", remove: ["pit"] }, f.deps)).status, "cancelled");
    assert.equal(f.scene.regions.size, 3);
  }
});

test("rejects stale scenes, session changes and connection loss during review", async () => {
  for (const mutate of [f => f.scene.width++, f => f.game.user.isActiveGM = false,
    f => f.game.world.id = "other", f => f.game.socket.connected = false, f => f.game.scenes.delete("map")]) {
    const f = fixture();
    f.deps.confirm = async () => { mutate(f); return true; };
    await assert.rejects(editSceneRegions({ uuid: "Scene.map", update: [{ id: "pit", name: "Hole" }] }, f.deps));
    assert.equal(f.scene.regions.get("pit")?.data.name ?? "Pit", "Pit");
  }
});

test("elevation edits require one Elevation behavior and the active module", async () => {
  const f = fixture();
  await assert.rejects(editSceneRegions({ uuid: "Scene.map", update: [{ id: "plain", elevation: 3 }] }, f.deps), /exactly one Elevation/);
  await assert.rejects(editSceneRegions({ uuid: "Scene.map", update: [{ id: "pit", behavior: { slopeHeight: 5 } }] }, f.deps), /slope/);
  f.game.modules.clear();
  await assert.rejects(editSceneRegions({ uuid: "Scene.map", update: [{ id: "pit", elevation: 3 }] }, f.deps), /require Foundry/);
  assert.equal(f.scene.regions.get("pit").data.behaviors[0].system.elevation, -5);
  // Name and shape edits never need the elevation module.
  assert.equal((await editSceneRegions({ uuid: "Scene.map", update: [{ id: "plain", name: "Floor" }] }, f.deps)).status, "updated");
});

test("rejects unknown regions and reports partial writes as incomplete", async () => {
  const f = fixture();
  await assert.rejects(editSceneRegions({ uuid: "Scene.map", update: [{ id: "nope", name: "X" }] }, f.deps), /existing Region/);
  const original = f.scene.updateEmbeddedDocuments;
  f.scene.updateEmbeddedDocuments = async (type, patches) => {
    if (patches[0]._id === "pit") {
      throw new Error("Write failed");
    }
    return original(type, patches);
  };
  const partial = await editSceneRegions({ uuid: "Scene.map", update: [{ id: "plain", name: "Floor" }, { id: "pit", name: "Hole" }] }, f.deps);
  assert.equal(partial.status, "incomplete");
  assert.deepEqual(partial.applied.map(entry => entry.id), ["plain"]);
});

test("rejects concurrent edits and releases the lock after failure", async () => {
  const f = fixture();
  f.deps.confirm = async () => {
    await assert.rejects(editSceneRegions({ uuid: "Scene.map", remove: ["pit"] }, f.deps), /in progress/);
    throw new Error("Review failed");
  };
  await assert.rejects(editSceneRegions({ uuid: "Scene.map", remove: ["pit"] }, f.deps), /Review failed/);
  f.deps.confirm = async () => true;
  assert.equal((await editSceneRegions({ uuid: "Scene.map", remove: ["pit"] }, f.deps)).status, "updated");
});

test("validates fields, geometry, identifiers and destinations", async () => {
  const base = { uuid: "Scene.map", update: [{ id: "platform", name: "Dais" }] };
  for (const patch of [{ flags: {} }, { uuid: "Actor.hero" }, { uuid: "Scene.map.Region.x" }, { update: [], remove: [] },
    { update: [{ id: "platform" }] }, { update: [{ id: "platform", flags: {} }] }, { update: [{ id: "platform", name: "" }] },
    { update: [{ id: "platform", color: "red" }] }, { update: [{ id: "platform", elevation: Infinity }] },
    { update: [{ id: "platform", shapes: [] }] }, { update: [{ id: "platform", shapes: [{ type: "rectangle", x: 0, y: 0, width: 0, height: 1 }] }] },
    { update: [{ id: "platform", shapes: [{ type: "rectangle", x: 0, y: 0, width: 1, height: 1, hole: true }] }] },
    { update: [{ id: "platform", behavior: { script: "alert(1)" } }] }, { update: [{ id: "platform", behavior: { shadowStrength: 6 } }] },
    { update: [{ id: "bad id", name: "X" }] }, { remove: ["platform"] }, { update: Array(101).fill({ id: "a", name: "X" }) }]) {
    assert.throws(() => validateSceneRegionEdit({ ...base, ...patch }), undefined, JSON.stringify(patch));
  }
  const f = fixture();
  f.game.user.isActiveGM = false;
  await assert.rejects(editSceneRegions(base, f.deps), /active GM/);
});

test("reads scene regions with behaviors, elevation, grid and pagination", async () => {
  const f = fixture();
  const deps = { game: { ...f.game, collections: new Map() } };
  const result = await executeRead("get_scene_regions", { uuid: "Scene.map" }, deps);
  assert.equal(result.total, 3);
  assert.equal(result.elevationModuleActive, true);
  assert.deepEqual(result.scene.grid, { size: 100, distance: 5, units: "ft" });
  const platform = result.entries.find(entry => entry.id === "platform");
  assert.equal(platform.elevation, 5);
  assert.equal(platform.uuid, "Scene.map.Region.platform");
  assert.equal(platform.behaviors[0].uuid, "Scene.map.Region.platform.RegionBehavior.elev");
  assert.deepEqual(platform.shapes, [{ type: "rectangle", x: 100, y: 200, width: 300, height: 200 }]);
  assert.equal(result.entries.find(entry => entry.id === "plain").elevation, null);
  const filtered = await executeRead("get_scene_regions", { uuid: "Scene.map", query: "PIT", limit: 1 }, deps);
  assert.deepEqual(filtered.entries.map(entry => entry.id), ["pit"]);
  await assert.rejects(executeRead("get_scene_regions", { uuid: "Actor.hero" }, deps));
  f.scene.testUserPermission = () => false;
  await assert.rejects(executeRead("get_scene_regions", { uuid: "Scene.map" }, deps), /access denied/);
});
