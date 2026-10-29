import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import * as geometry from "../../src/dnd4e-health-display/scripts/power-activation/area-geometry.js";
import * as rules from "../../src/dnd4e-health-display/scripts/power-activation/rules.js";
import { ActivationWorkflow } from "../../src/dnd4e-health-display/scripts/power-activation/workflow.js";

const cells = coordinates => coordinates.map(([x, y]) => ({ x: x * 100, y: y * 100 }));

test("wall rules allow bends and loops but reject diagonal joins, branching and overlength", () => {
  for (const coordinates of [[[0, 0]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [0, 1]]]) {
    assert.deepEqual(geometry.wallGeometryProblems(cells(coordinates), 8, 100), []);
  }
  for (const coordinates of [[[0, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 0]]]) {
    assert.ok(geometry.wallGeometryProblems(cells(coordinates), 8, 100).length);
  }
  assert.ok(geometry.wallGeometryProblems(cells([[0, 0], [1, 0]]), 1, 100).length);
  assert.ok(geometry.wallGeometryProblems([], 8, 100).length);
});

/** Exercise the real session methods without launching Foundry or running its hooks. */
function sessionFixture(config = {}) {
  const code = readFileSync(new URL("../../src/dnd4e-health-display/scripts/power-activation/power-activation.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  const context = vm.createContext({ ...geometry, ...rules, ActivationWorkflow, AbortController,
    foundry: { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base } }, utils: { randomID: () => "session" } },
    game: { user: { id: "user", targets: [], isGM: true, color: "#ffffff" } },
    canvas: { grid: { size: 100 }, dimensions: { sceneRect: { x: 0, y: 0, width: 2000, height: 2000 } }, tokens: { placeables: [] } },
    CONST: { REGION_VISIBILITY: { ALWAYS: 2 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } },
  });
  vm.runInContext(code + "\nglobalThis.Session = ActivationSession;", context);
  const item = { name: "Wall", hasAttack: false, getFlag: () => ({ enabled: true, placeRegion: true, ...config }) };
  const source = { id: "caster", x: 0, y: 0, w: 100, h: 100, document: { elevation: 0 } };
  const session = new context.Session(item, source, { shape: "wall", area: 8, maximum: 10 }, "", 1);
  session.syncTargets = () => {};
  session.refresh = () => {};
  return { session, context };
}

test("wall selection uses actual squares and deduplicates large creatures", () => {
  const { session, context } = sessionFixture();
  session.wallCells = cells([[2, 2], [3, 2], [3, 3]]);
  const target = (id, x, y, w = 100) => ({ id, x, y, w, h: 100, actor: {}, visible: true, document: { elevation: 0 } });
  const large = target("large", 200, 200, 200);
  context.canvas.tokens.placeables = [large, target("inside-bend", 200, 300)];
  session.selectAreaTargets();
  assert.equal(session.targets.length, 1);
  assert.equal(session.targets[0], large);

  session.targets = [];
  assert.equal(session.areaProblems().length, 0, "an effect-only wall needs no immediate attack target");
});

test("drawing validates every square, occupancy and updated power limits", () => {
  const { session, context } = sessionFixture({ wallSolid: true });
  session.wallHover = { x: 1000, y: 0 };
  session.addWallSquare();
  assert.equal(session.wallCells.length, 1);
  session.wallHover = { x: 1100, y: 0 };
  session.addWallSquare();
  assert.equal(session.wallCells.length, 1, "second square is beyond range although origin is in range");
  context.canvas.tokens.placeables = [{ x: 1000, y: 0, w: 100, h: 100, visible: true, document: { elevation: 0 } }];
  assert.ok(session.wallProblems().some(problem => problem.includes("unoccupied")));
  context.canvas.tokens.placeables = [];
  session.range.maximum = 9;
  assert.ok(session.wallProblems().length);
  session.editWall();
  assert.equal(session.wallCells.length, 0);
  assert.equal(session.origin, undefined);
});

test("confirmation persistence creates one multi-shape Region and retains wall settings once", async () => {
  const { session, context } = sessionFixture({ wallSolid: true, wallHeight: 6 });
  session.wallCells = cells([[2, 2], [3, 2], [3, 3]]);
  session.origin = session.wallCells[0];
  let calls = 0;
  context.canvas.scene = { async createEmbeddedDocuments(type, documents) {
    calls++;
    assert.equal(type, "Region");
    assert.equal(documents.length, 1);
    assert.equal(documents[0].shapes.length, 3);
    assert.equal(documents[0].shapes[2].x, 300);
    assert.equal(documents[0].flags[rules.MODULE_ID].wall.heightSquares, 6);
    assert.equal(documents[0].flags[rules.MODULE_ID].wall.solid, true);
    return [{}];
  } };
  await session.placeAreaRegion();
  await session.placeAreaRegion();
  assert.equal(calls, 1);
});

test("canvas clicks and drags append squares without locking or double-appending", () => {
  const { session, context } = sessionFixture();
  const listeners = new Map();
  context.PIXI = { Point: class { constructor(x, y) { Object.assign(this, { x, y }); } } };
  context.canvas.app = { view: {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (name, callback) => listeners.set(name, callback),
  } };
  context.canvas.stage = { toLocal: point => point };
  session.drawRange = () => {};
  session.installPlacement();
  const fire = (name, x, y, buttons = 1) => listeners.get(name)({
    clientX: x, clientY: y, button: 0, buttons, preventDefault() {}, stopImmediatePropagation() {},
  });
  fire("pointerdown", 210, 210);
  fire("pointermove", 310, 210);
  fire("pointerup", 310, 210, 0);
  fire("click", 310, 210, 0);
  assert.equal(session.wallCells.length, 2);
  assert.equal(session.placementLocked, false);
  fire("pointerdown", 410, 310);
  assert.equal(session.wallCells.length, 2, "diagonal-only contact is rejected");
  session.editWall(true);
  assert.equal(session.wallCells.length, 0);
});

test("shared previews preserve wall squares and burst holes, then clear on cancellation", () => {
  const code = readFileSync(new URL("../../src/dnd4e-health-display/scripts/power-activation/shared-area-preview.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  const drawn = [];
  const broadcasts = [];
  class Graphics {
    clear() { drawn.length = 0; return this; }
    lineStyle() { return this; }
    beginFill() { return this; }
    endFill() { return this; }
    beginHole() { drawn.push("hole"); return this; }
    endHole() { return this; }
    drawRect(...args) { drawn.push(args); return this; }
    destroy() { this.destroyed = true; }
  }
  const source = { id: "caster", visible: true, actor: { testUserPermission: () => true } };
  const context = vm.createContext({ automationConfig: rules.automationConfig, MODULE_ID: rules.MODULE_ID, PIXI: { Graphics },
    window: { setTimeout: () => 1, clearTimeout() {} },
    game: { user: { id: "local" }, users: { get: () => ({ active: true, color: "#ffffff" }) }, socket: { emit: (...args) => broadcasts.push(args) } },
    canvas: { ready: true, scene: { id: "scene" }, tokens: { get: () => source }, interface: { addChild: graphics => graphics } },
  });
  vm.runInContext(code + "\nglobalThis.Preview = SharedAreaPreview;", context);
  const preview = new context.Preview();
  const rectangles = cells([[2, 2], [3, 2], [3, 3]]).map(cell => ({ ...cell, w: 100, h: 100 }));
  preview.show({ source, range: { shape: "wall" }, areaRectangles: () => rectangles });
  preview.receive({ type: "areaPreview", userId: "remote", sequence: 1, preview: preview.local });
  assert.equal(drawn.length, 3);
  preview.show({ item: { getFlag: () => ({}) }, source: { ...source, x: 100, y: 100, w: 100, h: 100 }, range: { shape: "closeBurst" }, areaRectangles: () => [{ x: 0, y: 0, w: 300, h: 300 }] });
  preview.receive({ type: "areaPreview", userId: "remote", sequence: 2, preview: preview.local });
  assert.equal(drawn[1], "hole");
  const graphics = preview.remote.get("remote").graphics;
  preview.receive({ type: "areaPreview", userId: "remote", sequence: 3, preview: null });
  assert.equal(graphics.destroyed, true);
  preview.clear();
  assert.equal(broadcasts.at(-1)[1].preview, null);
});
