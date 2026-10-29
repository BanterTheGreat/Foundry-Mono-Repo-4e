import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../scripts/power-activation/damage-application.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const MODULE_ID = "dnd4e-health-display";

/** Exercise the real application lifecycle against mocked DOM and canvas boundaries. */
function fixture() {
	const hooks = new Map();
	const messages = [];
	const applied = [];
	const outlines = [];
	const notifications = [];
	const rows = [];
	class App {
		constructor() { this.renders = 0; this.element = { querySelectorAll: () => rows }; }
		render() { this.renders++; return this; }
		_onRender() {}
		setPosition() {}
		async close() { this.closed = true; }
	}
	class Graphics {
		constructor() { outlines.push(this); }
		lineStyle() { return this; }
		drawRoundedRect(...args) { this.rectangle = args; return this; }
		destroy() { this.destroyed = true; }
	}
	const context = vm.createContext({ MODULE_ID, SETTING: "enabled", console,
		foundry: { applications: { api: { ApplicationV2: App, HandlebarsApplicationMixin: base => base } } },
		game: { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: { get: () => true },
			messages: { contents: messages, get: id => id === "chat" ? message : undefined }, scenes: new Map([["scene", { name: "Battle" }]]) },
		Hooks: { on: (name, fn) => { const listeners = hooks.get(name) ?? []; listeners.push(fn); hooks.set(name, listeners); } },
		PIXI: { Graphics }, canvas: { scene: { id: "scene" }, tokens: { get: id => id === "one" ? { id, x: 100, y: 200, w: 100, h: 100 } : null, addChild() {} } },
		ui: { notifications: { error: message => notifications.push(message) } },
		damageApplicationTargets: message => message.targets ?? [],
		prepareDamageTarget: async (message, target) => ({ ...target, amount: 10 }),
		applyTargetDamage: async (message, id) => {
			applied.push(id);
			message.flags[MODULE_ID].damageApplications ??= {};
			message.flags[MODULE_ID].damageApplications[id] = { state: "applied" };
		},
	});
	vm.runInContext(`${source}\nglobalThis.api = { DamageApplicationPanel, registerDamageApplication, openDamageApplication, panels };`, context);
	const message = { id: "chat", author: { name: "Player" }, targets: [{ tokenId: "one" }, { tokenId: "two" }],
		flags: { [MODULE_ID]: { damageApplication: { sceneId: "scene", name: "Power", actorName: "PC" } } },
		async update(change) {
			this.flags[MODULE_ID].damageApplication.dismissed = change[`flags.${MODULE_ID}.damageApplication.dismissed`];
		} };
	const panel = new context.api.DamageApplicationPanel(message);
	return { context, panel, message, hooks, applied, outlines, notifications, rows };
}

test("confirmation opens only on the elected GM, once, and reopening retains receipts", async () => {
	const f = fixture();
	f.context.api.registerDamageApplication();
	const create = f.hooks.get("createChatMessage")[0];
	f.context.game.user.isGM = false;
	create(f.message);
	assert.equal(f.context.api.panels.size, 0);
	f.context.game.user.isGM = true;
	f.context.game.users.activeGM.id = "other";
	create(f.message);
	assert.equal(f.context.api.panels.size, 0);
	f.context.game.users.activeGM.id = "gm";
	create(f.message);
	const opened = f.context.api.panels.get("chat");
	assert.equal(opened.renders, 1);
	await opened.close();
	create(f.message);
	assert.equal(f.context.api.panels.size, 0);
	f.context.api.openDamageApplication(f.message);
	assert.equal(f.context.api.panels.size, 1);
});

test("Apply All excludes applied tokens and repeated clicks while processing", async () => {
	const f = fixture();
	f.message.flags[MODULE_ID].damageApplications = { one: { state: "applied" } };
	const pending = f.panel.applyDamage();
	await f.panel.applyDamage();
	await pending;
	assert.deepEqual(f.applied, ["two"]);
	assert.equal(f.panel.applying, false);
});

test("row and nested Apply-button focus draw token outline and leave or close removes it", async () => {
	const f = fixture();
	const events = {};
	const button = {};
	f.rows.push({ dataset: { damageToken: "one" }, addEventListener: (event, fn) => { events[event] = fn; }, contains: target => target === button });
	f.panel._onRender({}, {});
	events.pointerenter();
	assert.deepEqual(Array.from(f.outlines[0].rectangle), [97, 197, 106, 106, 6]);
	events.focusout({ relatedTarget: button });
	assert.equal(f.outlines[0].destroyed, undefined);
	events.pointerleave();
	assert.equal(f.outlines[0].destroyed, true);
	events.focusin();
	await f.panel.close();
	assert.equal(f.outlines[1].destroyed, true);
	assert.equal(f.panel.highlightedId, null);
});

test("highlight never crosses scenes and the ledger stays ten percent narrower", () => {
	const f = fixture();
	f.context.canvas.scene.id = "other";
	f.panel.highlightToken("one");
	assert.equal(f.outlines.length, 0);
	assert.equal(f.context.api.DamageApplicationPanel.DEFAULT_OPTIONS.position.width, 576);
});
