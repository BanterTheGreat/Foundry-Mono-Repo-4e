import assert from "node:assert/strict";
import test from "node:test";
import { AttackResults, messageAttackResults, placeAttackBadge } from "../scripts/power-activation/attack-results.js";
import { MODULE_ID } from "../scripts/power-activation/rules.js";

/** Model the persisted 0.9.3 chat message, including its per-client visibility. */
function message(outcome = "hit") {
	return {
		id: "attack-message",
		visible: true, isContentVisible: true,
		flags: { [MODULE_ID]: { attackResults: { sessionId: "activation", sceneId: "scene", targetIds: ["wolf"] } } },
		rolls: [{ total: 24, options: { multirollData: { targetID: "wolf", hitstate: outcome, critstate: "normal" } } }],
	};
}

test("uses stored token IDs and authoritative outcomes, including critical overrides", () => {
	for (const [outcome, label] of [["hit", "HIT"], ["miss", "MISS"], ["critical", "CRIT"], ["fumble", "CRIT FAIL"], ["immune", "IMMUNE"]]) {
		const chat = message("miss");
		chat.rolls[0].options.multirollData.critstate = outcome;
		assert.deepEqual(messageAttackResults(chat, "scene"), [{ tokenId: "wolf", total: 24, outcome, label }]);
	}
	const chat = message("");
	assert.equal(messageAttackResults(chat, "scene")[0].label, "ATTACK");
	chat.rolls.push({ total: 16, options: { multirollData: { targetID: "other", hitstate: "miss" } } });
	assert.equal(messageAttackResults(chat, "scene").length, 1);
});

test("waits for the matching Dice So Nice message and discards waits across scene teardown", async t => {
	for (const key of ["game", "canvas"]) {
		const previous = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, { value: {}, configurable: true, writable: true });
		t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
	}
	globalThis.canvas = { ready: true, scene: { id: "scene" } };
	const display = new AttackResults();
	const shown = [];
	display.show = chat => shown.push(chat.id);
	let finish;
	let waitedId;
	globalThis.game = { dice3d: { waitFor3DAnimationByMessageID(id) {
		waitedId = id;
		return new Promise(resolve => { finish = resolve; });
	} } };
	const pending = display.showAfterAnimation(message());
	assert.equal(waitedId, "attack-message");
	assert.deepEqual(shown, []);
	finish();
	await pending;
	assert.deepEqual(shown, ["attack-message"]);
	const abandoned = display.showAfterAnimation(message());
	display.clear();
	finish();
	await abandoned;
	assert.equal(shown.length, 1);
	// Without DSN the result appears synchronously, with no animation delay.
	globalThis.game = {};
	const immediate = display.showAfterAnimation(message());
	assert.equal(shown.length, 2);
	await immediate;
	// Disabled/skipped animation is represented by an immediately resolved wait.
	globalThis.game = { dice3d: { waitFor3DAnimationByMessageID: async () => {} } };
	await display.showAfterAnimation(message());
	assert.equal(shown.length, 3);
	globalThis.game.dice3d.waitFor3DAnimationByMessageID = () => assert.fail("Private rolls must not wait");
	await display.showAfterAnimation({ ...message(), isContentVisible: false });
	assert.equal(shown.length, 3);
	// A broken optional integration must not suppress otherwise visible results.
	t.mock.method(console, "warn", () => {});
	globalThis.game.dice3d.waitFor3DAnimationByMessageID = async () => { throw new Error("DSN failed"); };
	await display.showAfterAnimation(message());
	assert.equal(shown.length, 4);
});

test("ignores private results, other scenes, ordinary rolls and invalid totals", () => {
	for (const mutate of [
		chat => { chat.visible = false; },
		chat => { chat.isContentVisible = false; },
		chat => { chat.flags = {}; },
		chat => { chat.flags[MODULE_ID].attackResults.sceneId = "other"; },
		chat => { chat.rolls[0].total = NaN; },
		chat => { chat.rolls[0].options = { hitTypeDamage: true }; },
	]) {
		const chat = message();
		mutate(chat);
		assert.deepEqual(messageAttackResults(chat, "scene"), []);
	}
});

test("moves the lower wolf's badge clear of its neighbour and retains the pointer", () => {
	const position = placeAttackBadge({ x: 365, y: 324 }, 120, 36,
		[{ left: 403, top: 246, right: 483, bottom: 326 }], { width: 1120 });
	assert.ok(position.right <= 397);
	assert.equal(position.left + position.pointer, 365);
	assert.equal(position.bottom, 312);
	const edge = placeAttackBadge({ x: 5, y: 20 }, 120, 36, [], { width: 400 });
	assert.equal(edge.left, 6);
	assert.equal(edge.top, 6);
});

test("badges follow movement, replace earlier rolls, expire, and clear on scene teardown", t => {
	const elements = [];
	const frames = new Map();
	const hooks = new Map();
	let frameId = 0;
	const token = { name: "Wolf", isVisible: true, w: 80, h: 80, x: 300, y: 300,
		toGlobal: point => ({ x: token.x + point.x, y: token.y + point.y }) };
	const element = () => ({
		style: { setProperty() {} }, offsetWidth: 100, offsetHeight: 36, children: [],
		setAttribute() {}, append(child) { this.children.push(child); }, remove() { this.removed = true; },
	});
	for (const [key, value] of Object.entries({
		document: { createElement: element, body: { append: el => elements.push(el) } },
		window: { innerWidth: 1000 },
		PIXI: { Point: class { constructor(x, y) { Object.assign(this, { x, y }); } } },
		Hooks: { on: (name, fn) => hooks.set(name, fn) },
		canvas: { ready: true, scene: { id: "scene" }, tokens: { get: id => id === "wolf" ? token : null, placeables: [token] },
			app: { view: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) },
				renderer: { screen: { width: 1000, height: 800 } } } },
		requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
		cancelAnimationFrame: id => frames.delete(id),
	})) {
		const previous = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
		t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
	}
	const tick = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
	const display = new AttackResults();
	display.register();
	hooks.get("createChatMessage")(message());
	assert.equal(elements.length, 1);
	assert.equal(elements[0].children[0].textContent, "24");
	assert.equal(elements[0].children[1].textContent, "HIT");
	const left = parseFloat(elements[0].style.left);
	token.x += 50;
	tick();
	assert.equal(parseFloat(elements[0].style.left), left + 50);
	hooks.get("createChatMessage")(message("critical"));
	assert.equal(elements[0].removed, true);
	assert.equal(display.entries.size, 1);
	display.entries.get("wolf").expires = 0;
	tick();
	assert.equal(display.entries.size, 0);
	assert.equal(frames.size, 0);
	hooks.get("createChatMessage")(message());
	token.isVisible = false;
	tick();
	assert.equal(display.entries.size, 0);
	token.isVisible = true;
	const privateChat = message();
	hooks.get("createChatMessage")(privateChat);
	privateChat.isContentVisible = false;
	tick();
	assert.equal(display.entries.size, 0);
	hooks.get("createChatMessage")(message());
	hooks.get("canvasTearDown")();
	assert.equal(display.entries.size, 0);
	assert.equal(frames.size, 0);
	assert.ok(elements.every(el => el.removed));
});
