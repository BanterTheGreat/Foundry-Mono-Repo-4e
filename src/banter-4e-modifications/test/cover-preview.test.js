import test from "node:test";
import assert from "node:assert/strict";
import { CoverPreview } from "../scripts/modules/cover-preview/cover-preview.js";

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
  width = 120;
  height = 20;
  anchor = { set() {} };
  position = { set: (x, y) => { this.x = x; this.y = y; } };
  constructor(text) {
    super();
    this.text = text;
  }
}

/** Construct a visible, same-elevation token with an integer square footprint. */
function token(x, disposition) {
  return {
    x, y: 0, w: 100, h: 100, visible: true, actor: {}, isOwner: true,
    document: { elevation: 0, disposition },
  };
}

test("cover setting registers before a user exists and enables listeners only for a ready GM", () => {
  let setting;
  let ready;
  let listeners = 0;
  globalThis.game = {
    user: null,
    settings: { register: (module, key, options) => { setting = options; } },
  };
  globalThis.Hooks = {
    once: (hook, callback) => { assert.equal(hook, "ready"); ready = callback; },
    on: () => { listeners++; },
  };
  globalThis.window = { addEventListener: () => { listeners++; } };
  CoverPreview.register();
  assert.equal(setting.name, "Enable cover preview (PoC)");
  assert.equal(setting.config, true);
  assert.equal(setting.restricted, true);
  assert.equal(listeners, 0);
  game.user = { isGM: false };
  ready();
  assert.equal(listeners, 0);
  game.user = { isGM: true };
  ready();
  assert.ok(listeners > 0);
});

test("cover preview follows targets, walls, visibility, settings and scene teardown", context => {
  const hooks = new Map();
  const frames = new Map();
  const events = new Map();
  let nextFrame = 0;
  let enabled = true;
  let setting;
  const attacker = token(0, 1);
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
    user: { id: "me", isGM: true, targets: new Set([target]) },
    settings: { register: (module, key, options) => { setting = options; }, get: () => enabled },
  };
  globalThis.canvas = {
    ready: true, scene: { grid: { type: 1 } }, dimensions: { size: 100 },
    interface: new Container(),
    tokens: { controlled: [attacker], placeables: [attacker, target] },
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
  hooks.get("ready")();
  assert.equal(setting.default, false);
  CoverPreview.refresh();
  assert.deepEqual(labels(), ["Clear"]);
  assert.equal(rays().length, 0);
  const label = overlay().children.find(child => child instanceof Text);
  assert.equal(label.x, target.x + target.w / 2);
  assert.ok(label.y + label.height < target.y);
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
  game.user.isGM = false;
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  game.user.isGM = true;

  const diagnostics = [];
  context.mock.method(console, "info", message => diagnostics.push(message));
  game.settings.settings = new Map([["banter-4e-modifications.enable-debug-logging", {}]]);
  CoverPreview.refresh();
  assert.equal(diagnostics.length, 1);
  const detail = JSON.parse(diagnostics[0].slice(diagnostics[0].indexOf("{")));
  assert.equal(detail.melee.kind, "cover");
  assert.deepEqual(detail.melee.rays.find(ray => ray.blocked).walls[0].c, wall.document.c);
  CoverPreview.refresh();
  assert.equal(diagnostics.length, 1);
  game.settings.settings.clear();

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
  assert.deepEqual(labels(), ["Melee: Clear\nRanged: Cover −2"]);
  assert.equal(rays().length, 4);
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
  assert.equal(rays().length, 0);
  target.document.elevation = 0;

  target.visible = false;
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  target.visible = true;
  canvas.tokens.controlled.push(target);
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  canvas.tokens.controlled = [attacker];
  game.user.targets.clear();
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  game.user.targets.add(target);

  hooks.get("targetToken")({ id: "someone-else" });
  assert.equal(frames.size, 0);
  hooks.get("targetToken")(game.user);
  hooks.get("updateWall")();
  assert.equal(frames.size, 1);
  flushFrames();
  assert.deepEqual(labels(), ["Clear"]);
  enabled = false;
  CoverPreview.refresh();
  assert.equal(canvas.interface.children.length, 0);
  enabled = true;
  CoverPreview.refresh();
  CoverPreview.scheduleRefresh();
  hooks.get("canvasTearDown")();
  assert.equal(canvas.interface.children.length, 0);
  assert.equal(frames.size, 0);
});
