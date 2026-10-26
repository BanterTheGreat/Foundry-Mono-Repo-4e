import test from "node:test";
import assert from "node:assert/strict";
import { CoverPreview } from "../scripts/power-activation/cover-preview.js";

/** Small renderer double: captures rendered labels, ray colors, and disposal. */
class Container {
  children = [];
  destroyed = false;
  addChild(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  removeChild(child) {
    this.children = this.children.filter(entry => entry !== child);
  }
  destroy() {
    this.destroyed = true;
  }
}

class Graphics extends Container {
  lineStyle(width, color) { this.color = color; }
  moveTo() {}
  lineTo() { this.isRay = true; }
  beginFill() {}
  drawRoundedRect() {}
  endFill() {}
}

class Text extends Container {
  scale = { x: 1, set(value) { this.x = value; } };
  get width() { return 120 * this.scale.x; }
  get height() { return this.style.fontSize * this.scale.x; }
  anchor = { set() {} };
  position = { set: (x, y) => { this.x = x; this.y = y; } };
  constructor(text, style) {
    super();
    this.text = text;
    this.style = style;
  }
}

/** Construct a visible, same-elevation token with an integer square footprint. */
function token(x, disposition) {
  return {
    x, y: 0, w: 100, h: 100, visible: true, actor: {}, isOwner: true,
    document: { elevation: 0, disposition },
  };
}

test("integrated cover follows targets, hover, walls, visibility and scene teardown", () => {
  const hooks = new Map();
  const frames = new Map();
  const events = new Map();
  let nextFrame = 0;
  const attacker = token(0, 1);
  attacker.id = "attacker";
  const target = token(300, -1);
  const wall = { document: { c: [200, -100, 200, 60], move: 1, ds: 0 } };
  globalThis.CONST = { GRID_TYPES: { SQUARE: 1 }, WALL_MOVEMENT_TYPES: { NONE: 0 }, WALL_DOOR_STATES: { OPEN: 1 } };
  globalThis.PIXI = { Container, Graphics };
  globalThis.foundry = { canvas: { containers: { PreciseText: Text } } };
  globalThis.Hooks = {
    on: (hook, callback) => hooks.set(hook, callback),
    once: (hook, callback) => hooks.set(hook, callback),
  };
  globalThis.window = { addEventListener: (event, callback) => events.set(event, callback) };
  globalThis.requestAnimationFrame = callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.game = {
    user: { id: "me", isGM: false, targets: new Set([target]) },
    
  };
  globalThis.canvas = {
    ready: true, scene: { grid: { type: 1 } }, dimensions: { size: 100 },
    interface: new Container(),
    stage: { scale: { x: 1 } },
    tokens: { controlled: [attacker], placeables: [attacker, target], get: id => id === "attacker" ? attacker : target },
    walls: { placeables: [] },
  };
  const overlay = () => canvas.interface.children[0];
  const labels = () => overlay().children.filter(child => child instanceof Text).map(child => child.text);
  const rays = () => overlay().children.filter(child => child.isRay);
  const flushFrames = () => {
    for (const [id, callback] of frames) {
      frames.delete(id);
      callback();
    }
  };

  CoverPreview.register();
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  const targeting = { source: attacker, targets: [target], mode: "ranged" };
  CoverPreview.setContext(targeting);
  flushFrames();
  assert.deepEqual(labels(), ["Clear"]);
  assert.equal(rays().length, 0);
  const label = overlay().children.find(child => child instanceof Text);
  assert.equal(label.x, target.x + target.w / 2);
  assert.ok(label.y + label.height < target.y);
  for (const zoom of [0.25, 0.5, 2, 3]) {
    canvas.stage.scale.x = zoom;
    hooks.get("canvasPan")();
    flushFrames();
    const zoomedLabel = overlay().children.find(child => child instanceof Text);
    assert.equal(zoomedLabel.height * zoom, 16);
    assert.equal(zoomedLabel.x, target.x + target.w / 2);
    assert.ok(Math.abs((target.y - zoomedLabel.y - zoomedLabel.height) * zoom - 8) < 0.000001);
  }
  canvas.stage.scale.x = 1;
  hooks.get("canvasPan")();
  flushFrames();
  const old = overlay();

  canvas.walls.placeables = [wall];
  CoverPreview.refresh();
  assert.equal(old.destroyed, true);
  assert.deepEqual(labels(), ["Cover −2"]);
  assert.equal(rays().length, 0);
  events.get("keydown")({ key: "Shift", shiftKey: true });
  flushFrames();
  assert.equal(rays().length, 4);
  assert.ok(rays().some(ray => ray.color === 0xef6666));
  assert.ok(rays().some(ray => ray.color === 0x74dba3));
  events.get("keyup")({ key: "Shift", shiftKey: false });
  flushFrames();
  assert.deepEqual(labels(), ["Cover −2"]);
  assert.equal(rays().length, 0);
  events.get("keydown")({ key: "Shift", shiftKey: true });
  flushFrames();
  events.get("blur")();
  flushFrames();
  assert.equal(rays().length, 0);
  events.get("keydown")({ key: "Shift", shiftKey: true });
  flushFrames();
  wall.document.ds = 1;
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Clear"]);
  assert.equal(rays().length, 0);
  wall.document.ds = 0;
  wall.document.move = 0;
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Clear"]);

  const enemy = token(150, -1);
  enemy.y = -50;
  canvas.tokens.placeables.push(enemy);
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Cover −2"]);
  assert.equal(rays().length, 4);
  targeting.mode = "melee";
  CoverPreview.setContext(targeting);
  flushFrames();
  assert.deepEqual(labels(), ["Clear"]);
  assert.equal(rays().length, 0);
  targeting.mode = "ranged";
  enemy.document.disposition = 1;
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Clear"]);
  enemy.document.disposition = -1;
  enemy.visible = false;
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Clear"]);

  target.document.elevation = 10;
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Cover: elevation unsupported"]);
  assert.equal(CoverPreview.evaluate(attacker, target, targeting.mode), null);
  assert.equal(CoverPreview.evaluate(attacker, target, "area"), null);
  assert.equal(rays().length, 0);
  target.document.elevation = 0;

  target.visible = false;
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  target.visible = true;
  canvas.tokens.controlled.push(target);
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Clear"]);
  canvas.tokens.controlled = [attacker];
  targeting.targets = [];
  game.user.targets.clear();
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  // Hover previews unselected enemies without changing the session's targets.
  hooks.get("hoverToken")(target, true);
  flushFrames();
  assert.deepEqual(labels(), ["Clear"]);
  assert.deepEqual(targeting.targets, []);
  assert.equal(game.user.targets.size, 0);
  targeting.mode = "melee";
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Clear"]);
  targeting.mode = "ranged";
  target.visible = false;
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  target.visible = true;
  target.document.disposition = 1;
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  target.document.disposition = 0;
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  target.document.disposition = -1;
  hooks.get("hoverToken")(target, false);
  flushFrames();
  assert.equal(canvas.interface.children.length, 0);
  hooks.get("hoverToken")(target, true);
  flushFrames();
  CoverPreview.setContext(null);
  flushFrames();
  assert.equal(canvas.interface.children.length, 0);
  hooks.get("hoverToken")(target, false);
  assert.equal(frames.size, 0);
  CoverPreview.setContext(targeting);
  flushFrames();
  game.user.targets.add(target);
  targeting.targets = [target];

  // Token hover can also republish the targeting context before the next frame.
  // Keep the current label visible until its replacement is ready.
  CoverPreview.refresh();
  const stableOverlay = overlay();
  hooks.get("hoverToken")(target, true);
  CoverPreview.setContext({ ...targeting });
  assert.equal(stableOverlay.destroyed, false);
  assert.equal(overlay(), stableOverlay);
  flushFrames();
  hooks.get("hoverToken")(target, false);
  CoverPreview.setContext({ ...targeting });
  assert.equal(canvas.interface.children.length, 1);
  flushFrames();
  // Selected and hovered versions of the same enemy produce only one label.
  hooks.get("hoverToken")(target, true);
  flushFrames();
  assert.deepEqual(labels(), ["Clear"]);
  hooks.get("hoverToken")(target, false);
  flushFrames();
  assert.deepEqual(labels(), ["Clear"]);
  hooks.get("targetToken")({ id: "someone-else" });
  assert.equal(frames.size, 0);
  hooks.get("targetToken")(game.user);
  hooks.get("updateWall")();
  assert.equal(frames.size, 1);
  flushFrames();
  assert.deepEqual(labels(), ["Clear"]);
  CoverPreview.setContext(null);
  assert.equal(canvas.interface.children.length, 0);
  flushFrames();
  assert.equal(canvas.interface.children.length, 0);
  CoverPreview.setContext(targeting);
  flushFrames();
  CoverPreview.scheduleRefresh();
  hooks.get("canvasTearDown")();
  assert.equal(canvas.interface.children.length, 0);
  assert.equal(frames.size, 0);
});
