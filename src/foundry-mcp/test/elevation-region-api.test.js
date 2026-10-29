import test from "node:test";
import assert from "node:assert/strict";
import { addElevationRegions } from "../scripts/elevation-region-api.js";
import { validateElevationRegions } from "../shared/elevation-region-data.js";
import { MODULE_ID } from "../shared/protocol.js";

/**
 * Model persisted embedded documents, approval and partial Foundry saves.
 */
function fixture() {
  globalThis.CONFIG = { RegionBehavior: { dataModels: { "scene-elevation-region.elevation": class {} } } };
  const args = { uuid: "Scene.map", requestId: "elevation-001", regions: [
    { name: "Platform", elevation: 5, shapes: [{ type: "rectangle", x: 100, y: 200, width: 300, height: 200 }] },
    { name: "Pit", elevation: -5, shapes: [{ type: "ellipse", x: 500, y: 200, radiusX: 100, radiusY: 100 }] }
  ] };
  const scene = { id: "map", uuid: "Scene.map", name: "Battlefield", regions: new Map(), width: 1000,
    toObject: () => ({ width: scene.width, regions: Array.from(scene.regions.values(), entry => entry.toObject(true)) }) };
  const game = { version: "14.360", modules: new Map([["scene-elevation-region", { active: true }]]), ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" }, scenes: new Map([[scene.id, scene]]) };
  let reviews = 0;
  const deps = { game, confirm: async report => { reviews++; deps.report = report; return true; } };
  const save = async (type, sources) => {
    assert.equal(type, "Region");
    for (const source of sources) {
      assert.equal(typeof source.visibility, "number", "Region visibility must be a number");
      assert.equal(source.visibility, 1, "Region outlines must be GM-only");
    }
    return sources.map(source => {
      const id = `region${scene.regions.size}`;
      const data = structuredClone(source);
      const region = { id, uuid: `${scene.uuid}.Region.${id}`, toObject: () => structuredClone(data),
        getFlag: (module, key) => data.flags?.[module]?.[key] };
      scene.regions.set(id, region);
      return region;
    });
  };
  scene.createEmbeddedDocuments = save;
  return { args, deps, game, scene, save, reviews: () => reviews };
}

test("adds native rectangles with text/visibility and defaults, then reuses persisted markers", async () => {
  const f = fixture();
  const result = await addElevationRegions(f.args, f.deps);
  assert.equal(result.status, "updated");
  assert.equal(result.regions.length, 2);
  const data = Array.from(f.scene.regions.values(), region => region.toObject(true));
  assert.equal(data[0].behaviors[0].type, "scene-elevation-region.elevation");
  assert.equal(data[0].behaviors[0].system.elevation, 5);
  assert.equal(data[1].behaviors[0].system.elevation, -5);
  assert.equal(data[1].behaviors[0].system.modifyTokenElevation, true);
  assert.deepEqual(data[0].shapes, f.args.regions[0].shapes);
  assert.equal(data[0].ownership.default, 0);
  const retry = await addElevationRegions({ ...f.args, summary: "Retry the same batch." }, f.deps);
  assert.equal(retry.status, "unchanged");
  assert.equal(retry.reused, true);
  assert.equal(f.reviews(), 1);
  assert.equal(f.scene.regions.size, 2);
  f.args.regions[0].name = "Changed";
  await assert.rejects(addElevationRegions(f.args, f.deps), /different data/);
});

test("cancel, close and expiry save no regions", async () => {
  for (const approved of [false, undefined]) {
    const f = fixture();
    f.deps.confirm = async () => approved;
    assert.equal((await addElevationRegions(f.args, f.deps)).status, "cancelled");
    assert.equal(f.scene.regions.size, 0);
  }
});

test("rejects stale placement, session changes and connection loss during review", async () => {
  for (const mutate of [f => f.scene.width++, f => f.game.user.isActiveGM = false,
    f => f.game.world.id = "other", f => f.game.socket.connected = false,
    f => f.game.scenes.delete("map")]) {
    const f = fixture();
    f.deps.confirm = async () => { mutate(f); return true; };
    await assert.rejects(addElevationRegions(f.args, f.deps));
    assert.equal(f.scene.regions.size, 0);
  }
  const f = fixture();
  let disconnected = false;
  f.deps.assertConnection = () => {
    if (disconnected) {
      throw new Error("disconnected");
    }
  };
  f.deps.confirm = async () => { disconnected = true; return true; };
  await assert.rejects(addElevationRegions(f.args, f.deps), /disconnected/);
  assert.equal(f.scene.regions.size, 0);
});

test("partial saves return receipts and retry creates only missing rectangles", async () => {
  const f = fixture();
  f.scene.createEmbeddedDocuments = async (type, sources) => {
    await f.save(type, sources.slice(0, 1));
    throw new Error("Partial write");
  };
  const partial = await addElevationRegions(f.args, f.deps);
  assert.equal(partial.status, "incomplete");
  assert.equal(partial.regions.length, 1);
  f.scene.createEmbeddedDocuments = f.save;
  assert.equal((await addElevationRegions(f.args, f.deps)).status, "updated");
  assert.equal(f.scene.regions.size, 2);
  assert.equal(f.deps.report.changes.length, 1);
});

test("rejects concurrent review and releases the lock after failure", async () => {
  const f = fixture();
  f.deps.confirm = async () => {
    await assert.rejects(addElevationRegions(f.args, f.deps), /in progress/);
    throw new Error("Review failed");
  };
  await assert.rejects(addElevationRegions(f.args, f.deps), /Review failed/);
  f.deps.confirm = async () => true;
  assert.equal((await addElevationRegions(f.args, f.deps)).status, "updated");
});

test("rejects unsupported source fields, invalid geometry, styling and destinations", async () => {
  const f = fixture();
  for (const patch of [{ flags: {} }, { elevation: Infinity }, { name: "" }, { behavior: { script: "alert(1)" } },
    { behavior: { shadowStrength: 6 } }, { shapes: [{ type: "rectangle", x: 0, y: 0, width: 0, height: 10 }] },
    { shapes: [{ type: "polygon", points: [0, 0, 1, 1, 2, 2] }] }]) {
    assert.throws(() => validateElevationRegions({ ...f.args, regions: [{ ...f.args.regions[0], ...patch }] }));
  }
  for (const patch of [{ uuid: "Compendium.scenes.map" }, { uuid: "Scene.map.Region.id" },
    { requestId: "short" }, { regions: [] }, { regions: Array(101).fill(f.args.regions[0]) }, { flags: {} }]) {
    await assert.rejects(addElevationRegions({ ...f.args, ...patch }, f.deps));
  }
  f.game.user.isActiveGM = false;
  await assert.rejects(addElevationRegions(f.args, f.deps), /active GM/);
  assert.equal(f.scene.regions.size, 0);
});

test("detects duplicate saved request markers", async () => {
  const f = fixture();
  await addElevationRegions(f.args, f.deps);
  const duplicate = f.scene.regions.values().next().value.toObject(true);
  assert.equal(duplicate.flags[MODULE_ID].elevationRegionRequest.index, 0);
  await f.save("Region", [duplicate]);
  await assert.rejects(addElevationRegions(f.args, f.deps), /duplicate markers/);
});

test("requires active module, registered behavior and Foundry v14", async () => {
  for (const mutate of [f => f.game.version = "13.350", f => f.game.modules.clear(),
    () => globalThis.CONFIG.RegionBehavior.dataModels = {}]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(addElevationRegions(f.args, f.deps), /require Foundry/);
    assert.equal(f.scene.regions.size, 0);
  }
});
