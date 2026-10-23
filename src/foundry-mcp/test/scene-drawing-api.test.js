import test from "node:test";
import assert from "node:assert/strict";
import { addSceneDrawings } from "../scripts/scene-drawing-api.js";
import { validateSceneDrawings } from "../shared/scene-drawing-data.js";
import { MODULE_ID } from "../shared/protocol.js";

/**
 * Model persisted embedded documents, approval and partial Foundry saves.
 */
function fixture() {
  const args = { uuid: "Scene.map", requestId: "rectangles-001", drawings: [
    { x: 100, y: 200, width: 300, height: 200, text: "Difficult terrain", hidden: true },
    { x: 500, y: 200, width: 100, height: 100 }
  ] };
  const scene = { id: "map", uuid: "Scene.map", name: "Battlefield", drawings: new Map(), width: 1000,
    toObject: () => ({ width: scene.width, drawings: Array.from(scene.drawings.values(), entry => entry.toObject(true)) }) };
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" }, scenes: new Map([[scene.id, scene]]) };
  let reviews = 0;
  const deps = { game, confirm: async report => { reviews++; deps.report = report; return true; } };
  const save = async (type, sources) => {
    assert.equal(type, "Drawing");
    return sources.map(source => {
      const id = `drawing${scene.drawings.size}`;
      const data = structuredClone(source);
      const drawing = { id, uuid: `${scene.uuid}.Drawing.${id}`, toObject: () => structuredClone(data),
        getFlag: (module, key) => data.flags?.[module]?.[key] };
      scene.drawings.set(id, drawing);
      return drawing;
    });
  };
  scene.createEmbeddedDocuments = save;
  return { args, deps, game, scene, save, reviews: () => reviews };
}

test("adds native rectangles with text/visibility and defaults, then reuses persisted markers", async () => {
  const f = fixture();
  const result = await addSceneDrawings(f.args, f.deps);
  assert.equal(result.status, "updated");
  assert.equal(result.drawings.length, 2);
  const data = Array.from(f.scene.drawings.values(), drawing => drawing.toObject(true));
  assert.deepEqual(data[0].shape, { type: "r", width: 300, height: 200 });
  assert.equal(data[0].text, "Difficult terrain");
  assert.equal(data[0].hidden, true);
  assert.equal(data[0].author, "gm");
  assert.equal(data[1].hidden, false);
  assert.equal(data[1].text, "");
  assert.equal(data[1].fillAlpha, 0);
  assert.equal(f.deps.report.changes[0].after.hidden, true);
  const retry = await addSceneDrawings({ ...f.args, summary: "Retry the same batch." }, f.deps);
  assert.equal(retry.status, "unchanged");
  assert.equal(retry.reused, true);
  assert.equal(f.reviews(), 1);
  assert.equal(f.scene.drawings.size, 2);
  f.args.drawings[0].text = "Changed";
  await assert.rejects(addSceneDrawings(f.args, f.deps), /different data/);
});

test("cancel, close and expiry save no drawings", async () => {
  for (const approved of [false, undefined]) {
    const f = fixture();
    f.deps.confirm = async () => approved;
    assert.equal((await addSceneDrawings(f.args, f.deps)).status, "cancelled");
    assert.equal(f.scene.drawings.size, 0);
  }
});

test("rejects stale placement, session changes and connection loss during review", async () => {
  for (const mutate of [f => f.scene.width++, f => f.game.user.isActiveGM = false,
    f => f.game.world.id = "other", f => f.game.socket.connected = false,
    f => f.game.scenes.delete("map")]) {
    const f = fixture();
    f.deps.confirm = async () => { mutate(f); return true; };
    await assert.rejects(addSceneDrawings(f.args, f.deps));
    assert.equal(f.scene.drawings.size, 0);
  }
  const f = fixture();
  let disconnected = false;
  f.deps.assertConnection = () => {
    if (disconnected) {
      throw new Error("disconnected");
    }
  };
  f.deps.confirm = async () => { disconnected = true; return true; };
  await assert.rejects(addSceneDrawings(f.args, f.deps), /disconnected/);
  assert.equal(f.scene.drawings.size, 0);
});

test("partial saves return receipts and retry creates only missing rectangles", async () => {
  const f = fixture();
  f.scene.createEmbeddedDocuments = async (type, sources) => {
    await f.save(type, sources.slice(0, 1));
    throw new Error("Partial write");
  };
  const partial = await addSceneDrawings(f.args, f.deps);
  assert.equal(partial.status, "incomplete");
  assert.equal(partial.drawings.length, 1);
  f.scene.createEmbeddedDocuments = f.save;
  assert.equal((await addSceneDrawings(f.args, f.deps)).status, "updated");
  assert.equal(f.scene.drawings.size, 2);
  assert.equal(f.deps.report.changes.length, 1);
});

test("rejects concurrent review and releases the lock after failure", async () => {
  const f = fixture();
  f.deps.confirm = async () => {
    await assert.rejects(addSceneDrawings(f.args, f.deps), /in progress/);
    throw new Error("Review failed");
  };
  await assert.rejects(addSceneDrawings(f.args, f.deps), /Review failed/);
  f.deps.confirm = async () => true;
  assert.equal((await addSceneDrawings(f.args, f.deps)).status, "updated");
});

test("rejects unsupported source fields, invalid geometry, styling and destinations", async () => {
  const f = fixture();
  for (const patch of [{ width: 0 }, { height: -1 }, { x: Infinity }, { x: "1" },
    { flags: {} }, { shape: { type: "e" } }, { hidden: "true" }, { fontSize: 0 },
    { text: "x".repeat(2001) }, { fillAlpha: 2 }, { strokeColor: "red" }, { strokeWidth: -1 }]) {
    assert.throws(() => validateSceneDrawings({ ...f.args, drawings: [{ ...f.args.drawings[0], ...patch }] }));
  }
  for (const patch of [{ uuid: "Compendium.scenes.map" }, { uuid: "Scene.map.Drawing.id" },
    { requestId: "short" }, { drawings: [] }, { drawings: Array(101).fill(f.args.drawings[0]) }, { flags: {} }]) {
    await assert.rejects(addSceneDrawings({ ...f.args, ...patch }, f.deps));
  }
  f.game.user.isActiveGM = false;
  await assert.rejects(addSceneDrawings(f.args, f.deps), /active GM/);
  assert.equal(f.scene.drawings.size, 0);
});

test("detects duplicate saved request markers", async () => {
  const f = fixture();
  await addSceneDrawings(f.args, f.deps);
  const duplicate = f.scene.drawings.values().next().value.toObject(true);
  assert.equal(duplicate.flags[MODULE_ID].sceneDrawingRequest.index, 0);
  await f.save("Drawing", [duplicate]);
  await assert.rejects(addSceneDrawings(f.args, f.deps), /duplicate markers/);
});
