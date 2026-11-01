import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as data from "../scripts/compact-tracker/compact-tracker-data.js";
import { TurnTimer, PauseRegistry } from "../scripts/compact-tracker/turn-timer.js";
import { getSpecialRole } from "../scripts/health-display/token-hover-display-data.js";

const source = readFileSync(new URL("../scripts/compact-tracker/compact-tracker.js", import.meta.url), "utf8")
	.replace(/^import [\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "");

/** A tiny stand-in for the few DOM operations the tracker uses. */
function node(selectors = {}, extra = {}) {
	const self = { dataset: {}, classes: new Set(), inserted: [], listeners: {}, textContent: "", selectors, removed: false, ...extra };
	self.classList = {
		add: (...names) => names.forEach(name => self.classes.add(name)),
		remove: (...names) => names.forEach(name => self.classes.delete(name)),
		toggle: (name, on) => (on ? self.classes.add(name) : self.classes.delete(name)),
		contains: name => self.classes.has(name),
	};
	self.querySelector = selector => self.selectors[selector]?.[0] ?? null;
	self.querySelectorAll = selector => self.selectors[selector] ?? [];
	self.insertAdjacentHTML = (where, html) => self.inserted.push({ where, html });
	self.addEventListener = (name, handler) => { self.listeners[name] = handler; };
	self.remove = () => { self.removed = true; };
	return self;
}

const actorOf = (type, hp, max, role = {}) => ({ type, system: { attributes: { hp: { value: hp, max } }, details: { role } },
	testUserPermission: (user, level) => user.owner === level });

/** A started three-combatant encounter: a player, an elite leader enemy and a minion. */
function encounter({ started = true, round = 2, briefing = "Ambush at Gnoll Ford", acting = "hero" } = {}) {
	const make = (id, name, initiative, actor, extra = {}) => ({ id, name, initiative, actor, visible: true,
		permission: 3, token: { uuid: `Scene.s.Token.${id}`, disposition: 1 }, ...extra });
	const turns = [
		make("hero", "Kessa", 21.1, actorOf("Player Character", 38, 44)),
		make("boss", "Huntmaster", 17.5, actorOf("NPC", 30, 70, { secondary: "elite", leader: true }), { token: { uuid: "Scene.s.Token.boss", disposition: -1 }, permission: 0 }),
		make("pup", "Hyena", 6.2, actorOf("NPC", 1, 1, { secondary: "minion" }), { token: { uuid: "Scene.s.Token.pup", disposition: -1 }, permission: 0 }),
	];
	const updates = [];
	const combat = { id: "combat", started, round, turn: 0, turns, combatant: turns.find(entry => entry.id === acting),
		combatants: { get: id => turns.find(entry => entry.id === id) },
		getFlag: (module, key) => (module === data_MODULE && key === "presentation" && briefing ? { title: briefing } : undefined),
		updateEmbeddedDocuments: async (...args) => { updates.push(args); } };
	return { combat, turns, updates };
}
const data_MODULE = "dnd4e-health-display";

/** One rendered tracker as the native template produces it, enough for every selector the tracker uses. */
function trackerDom(combat) {
	const rows = combat.turns.map(entry => {
		const span = node({}, { textContent: String(entry.initiative.toFixed(2)) });
		const initiative = node({ ".token-initiative > span": [span] });
		const name = node();
		return node({ ".token-name": [name], ".token-initiative": [initiative], ".token-initiative > span": [span] },
			{ dataset: { combatantId: entry.id }, name, initiative, span, getBoundingClientRect: () => ({ top: 0, height: 20 }) });
	});
	const controls = node();
	const list = node({ "li.combatant": rows }, { scrollTop: 100, getBoundingClientRect: () => ({ top: 0, bottom: 200 }) });
	list.querySelectorAll = selector => selector === "li.combatant" ? rows
		: selector === ".drop-before,.drop-after" ? rows.filter(row => row.classes.has("drop-before") || row.classes.has("drop-after"))
		: selector === ".is-dragging" ? rows.filter(row => row.classes.has("is-dragging")) : [];
	const status = node({}, { textContent: combat.started ? `Round ${combat.round}` : "Not started" });
	const encounterControls = node();
	const header = node({ ".encounter-controls": [encounterControls], ".encounter-title": [status], "[data-compact-title]": [] });
	const element = node({ ".combat-tracker-header": [header], "li.combatant[data-combatant-id]": rows,
		".combat-controls": [controls], "ol.combat-tracker": [list], "[data-compact-info]": [] });
	return { element, rows, controls, list, status, header, encounterControls };
}

function harness({ enabled = true, isGM = true, userId = isGM ? "gm" : "player", users = {} } = {}) {
	const hooks = new Map();
	const sockets = [];
	const emitted = [];
	const timers = [];
	let setting = enabled;
	let now = () => 1_000_000;
	const game = {
		user: { id: userId, isGM }, i18n: { localize: key => key },
		settings: { get: (module, key) => (key === "compactTracker" ? setting : undefined), register() {} },
		socket: { on: (channel, handler) => sockets.push([channel, handler]), emit: (...args) => emitted.push(args) },
		users: { get: id => users[id] }, combat: null,
	};
	const context = vm.createContext({
		...data, TurnTimer, PauseRegistry, getSpecialRole, game, console, Date: { now: () => now() },
		CONST: { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } },
		ui: { combat: { viewed: null, render() {} }, notifications: { error() {} } },
		document: { querySelectorAll: () => [] },
		foundry: { utils: { debounce: fn => fn, hasProperty: (object, path) => path.split(".").reduce((value, part) => value?.[part], object) !== undefined } },
		Hooks: { on(name, callback) { const list = hooks.get(name) ?? []; list.push(callback); hooks.set(name, list); } },
		fromUuidSync: uuid => context.tokens?.[uuid], tokens: {},
		setInterval: callback => { timers.push(callback); return timers.length; }, requestAnimationFrame: callback => callback(),
	});
	vm.runInContext(source + "\nglobalThis.api = { registerCompactTracker, reorderCombatant, tickTimer };", context);
	context.api.registerCompactTracker();
	return { context, game, hooks, sockets, emitted, timers, setEnabled: value => { setting = value; }, setClock: fn => { now = fn; },
		fire: (name, ...args) => (hooks.get(name) ?? []).forEach(callback => callback(...args)),
		render(combat, dom) { this.fire("renderCombatTracker", { viewed: combat }, dom.element); } };
}

test("with the setting off the tracker is left exactly as Foundry rendered it", () => {
	const h = harness({ enabled: false });
	const { combat } = encounter();
	const dom = trackerDom(combat);
	dom.element.classList.add("dnd4e-compact-tracker", "is-started");
	h.render(combat, dom);
	assert.equal(dom.element.classes.size, 0, "stale compact classes are removed");
	assert.equal(dom.header.inserted.length, 0);
	assert.equal(dom.controls.inserted.length, 0);
	assert.equal(dom.rows.every(row => row.name.inserted.length === 0 && row.initiative.inserted.length === 0), true);
});

for (const enabled of [true, false]) {
	test(`Mark as Defeated is ${enabled ? "removed from compact" : "retained in native"} tracker rows`, () => {
		const h = harness({ enabled });
		const { combat } = encounter();
		const dom = trackerDom(combat);
		const buttons = dom.rows.map(row => {
			const button = node();
			row.selectors['[data-action="toggleDefeated"]'] = [button];
			return button;
		});
		h.render(combat, dom);
		assert.ok(buttons.every(button => button.removed === enabled));
	});
}

test("turning the setting off removes the markup, subtitle suffix and attributes a previous render left behind", () => {
	const h = harness({ enabled: false });
	const { combat } = encounter();
	const dom = trackerDom(combat);
	const removable = ["[data-compact-title]", "[data-compact-role]", "[data-compact-hp]", "[data-compact-grip]", "[data-compact-info]"].map(selector => {
		const leftover = node();
		dom.element.selectors[selector] = [leftover];
		return leftover;
	});
	dom.element.selectors[".combat-tracker-header .encounter-title"] = [dom.status];
	dom.status.textContent = "Round 2 · Turn 3 of 3";
	dom.rows[0].draggable = true;
	dom.rows[0].dataset.team = "pc";
	const editable = node({}, { value: "9.03" });
	dom.element.selectors["[data-compact-initiative]"] = [editable];
	h.render(combat, dom);
	assert.equal(removable.every(leftover => leftover.removed), true);
	assert.equal(dom.status.textContent, "Round 2");
	assert.equal(dom.rows[0].draggable, false);
	assert.equal(dom.rows[0].dataset.team, undefined);
	assert.equal(editable.outerHTML, "<span>9.03</span>", "our initiative input goes back to plain text");
});

test("after a render during a drag the dragged row is dimmed again", () => {
	const h = harness();
	const { combat } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	dom.rows.forEach((row, i) => { row.getBoundingClientRect = () => ({ top: i * 30, height: 20 }); });
	const rebuilt = node();
	dom.element.listeners.dragstart({ target: { closest: () => dom.rows[1] }, preventDefault() {}, dataTransfer: { setData() {} } });
	dom.element.selectors['li.combatant[data-combatant-id="boss"]'] = [rebuilt];
	h.render(combat, dom);
	assert.equal(rebuilt.classes.has("is-dragging"), true);
});

test("the Battle Briefing title is inserted above the round tracker, which gains the turn", () => {
	const h = harness();
	const { combat } = encounter({ acting: "boss" });
	const dom = trackerDom(combat);
	h.render(combat, dom);
	assert.deepEqual(dom.encounterControls.inserted.map(entry => entry.where), ["beforebegin"]);
	assert.match(dom.encounterControls.inserted[0].html, /Ambush at Gnoll Ford/);
	assert.equal(dom.status.textContent, "Round 2 · Turn 2 of 3");
});

test("without a Battle Briefing no title is added", () => {
	const h = harness();
	const { combat } = encounter({ briefing: "" });
	const dom = trackerDom(combat);
	h.render(combat, dom);
	assert.equal(dom.encounterControls.inserted.length, 0);
	assert.equal(dom.status.textContent, "Round 2 · Turn 1 of 3");
});

test("rows get a role icon before the name and HP numbers before the initiative", () => {
	const h = harness();
	const { combat } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const [hero, boss, pup] = dom.rows;
	assert.match(hero.name.inserted[0].html, /data-compact-role[^>]*aria-hidden/, "no role: empty aligned slot");
	assert.match(boss.name.inserted[0].html, /is-leader/, "elite leader shows the leader star");
	assert.match(pup.name.inserted[0].html, /chess-pawn/);
	assert.equal(boss.name.inserted[0].where, "beforebegin");
	assert.match(hero.initiative.inserted[0].html, /is-green[\s\S]*<b>38<\/b>\/44/);
	assert.match(boss.initiative.inserted[0].html, /is-orange[\s\S]*<b>30<\/b>\/70/, "a GM sees every combatant's HP");
	assert.match(pup.initiative.inserted[0].html, /is-green/);
	assert.deepEqual(dom.rows.map(row => row.dataset.team), ["pc", "enemy", "enemy"]);
	assert.match(hero.name.inserted[0].html, /^<span class="dnd4e-compact-tracker__grip"/, "GM rows get a drag grip before the role slot");
});

test("a player sees HP only for combatants they can observe, and gets no drag handles or timer", () => {
	const h = harness({ isGM: false });
	const { combat } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const [hero, boss] = dom.rows;
	assert.match(hero.initiative.inserted[0].html, /data-compact-hp/);
	assert.equal(boss.initiative.inserted.length, 0, "enemy HP stays hidden without observer permission");
	assert.equal(dom.rows.some(row => row.draggable), false);
	assert.equal(dom.element.classes.has("is-draggable"), false);
	assert.doesNotMatch(hero.name.inserted[0].html, /grip/, "no drag grip for players");
	assert.match(dom.controls.inserted[0].html, /Next player/);
	assert.doesNotMatch(dom.controls.inserted[0].html, /data-compact-timer/);
});

test("combatants hidden from a player are neither listed in the turn count nor in next player", () => {
	const h = harness({ isGM: false });
	const { combat, turns } = encounter({ acting: "hero" });
	turns[1].visible = false;
	const dom = trackerDom(combat);
	h.render(combat, dom);
	assert.equal(dom.status.textContent, "Round 2 · Turn 1 of 2");
});

test("GMs get draggable rows once combat has started, plus the next-player line and turn timer", () => {
	const h = harness();
	const { combat } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	assert.equal(dom.rows.every(row => row.draggable === true), true);
	assert.equal(dom.element.classes.has("is-draggable"), true);
	assert.equal(dom.element.classes.has("is-started"), true);
	const footer = dom.controls.inserted[0].html;
	assert.match(footer, /Next player: <strong>Kessa<\/strong>/, "only one player, so the count wraps to themselves");
	assert.match(footer, /data-compact-timer/);
	assert.match(footer, /0:00/);
});

test("before combat rows are not draggable, the first player is named and decimal initiative becomes editable", () => {
	const h = harness();
	const { combat } = encounter({ started: false, round: 0, acting: "hero" });
	combat.combatant = null;
	const dom = trackerDom(combat);
	h.render(combat, dom);
	assert.equal(dom.rows.some(row => row.draggable), false);
	assert.equal(dom.element.classes.has("is-started"), false);
	assert.match(dom.controls.inserted[0].html, /First player: <strong>Kessa<\/strong>/);
	assert.doesNotMatch(dom.controls.inserted[0].html, /data-compact-timer/, "the timer starts with combat");
	assert.match(dom.rows[0].span.outerHTML, /class="initiative-input" data-compact-initiative[^>]*value="21.10"/);
	assert.equal(dom.status.textContent, "Not started");
});

test("a player cannot edit initiative before combat", () => {
	const h = harness({ isGM: false });
	const { combat } = encounter({ started: false, round: 0 });
	const dom = trackerDom(combat);
	h.render(combat, dom);
	assert.equal(dom.rows[0].span.outerHTML, undefined);
});

test("rendering twice never leaves duplicate markup behind", () => {
	const h = harness();
	const { combat } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	h.render(combat, dom);
	assert.equal(dom.element.classes.size, 3);
	assert.equal(dom.element.listeners.dragstart !== undefined, true);
	const listener = dom.element.listeners.dragstart;
	h.render(combat, dom);
	assert.equal(dom.element.listeners.dragstart, listener, "drag handlers are bound once, to the root element that outlives renders");
});

test("dragging a row then dropping it reorders through a single combatant update", async () => {
	const h = harness();
	const { combat, updates } = encounter({ acting: "boss" });
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const prevented = [];
	const event = props => ({ preventDefault: () => prevented.push(true), dataTransfer: { setData() {} }, ...props });
	const dragged = dom.rows[0];
	dom.rows.forEach((row, i) => { row.getBoundingClientRect = () => ({ top: i * 30, height: 20 }); });
	dom.element.listeners.dragstart(event({ target: { closest: () => dragged } }));
	// Pointer just below the second row's midpoint: Kessa should land between Huntmaster and Hyena.
	dom.element.listeners.dragover(event({ clientY: 45 }));
	assert.equal(dom.rows[2].classes.has("drop-before"), true);
	dom.element.listeners.drop(event({}));
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(updates.length, 1);
	const [collection, changes, ...rest] = updates[0];
	assert.equal(collection, "Combatant");
	assert.deepEqual(changes.map(change => change._id), ["hero"]);
	assert.equal(changes[0].initiative, 11.85, "midway between 17.5 and 6.2");
	assert.equal(rest.length, 0, "no turn override: Foundry keeps the acting combatant itself");
	assert.equal(dom.rows[2].classes.has("drop-before"), false, "markers are cleared");
});

test("dropping a row where it already is changes nothing", async () => {
	const h = harness();
	const { combat, updates } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const event = props => ({ preventDefault() {}, dataTransfer: { setData() {} }, ...props });
	dom.rows.forEach((row, i) => { row.getBoundingClientRect = () => ({ top: i * 30, height: 20 }); });
	dom.element.listeners.dragstart(event({ target: { closest: () => dom.rows[1] } }));
	dom.element.listeners.dragover(event({ clientY: 5 + 30 * 0 }));
	dom.element.listeners.dragover(event({ clientY: 45 }));
	dom.element.listeners.drop(event({}));
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(updates.length, 0);
});

test("releasing over the header or footer still drops: above the list is the top, below it the bottom", async () => {
	const h = harness();
	const { combat, updates } = encounter({ acting: "boss" });
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const event = props => ({ preventDefault() {}, dataTransfer: { setData() {} }, ...props });
	dom.rows.forEach((row, i) => { row.getBoundingClientRect = () => ({ top: 40 + i * 30, height: 20 }); });
	dom.element.listeners.dragstart(event({ target: { closest: () => dom.rows[2] } }));
	dom.element.listeners.dragover(event({ clientY: -50 }));
	assert.equal(dom.rows[0].classes.has("drop-before"), true, "far above the list");
	dom.element.listeners.drop(event({}));
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(updates.length, 1);
	assert.equal(updates[0][1][0]._id, "pup");
	assert.equal(updates[0][1][0].initiative, 22.1, "one above the top combatant");
	dom.element.listeners.dragstart(event({ target: { closest: () => dom.rows[0] } }));
	dom.element.listeners.dragover(event({ clientY: 9999 }));
	assert.equal(dom.rows[2].classes.has("drop-after"), true, "far below the list");
	dom.element.listeners.drop(event({}));
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(updates[1][1][0]._id, "hero");
	assert.equal(updates[1][1][0].initiative, 5.2, "one below the last combatant");
});

test("the list scrolls while the pointer is near its top or bottom edge, and not in the middle", () => {
	const h = harness();
	const { combat } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const event = props => ({ preventDefault() {}, dataTransfer: { setData() {} }, ...props });
	dom.element.listeners.dragstart(event({ target: { closest: () => dom.rows[0] } }));
	dom.list.scrollTop = 100;
	dom.element.listeners.dragover(event({ clientY: 100 }));
	assert.equal(dom.list.scrollTop, 100, "middle: no scrolling");
	dom.element.listeners.dragover(event({ clientY: 195 }));
	assert.ok(dom.list.scrollTop > 100, "bottom edge scrolls down");
	const afterDown = dom.list.scrollTop;
	dom.element.listeners.dragover(event({ clientY: 5 }));
	assert.ok(dom.list.scrollTop < afterDown, "top edge scrolls up");
	dom.list.scrollTop = 100;
	dom.element.listeners.dragover(event({ clientY: -500 }));
	assert.equal(dom.list.scrollTop, 80, "beyond the edge is capped at 20px per step");
});

test("HP-driven re-renders wait until a drag ends so they cannot cancel it", () => {
	const renders = [];
	const h = harness();
	const { combat } = encounter();
	h.context.ui.combat = { viewed: combat, render: options => renders.push(options) };
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const event = props => ({ preventDefault() {}, dataTransfer: { setData() {} }, ...props });
	dom.element.listeners.dragstart(event({ target: { closest: () => dom.rows[0] } }));
	h.fire("updateActor", {}, { system: { attributes: { hp: { value: 3 } } } });
	assert.equal(renders.length, 0, "no render under the pointer mid-drag");
	dom.element.listeners.dragend();
	assert.equal(renders.length, 1, "caught up once the drag is over");
	h.fire("updateActor", {}, { system: { attributes: { hp: { value: 2 } } } });
	assert.equal(renders.length, 2);
});

test("a drag that was not started by this tracker is ignored", () => {
	const h = harness();
	const { combat } = encounter();
	const dom = trackerDom(combat);
	h.render(combat, dom);
	let prevented = false;
	dom.element.listeners.dragover({ preventDefault: () => { prevented = true; }, clientY: 10 });
	assert.equal(prevented, false, "foreign drags (actors, items) are left alone");
});

test("players and unstarted combats cannot drag at all", () => {
	for (const options of [{ isGM: false }, { isGM: true }]) {
		const h = harness(options);
		const { combat } = encounter({ started: options.isGM ? false : true, round: options.isGM ? 0 : 2 });
		const dom = trackerDom(combat);
		h.render(combat, dom);
		let prevented = false;
		dom.element.listeners.dragstart({ target: { closest: () => dom.rows[0] }, preventDefault: () => { prevented = true; }, dataTransfer: {} });
		assert.equal(prevented, true);
	}
});

test("reorderCombatant refuses to run for players", async () => {
	const h = harness({ isGM: false });
	const { combat, updates } = encounter();
	await h.context.api.reorderCombatant(combat, "hero", 2);
	assert.equal(updates.length, 0);
});

test("HP changes refresh only the tracker part, and only while the setting is on", () => {
	const renders = [];
	const h = harness();
	h.context.ui.combat = { viewed: {}, render: options => renders.push(options) };
	h.fire("updateActor", {}, { system: { attributes: { hp: { value: 5 } } } });
	h.fire("updateActor", {}, { name: "Renamed" });
	h.fire("updateToken", {}, { delta: { system: {} } });
	h.fire("updateToken", {}, { x: 100 });
	assert.deepEqual(JSON.parse(JSON.stringify(renders)), [{ parts: ["tracker"] }, { parts: ["tracker"] }]);
	h.setEnabled(false);
	h.fire("updateActor", {}, { system: { attributes: { hp: { value: 4 } } } });
	assert.equal(renders.length, 2);
});

test("only GM clients listen for sockets, dice animations, or run the timer; players report instead", () => {
	const player = harness({ isGM: false });
	assert.equal(player.sockets.length, 0);
	assert.equal(player.timers.length, 0);
	assert.equal(player.hooks.has("diceSoNiceRollStart"), false);
	const gm = harness();
	assert.equal(gm.sockets[0][0], "module.dnd4e-health-display");
	assert.equal(gm.timers.length, 1);
	assert.equal(gm.hooks.has("diceSoNiceRollStart"), true);
});

test("the timer counts on the GM client, freezes for Target Automation, and Dice So Nice only when it is alone", () => {
	const h = harness();
	const { combat } = encounter({ acting: "hero" });
	h.context.ui.combat.viewed = combat;
	const dom = trackerDom(combat);
	h.render(combat, dom);
	const display = node();
	h.context.document.querySelectorAll = selector => (selector === "[data-compact-timer]" ? [display] : []);
	{
		let clock = 1_000_000;
		h.setClock(() => clock);
		h.context.api.tickTimer();
		clock += 65000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, />1:05</);
		assert.match(display.className, /is-yellow/);
		h.fire("dnd4e-health-display.activation", { finished: false, caster: { document: { uuid: "Scene.s.Token.hero" } } });
		h.fire("diceSoNiceRollStart", "msg-1");
		clock += 10000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, /Paused · Target Automation/);
		assert.doesNotMatch(display.innerHTML, /Dice So Nice/, "Target Automation takes precedence");
		assert.match(display.innerHTML, />1:05</, "frozen");
		h.fire("dnd4e-health-display.activation", { finished: true, caster: { document: { uuid: "Scene.s.Token.hero" } } });
		clock += 1000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, /Paused · Dice So Nice/);
		h.fire("diceSoNiceRollComplete", "msg-1");
		clock += 56000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, />2:01</);
		assert.match(display.className, /is-orange/);
		assert.doesNotMatch(display.innerHTML, /Paused/);
	}
});

test("the timer restarts when the acting combatant changes", () => {
	const h = harness();
	const { combat, turns } = encounter({ acting: "hero" });
	h.context.ui.combat.viewed = combat;
	const display = node();
	h.context.document.querySelectorAll = selector => (selector === "[data-compact-timer]" ? [display] : []);
	{
		let clock = 5_000_000;
		h.setClock(() => clock);
		h.context.api.tickTimer();
		clock += 30000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, />0:30</);
		combat.combatant = turns[1];
		clock += 1000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, />0:00</);
	}
});

test("a Target Automation session for someone else's token does not stop the acting player's timer", () => {
	const h = harness();
	const { combat } = encounter({ acting: "hero" });
	h.context.ui.combat.viewed = combat;
	const display = node();
	h.context.document.querySelectorAll = selector => (selector === "[data-compact-timer]" ? [display] : []);
	{
		let clock = 9_000_000;
		h.setClock(() => clock);
		h.context.api.tickTimer();
		h.fire("dnd4e-health-display.activation", { finished: false, caster: { document: { uuid: "Scene.s.Token.boss" } } });
		clock += 10000;
		h.context.api.tickTimer();
		assert.doesNotMatch(display.innerHTML, /Paused/);
		assert.match(display.innerHTML, />0:10</);
	}
});

test("a player's Target Automation session is reported to the GM over the socket", () => {
	const player = harness({ isGM: false, userId: "p1" });
	const activation = { finished: false, caster: { document: { uuid: "Scene.s.Token.hero" } } };
	player.fire("dnd4e-health-display.activation", activation);
	player.fire("dnd4e-health-display.activation", { ...activation, finished: true });
	assert.deepEqual(player.emitted.map(([channel, message]) => [channel, message.type, message.userId, message.active, message.tokenUuid]), [
		["module.dnd4e-health-display", "compactTrackerTargeting", "p1", true, "Scene.s.Token.hero"],
		["module.dnd4e-health-display", "compactTrackerTargeting", "p1", false, "Scene.s.Token.hero"],
	]);
});

test("nothing is reported while the setting is off", () => {
	const player = harness({ isGM: false, enabled: false });
	player.fire("dnd4e-health-display.activation", { finished: false, caster: { document: { uuid: "x" } } });
	assert.equal(player.emitted.length, 0);
});

test("the GM only honours reports from online users who own the token", () => {
	const owner = { id: "p1", active: true, isGM: false, owner: "OWNER" };
	const stranger = { id: "p2", active: true, isGM: false, owner: "OBSERVER" };
	const offline = { id: "p3", active: false, isGM: false, owner: "OWNER" };
	const h = harness({ users: { p1: owner, p2: stranger, p3: offline } });
	const { combat } = encounter({ acting: "hero" });
	h.context.ui.combat.viewed = combat;
	h.context.tokens["Scene.s.Token.hero"] = { actor: { testUserPermission: (user, level) => user.owner === level } };
	const display = node();
	h.context.document.querySelectorAll = selector => (selector === "[data-compact-timer]" ? [display] : []);
	const [, receive] = h.sockets[0];
	{
		let clock = 20_000_000;
		h.setClock(() => clock);
		h.context.api.tickTimer();
		for (const userId of ["p2", "p3", "nobody"]) {
			receive({ type: "compactTrackerTargeting", userId, active: true, tokenUuid: "Scene.s.Token.hero" });
		}
		receive({ type: "somethingElse", userId: "p1", active: true, tokenUuid: "Scene.s.Token.hero" });
		receive({ type: "compactTrackerTargeting", userId: 7, active: true });
		receive(null);
		clock += 5000;
		h.context.api.tickTimer();
		assert.doesNotMatch(display.innerHTML, /Paused/);
		receive({ type: "compactTrackerTargeting", userId: "p1", active: true, tokenUuid: "Scene.s.Token.hero" });
		clock += 5000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, /Paused · Target Automation/);
		receive({ type: "compactTrackerTargeting", userId: "p1", active: false, tokenUuid: "Scene.s.Token.hero" });
		clock += 1000;
		h.context.api.tickTimer();
		assert.doesNotMatch(display.innerHTML, /Paused/);
	}
});

test("a user who disconnects mid-session no longer holds the timer", () => {
	const owner = { id: "p1", active: true, isGM: false, owner: "OWNER" };
	const h = harness({ users: { p1: owner } });
	const { combat } = encounter({ acting: "hero" });
	h.context.ui.combat.viewed = combat;
	h.context.tokens["Scene.s.Token.hero"] = { actor: { testUserPermission: (user, level) => user.owner === level } };
	const display = node();
	h.context.document.querySelectorAll = selector => (selector === "[data-compact-timer]" ? [display] : []);
	{
		let clock = 30_000_000;
		h.setClock(() => clock);
		h.context.api.tickTimer();
		h.sockets[0][1]({ type: "compactTrackerTargeting", userId: "p1", active: true, tokenUuid: "Scene.s.Token.hero" });
		clock += 1000;
		h.context.api.tickTimer();
		assert.match(display.innerHTML, /Paused/);
		h.fire("updateUser", { id: "p1", active: false });
		clock += 1000;
		h.context.api.tickTimer();
		assert.doesNotMatch(display.innerHTML, /Paused/);
	}
});

test("the real setting, workflow announcement and module wiring are in place", () => {
	const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
	assert.match(main, /registerCompactTrackerSettings\(\)/);
	assert.match(main, /registerCompactTracker\(\)/);
	assert.match(readFileSync(new URL("../module.json", import.meta.url), "utf8"), /styles\/compact-tracker\.css/);
	assert.match(source, /name: "Compact combat tracker"[\s\S]*scope: "world"[\s\S]*type: Boolean, default: false/);
});

test("an activation workflow announces every change and its close to other features", async () => {
	const { ActivationWorkflow } = await import("../scripts/power-activation/workflow.js");
	const announcements = [];
	globalThis.Hooks = { callAll: (name, activation) => announcements.push([name, activation.state, activation.finished]) };
	try {
		const workflow = new ActivationWorkflow();
		workflow.announce();
		workflow.transition("attackDialog");
		workflow.transition("closed");
		workflow.transition("closed");
		assert.deepEqual(announcements, [
			["dnd4e-health-display.activation", "targeting", false],
			["dnd4e-health-display.activation", "attackDialog", false],
			["dnd4e-health-display.activation", "closed", true],
		]);
	} finally {
		delete globalThis.Hooks;
	}
});
