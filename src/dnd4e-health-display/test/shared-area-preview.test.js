import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { automationConfig } from "../scripts/power-activation/rules.js";

const source = readFileSync(new URL("../scripts/power-activation/shared-area-preview.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

/** Simulate a client socket and canvas with deterministic timers, without launching Foundry. */
function fixture() {
	const sent = [];
	const timers = new Map();
	const hooks = new Map();
	const rectangles = [];
	const colors = [];
	let destroyed = 0;
	let now = 0;
	let timerId = 0;
	const users = new Map(["alice", "bob", "carol"].map(id => [id, { id, active: true }]));
	const token = { visible: true, actor: { testUserPermission: user => user.id !== "carol" } };
	const context = vm.createContext({
		automationConfig, MODULE_ID: "dnd4e-health-display", Date: { now: () => now },
		game: { user: users.get("alice"), users, socket: {
			on: (channel, receive) => { context.receive = receive; },
			emit: (channel, message) => sent.push(message),
		} },
		Hooks: { on: (name, callback) => hooks.set(name, callback) },
		window: {
			setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
			clearTimeout: id => timers.delete(id),
			setInterval: callback => { context.tick = callback; },
		},
		canvas: { ready: true, scene: { id: "scene" }, tokens: { get: id => id === "token" ? token : null },
			interface: { addChild: graphic => graphic } },
		PIXI: { Graphics: class {
			clear() { return this; }
			lineStyle(width, color) { colors.push(color); return this; }
			beginFill(color) { colors.push(color); return this; }
			drawRect(...args) { rectangles.push(args); return this; }
			beginHole() { return this; }
			endHole() { return this; }
			endFill() { return this; }
			destroy() { destroyed++; }
		} },
	});
	vm.runInContext(`${source}\nglobalThis.preview = sharedAreaPreview;`, context);
	context.preview.register();
	const bounds = { x: 100, y: 200, w: 300, h: 300 };
	const activation = { source: { id: "token", x: 200, y: 300, w: 100, h: 100 },
		item: { getFlag: () => ({}) }, range: { shape: "closeBurst" }, areaBounds: () => bounds, areaRectangles() { return [this.areaBounds()]; } };
	const message = { type: "areaPreview", userId: "bob", sequence: 1,
		preview: { sourceId: "token", sceneId: "scene", rectangles: [bounds], hole: { x: 200, y: 300, w: 100, h: 100 } } };
	return { context, sent, hooks, timers, users, token, activation, message, rectangles, colors,
		destroyed: () => destroyed, advance: value => { now += value; },
		flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); } };
}

test("broadcasts the latest zone and caster hole with coalesced movement; clear cancels pending updates", () => {
	const f = fixture();
	f.context.preview.show(f.activation);
	f.activation.areaBounds = () => ({ x: 400, y: 200, w: 300, h: 300 });
	f.context.preview.show(f.activation);
	assert.equal(f.timers.size, 1);
	f.flush();
	assert.equal(f.sent.length, 1);
	assert.equal(f.sent[0].preview.rectangles[0].x, 400);
	assert.equal(f.sent[0].preview.hole.w, 100);
	assert.equal("targets" in f.sent[0].preview, false);
	f.context.preview.show(f.activation);
	f.context.preview.clear();
	f.flush();
	assert.equal(f.sent.length, 2);
	assert.equal(f.sent[1].preview, null);
});

test("remote clients draw the shared zone and hole, ignore stale updates and clear on completion", () => {
	const f = fixture();
	f.context.receive(f.message);
	assert.deepEqual(f.rectangles, [[100, 200, 300, 300], [200, 300, 100, 100]]);
	f.context.receive(f.message);
	assert.equal(f.rectangles.length, 2);
	f.context.receive({ ...f.message, sequence: 2, preview: null });
	assert.equal(f.context.preview.remote.size, 0);
	assert.equal(f.destroyed(), 1);
});

test("shared zones use the aiming user's colour rather than the viewing user's colour", () => {
	const f = fixture();
	f.users.get("alice").color = "#FF0000";
	f.users.get("bob").color = "#00AAFF";
	f.context.receive(f.message);
	assert.deepEqual(f.colors, [0x00aaff, 0x00aaff]);
});

test("rejects other scenes, unavailable sources, unauthorized users and malformed geometry", () => {
	for (const change of [
		f => { f.message.preview.sceneId = "other"; },
		f => { f.token.visible = false; },
		f => { f.message.userId = "carol"; },
		f => { f.message.preview.rectangles[0].w = Infinity; },
		f => { f.message.preview.hole.h = -1; },
		f => { f.users.get("bob").active = false; },
	]) {
		const f = fixture();
		change(f);
		f.context.receive(f.message);
		assert.equal(f.rectangles.length, 0);
	}
});

test("heartbeats resend active previews for joining clients and remove expired or disconnected previews", () => {
	const f = fixture();
	f.context.preview.show(f.activation);
	f.flush();
	f.context.tick();
	assert.equal(f.sent.length, 2);
	f.context.receive(f.message);
	f.advance(6000);
	f.context.tick();
	assert.equal(f.context.preview.remote.size, 0);
	f.context.receive({ ...f.message, sequence: 2 });
	f.users.get("bob").active = false;
	f.context.tick();
	assert.equal(f.context.preview.remote.size, 0);
});

test("canvas teardown clears both local broadcasts and all remote graphics", () => {
	const f = fixture();
	f.context.preview.show(f.activation);
	f.flush();
	f.context.receive(f.message);
	f.hooks.get("canvasTearDown")();
	assert.equal(f.sent.at(-1).preview, null);
	assert.equal(f.context.preview.remote.size, 0);
	assert.equal(f.destroyed(), 1);
});

test("shared close burst hole follows the alternate origin rather than the caster", () => {
	const f = fixture();
	f.activation.caster = { id: "caster", x: 0, y: 0, w: 100, h: 100 };
	f.context.preview.show(f.activation);
	f.flush();
	assert.equal(f.sent[0].preview.hole.x, f.activation.source.x);
	assert.equal(f.sent[0].preview.hole.y, f.activation.source.y);
	assert.equal(f.sent[0].preview.sourceId, "caster", "socket authorization remains tied to the power owner");
});
