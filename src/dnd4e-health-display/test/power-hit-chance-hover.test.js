import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { formatPowerHitChances } from "../scripts/actor-display/npc-power-hints.js";

const source = readFileSync(new URL("../scripts/actor-display/power-hit-chance-hover.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

/** Observable interface layer, text placement and lifecycle without Foundry. */
function fixture() {
	const hooks = new Map();
	let id = 0;
	class Container {
		children = [];
		addChild(...children) { this.children.push(...children); return children[0]; }
		destroy() { this.destroyed = true; }
	}
	class Graphics {
		beginFill() {}
		drawRoundedRect() {}
		endFill() {}
	}
	class Text {
		constructor(text) {
			this.text = text;
			this.width = 100;
			this.height = 20;
			this.scale = { set: value => { this.zoom = value; this.height = 20 * value; this.width = 100 * value; } };
			this.anchor = { set() {} };
			this.position = { set: (x, y) => { this.x = x; this.y = y; } };
		}
	}
	const actor = {};
	const caster = { id: "npc", actor };
	const target = { id: "pc", name: "Mira", visible: true, x: 100, y: 200, w: 100, h: 100,
		actor: { type: "Player Character", system: { defences: { ac: { value: 20 }, ref: { value: 20 } } } } };
	const item = { type: "power", actor, isOwner: true, hasAttack: true, system: { attack: { def: "ref" } },
		getAttackBonus: async () => 10 };
	actor.items = new Map([["power", item]]);
	const tokens = new Map([[caster.id, caster], [target.id, target]]);
	tokens.controlled = [];
	tokens.zIndex = 100;
	tokens.placeables = [caster, target];
	const layer = new Container();
	const canvas = { ready: true, tokens, stage: { scale: { x: 1 } }, interface: layer };
	const game = { user: { targets: new Set([target]) } };
	const context = vm.createContext({ canvas, game, formatPowerHitChances,
		PIXI: { Container, Graphics }, foundry: { canvas: { containers: { PreciseText: Text } } },
		Hooks: { on: (name, callback) => { hooks.set(++id, { name, callback }); return id; }, off: (_name, id) => hooks.delete(id) },
	});
	vm.runInContext(`${source}\nglobalThis.api = { preview, bindPowerHitChanceHover };`, context);
	return { ...context.api, caster, actor, item, target, canvas, game, layer, hooks,
		fire: name => [...hooks.values()].filter(h => h.name === name).forEach(h => h.callback()) };
}

test("hit chance labels sit inside the bottom edge of PC tokens in the interface layer and track movement/zoom", async () => {
	const f = fixture();
	await f.preview.show(f.item, f.caster);
	const overlay = f.preview.overlay;
	assert.ok(f.layer.children.includes(overlay));
	assert.ok(overlay.zIndex > f.canvas.tokens.zIndex, "hit chance overlay must sort above the token layer");
	assert.equal(overlay.eventMode, "none");
	const label = overlay.children[1];
	assert.equal(label.text, "55% to hit");
	assert.equal(label.x, 150);
	assert.equal(label.y, 275);
	f.target.y = 400;
	f.canvas.stage.scale.x = 2;
	f.fire("canvasPan");
	assert.equal(overlay.destroyed, true);
	assert.equal(f.preview.overlay.children[1].y, 487.5);
	assert.equal(f.preview.overlay.children[1].zoom, 0.5);
	f.preview.clear();
	assert.equal(f.hooks.size, 0);
});

test("selection updates include targeted, highlighted and hovered PCs once, including AC", async () => {
	const f = fixture();
	f.item.system.attack.def = "ac";
	f.canvas.tokens.controlled.push(f.target);
	f.target.hover = true;
	await f.preview.show(f.item, f.caster);
	assert.equal(f.preview.overlay.children.length, 2);
	f.game.user.targets.clear();
	f.canvas.tokens.controlled = [];
	f.target.hover = false;
	f.fire("targetToken");
	assert.equal(f.preview.overlay, null);
	f.target.hover = true;
	f.fire("hoverToken");
	assert.equal(f.preview.overlay.children[1].text, "55% to hit");
	f.target.visible = false;
	f.fire("sightRefresh");
	assert.equal(f.preview.overlay, null);
});

test("invalid attacks, removed tokens, bad bonuses and activation suppress labels", async () => {
	for (const modify of [f => { f.item.hasAttack = false; }, f => { f.item.system.attack.def = "unknown"; },
		f => { f.canvas.tokens.delete(f.target.id); }, f => { f.target.actor.system.defences.ref.value = null; },
		f => { f.item.getAttackBonus = async () => NaN; }, f => { f.item.getAttackBonus = async () => { throw new Error(); }; }]) {
		const f = fixture();
		modify(f);
		await f.preview.show(f.item, f.caster);
		assert.equal(f.preview.overlay, null);
		f.preview.clear();
	}
	const f = fixture();
	await f.preview.show(f.item, f.caster, () => true);
	assert.equal(f.preview.overlay, null);
});

test("leaving or tearing down the scene cannot resurrect a pending hit chance", async () => {
	for (const teardown of [false, true]) {
		const f = fixture();
		let resolve;
		f.item.getAttackBonus = () => new Promise(done => { resolve = done; });
		const showing = f.preview.show(f.item, f.caster);
		if (teardown) {
			f.fire("canvasTearDown");
		} else {
			f.preview.clear();
		}
		resolve(10);
		await showing;
		assert.equal(f.preview.overlay, null);
		assert.equal(f.hooks.size, 0);
	}
});

test("whole-row hover/focus shows labels and cleanup removes listeners", async () => {
	const f = fixture();
	const handlers = new Map();
	const row = { dataset: { itemId: "power" }, contains: element => element === row,
		addEventListener: (name, callback) => handlers.set(name, callback), removeEventListener: name => handlers.delete(name) };
	const dispose = f.bindPowerHitChanceHover({ querySelectorAll: () => [row] }, f.actor, f.caster, () => false);
	handlers.get("mouseenter")();
	await new Promise(resolve => setImmediate(resolve));
	assert.ok(f.preview.overlay);
	handlers.get("focusout")({ relatedTarget: row });
	assert.ok(f.preview.overlay);
	handlers.get("mouseleave")({ relatedTarget: null });
	assert.equal(f.preview.overlay, null);
	dispose();
	assert.equal(handlers.size, 0);
	assert.equal(f.hooks.size, 0);
});
