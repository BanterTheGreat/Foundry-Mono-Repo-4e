import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { registerHealthDisplay } from "../scripts/health-display/health-display.js";

const RING_ID = "dnd4e-token-ring-display";
const OLD_PANEL_ID = "dnd4e-token-hover-display";
const RING_TEMPLATE = "modules/dnd4e-health-display/scripts/health-display/token-ring.hbs";

test("the hover display keeps health and name without a circle around the token", () => {
	const template = readFileSync(new URL("../scripts/health-display/token-ring.hbs", import.meta.url), "utf8");
	assert.doesNotMatch(template, /<circle\b|dnd4e-token-ring__hover-ring/);
	assert.match(template, /dnd4e-token-ring__gems/);
	assert.match(template, /dnd4e-token-ring__name/);
});

/** A bare element: just the properties and queries the display code touches. */
function element(id = "") {
	const classes = new Set();
	return {
		id,
		hidden: false,
		style: {},
		innerHTML: "",
		parts: {},
		classes,
		classList: {
			add: (...names) => names.forEach((name) => classes.add(name)),
			toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
			contains: (name) => classes.has(name),
		},
		setAttribute() {},
		querySelector(selector) {
			return this.parts[selector] ?? null;
		},
	};
}

const nodes = new Map();
const hooks = new Map();
const frames = [];
let renderCalls = [];
let renderImpl = async (path) => `<${path}>`;
let zoom = 1;
let pan = { x: 0, y: 0 };
let innerWidth = 1600;

const adopt = (node) => {
	if (node.id) {
		nodes.set(node.id, node);
	}
};
globalThis.document = {
	getElementById: (id) => nodes.get(id) ?? null,
	createElement: () => element(),
	head: { append: adopt },
	body: { append: adopt },
};
globalThis.window = { addEventListener() {}, get innerWidth() { return innerWidth; }, innerHeight: 900 };
globalThis.requestAnimationFrame = (callback) => frames.push(callback);
globalThis.PIXI = { Point: class { constructor(x, y) { Object.assign(this, { x, y }); } } };
globalThis.fromUuidSync = () => null;
globalThis.Hooks = { on: (name, handler) => hooks.set(name, [...(hooks.get(name) ?? []), handler]) };
globalThis.foundry = { applications: { handlebars: { renderTemplate: (path, data) => { renderCalls.push({ path, data }); return renderImpl(path, data); } } } };
globalThis.game = {
	combat: null,
	modules: { get: () => ({ version: "1.0" }) },
};
globalThis.canvas = {
	ready: true,
	app: {
		view: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) },
		renderer: { screen: { width: 1000, height: 800 } },
	},
};

const fire = (name, ...args) => hooks.get(name)?.forEach((handler) => handler(...args));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const runFrames = async () => {
	while (frames.length) {
		frames.shift()();
	}
	await settle();
};

/** A 100px token at canvas (500, 300) whose screen position follows the test's pan and zoom. */
function tokenWith(id, effects = []) {
	const actor = {
		id: `actor-${id}`,
		type: "NPC",
		name: `Token ${id}`,
		system: { attributes: { hp: { value: 30, max: 70 } }, details: { role: { secondary: "elite" } } },
		effects,
	};
	const token = {
		id,
		actor,
		document: { id },
		w: 100,
		h: 100,
		toGlobal: (point) => new PIXI.Point((point.x + 500) * zoom + pan.x, (point.y + 300) * zoom + pan.y),
	};
	for (const effect of effects) {
		effect.parent = actor;
	}
	return token;
}

const effect = (name, extra = {}) => ({
	name, img: `${name}.png`, description: "", statuses: new Set(), isTemporary: true, disabled: false, isSuppressed: false, system: {}, ...extra,
});

const ringCalls = () => renderCalls.filter((call) => call.path === RING_TEMPLATE);

test.before(() => {
	registerHealthDisplay();
});

test.beforeEach(async () => {
	fire("canvasTearDown");
	renderCalls = [];
	renderImpl = async (path) => `<${path}>`;
	zoom = 1;
	pan = { x: 0, y: 0 };
	innerWidth = 1600;
	frames.length = 0;
	nodes.delete(RING_ID);
	await settle();
});

test("hovering shows the ring and never mounts the old panel above the map", async () => {
	const token = tokenWith("a", [effect("Dazed", { statuses: new Set(["dazed"]), system: { durationType: "saveEnd" } })]);
	fire("hoverToken", token, true);
	await settle();
	assert.equal(ringCalls().length, 1);
	assert.equal(nodes.get(OLD_PANEL_ID), undefined, "no top-centre panel is mounted");
	const root = nodes.get(RING_ID);
	assert.equal(root.hidden, false);
	assert.equal(root.innerHTML, `<${RING_TEMPLATE}>`);
	const data = ringCalls()[0].data;
	assert.equal(data.name, "Token a");
	assert.equal(data.role.key, "elite");
	assert.equal(data.effects[0].title, "Dazed");
	assert.equal(data.effects[0].endingLabel, "Save");
	assert.equal(data.size, 100, "the ring takes the token's on-screen size");
	assert.equal(data.animate, undefined);
	assert.equal(data.turnDistance, undefined);
});

test("the ring frame is centred on the token", async () => {
	fire("hoverToken", tokenWith("a"), true);
	await settle();
	const root = nodes.get(RING_ID);
	const { outer } = ringCalls()[0].data;
	assert.equal(root.style.left, `${550 - outer / 2}px`);
	assert.equal(root.style.top, `${350 - outer / 2}px`);
});

test("the effect strip and its stub are placed beside the ring, flipping near the screen edge", async () => {
	const root = element(RING_ID);
	root.hidden = true;
	root.parts[".dnd4e-token-ring__strip"] = Object.assign(element(), { offsetWidth: 260, offsetHeight: 100 });
	root.parts[".dnd4e-token-ring__stub"] = element();
	nodes.set(RING_ID, root);
	fire("hoverToken", tokenWith("a", [effect("Dazed")]), true);
	await settle();
	const strip = root.parts[".dnd4e-token-ring__strip"];
	assert.equal(strip.classList.contains("is-flipped"), false);
	assert.ok(parseFloat(strip.style.left) > ringCalls()[0].data.centre, "to the right of the ring centre");
	assert.equal(root.parts[".dnd4e-token-ring__stub"].style.width, "16px");

	innerWidth = 700;
	fire("hoverToken", tokenWith("b", [effect("Dazed")]), true);
	await settle();
	assert.equal(strip.classList.contains("is-flipped"), true, "no room on the right, so the strip moves left");
	assert.ok(parseFloat(strip.style.left) < 0);
});

test("the name tag is outlined from its measured rows and raised so the gems sit on the token's rim", async () => {
	const root = element(RING_ID);
	root.hidden = true;
	const part = (sizes) => Object.assign(element(), sizes);
	const tag = part({ offsetWidth: 130 });
	const gems = part({ offsetWidth: 90, offsetHeight: 24, offsetLeft: 20 });
	const row = part({ offsetHeight: 28 });
	const shape = Object.assign(element(), { attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } });
	Object.assign(root.parts, {
		".dnd4e-token-ring__tag": tag,
		".dnd4e-token-ring__gems": gems,
		".dnd4e-token-ring__namerow": row,
		".dnd4e-token-ring__tag-shape": shape,
	});
	nodes.set(RING_ID, root);
	fire("hoverToken", tokenWith("a"), true);
	await settle();
	const { tagTop } = ringCalls()[0].data;
	assert.equal(row.style.minWidth, "114px", "the name row stays wider than the gem row so the step shows");
	assert.match(shape.innerHTML, /^<path d="M20 9A9 9 0 0 1 29 0H101/);
	assert.deepEqual([shape.attrs.width, shape.attrs.height], [130, 52]);
	assert.equal(tag.style.top, `${tagTop - 24 * 0.78}px`, "the gem row rises into the token's lower rim");
});

test("leaving the token hides the ring, and leaving a different token does not", async () => {
	const a = tokenWith("a");
	fire("hoverToken", a, true);
	await settle();
	fire("hoverToken", tokenWith("other"), false);
	assert.equal(nodes.get(RING_ID).hidden, false, "another token's leave event is ignored");
	fire("hoverToken", a, false);
	assert.equal(nodes.get(RING_ID).hidden, true);
});

test("a slow render for a token that has since lost the pointer never reappears", async () => {
	const pending = [];
	renderImpl = (path, data) => new Promise((resolve) => pending.push(() => resolve(`<ring ${data.name}>`)));
	const a = tokenWith("a");
	const b = tokenWith("b");
	fire("hoverToken", a, true);
	fire("hoverToken", b, true);
	await settle();
	pending[1]();
	await settle();
	pending[0]();
	await settle();
	assert.equal(nodes.get(RING_ID).innerHTML, "<ring Token b>", "the older render is discarded");
	fire("hoverToken", b, false);
	await settle();
	assert.equal(nodes.get(RING_ID).hidden, true);
});

test("panning moves the ring without rendering again; zooming redraws it at the new size", async () => {
	fire("hoverToken", tokenWith("a"), true);
	await settle();
	const root = nodes.get(RING_ID);
	const before = parseFloat(root.style.left);

	pan = { x: 40, y: 0 };
	fire("canvasPan");
	fire("canvasPan");
	assert.equal(frames.length, 1, "pan events within one frame are coalesced");
	await runFrames();
	assert.equal(ringCalls().length, 1, "no re-render for a pure pan");
	assert.equal(parseFloat(root.style.left), before + 40);

	zoom = 2;
	fire("canvasPan");
	await runFrames();
	assert.equal(ringCalls().length, 2, "zoom changes the ring size, so it renders again");
	assert.equal(ringCalls()[1].data.size, 200);
});

test("movement refreshes of the hovered token reposition the ring", async () => {
	fire("hoverToken", tokenWith("a"), true);
	await settle();
	fire("refreshToken", {});
	assert.equal(frames.length, 1);
	await runFrames();
	assert.equal(ringCalls().length, 1, "a pure movement refresh does not render again");
});

test("with nothing hovered, pan and movement events schedule no ring work", () => {
	fire("canvasPan");
	fire("refreshToken", {});
	assert.equal(frames.length, 0);
});

test("a token the canvas cannot measure hides the ring instead of throwing", async () => {
	canvas.ready = false;
	try {
		fire("hoverToken", tokenWith("a"), true);
		await settle();
		assert.equal(ringCalls().length, 0);
		assert.ok(!nodes.get(RING_ID) || nodes.get(RING_ID).hidden);
	} finally {
		canvas.ready = true;
	}
});
