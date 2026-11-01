import assert from "node:assert/strict";
import test from "node:test";
import * as data from "../scripts/compact-tracker/compact-tracker-data.js";
import { getSpecialRole } from "../scripts/health-display/token-hover-display-data.js";

const turn = (id, initiative, extra = {}) => ({ id, initiative, name: id, ...extra });

test("HP bands are green above 75%, yellow above 50%, orange above 25%, red at or below", () => {
	const bands = [[44, 44], [34, 44], [33, 44], [23, 44], [22, 44], [12, 44], [11, 44], [1, 44], [0, 44]]
		.map(([hp, max]) => data.hpBand(hp, max));
	assert.deepEqual(bands, ["green", "green", "yellow", "yellow", "orange", "orange", "red", "red", "red"]);
	assert.equal(data.hpBand(5, 0), "red", "no usable maximum never reads as healthy");
});

test("HP text is current/max with its band, and absent when HP is unknown", () => {
	const html = data.hpHtml(38, 44);
	assert.match(html, /is-green/);
	assert.match(html, /<b>38<\/b>\/44/);
	assert.equal(data.hpHtml(NaN, 44), "");
	assert.equal(data.hpHtml(10, 0), "");
	assert.match(data.hpHtml(0, 30), /is-red/);
});

test("role icons follow the health display: solo, leader, elite, then a pawn for minions", () => {
	const actor = role => ({ system: { details: { role } } });
	assert.equal(data.trackerRole(getSpecialRole(actor({ secondary: "solo" }))).icon, "fa-solid fa-skull");
	assert.equal(data.trackerRole(getSpecialRole(actor({ leader: true }))).icon, "fa-solid fa-star");
	assert.equal(data.trackerRole(getSpecialRole(actor({ secondary: "elite" }))).icon, "fa-solid fa-diamond");
	assert.equal(data.trackerRole(getSpecialRole(actor({ secondary: "minion" }))).icon, data.PAWN_ICON);
	assert.equal(data.trackerRole(getSpecialRole(actor({}))), null);
	assert.equal(data.trackerRole(getSpecialRole(actor({ leader: true, secondary: "elite" }))).key, "leader",
		"a creature shows exactly one icon, by the health display's priority");
	assert.equal(data.trackerRole(getSpecialRole(actor({ leader: true, secondary: "solo" }))).key, "solo");
});

test("role markup is a labelled icon, or an empty aria-hidden slot that keeps names aligned", () => {
	const shown = data.roleHtml({ key: "elite", label: "Elite", icon: "fa-solid fa-diamond" });
	assert.match(shown, /is-elite/);
	assert.match(shown, /title="Elite"/);
	assert.match(shown, /aria-label="Elite"/);
	const empty = data.roleHtml(null);
	assert.match(empty, /data-compact-role/);
	assert.match(empty, /aria-hidden="true"/);
	assert.doesNotMatch(empty, /<i /);
});

test("the drag grip is a decorative handle", () => {
	assert.match(data.gripHtml(), /data-compact-grip[^>]*aria-hidden="true"/);
});

test("interpolated names are escaped", () => {
	assert.equal(data.titleHtml("<b>Ambush</b> & \"co\""), "<h2 class=\"dnd4e-compact-tracker__title\" data-compact-title>&lt;b&gt;Ambush&lt;/b&gt; &amp; &quot;co&quot;</h2>");
	assert.match(data.nextPlayerHtml({ name: "<img>", turns: 2, started: true }), /&lt;img&gt;/);
});

test("subtitle adds the turn to the native round text and never doubles it", () => {
	assert.equal(data.subtitleText("Round 2", 2, 8), "Round 2 · Turn 3 of 8");
	assert.equal(data.subtitleText("Round 2 · Turn 3 of 8", 3, 8), "Round 2 · Turn 4 of 8");
	assert.equal(data.subtitleText("Not started", -1, 8), "Not started");
	assert.equal(data.subtitleText("Round 1", -1, 8), "Round 1", "hidden acting combatant: no turn number to leak");
});

test("turn order matches Foundry: initiative descending, unrolled last, ties by id", () => {
	const order = data.sortTurns([turn("c", 10), turn("a", null), turn("d", 15), turn("b", 10)]);
	assert.deepEqual(order.map(entry => entry.id), ["d", "b", "c", "a"]);
});

test("initiative between two neighbours is their midpoint", () => {
	const result = data.initiativeBetween(turn("a", 17.25), turn("b", 12.5));
	assert.equal(result.value, 14.875);
	assert.equal(result.tied, false);
});

test("initiative above the first and below the last is one step beyond", () => {
	assert.equal(data.initiativeBetween(undefined, turn("a", 21.1234)).value, 22.1234);
	assert.equal(data.initiativeBetween(turn("z", 3.5), undefined).value, 2.5);
	assert.equal(data.initiativeBetween(turn("z", 3.5), turn("n", null)).value, 2.5, "unrolled neighbours count as the end");
	assert.equal(data.initiativeBetween(undefined, undefined).value, 0);
});

test("tied neighbours are reported as tied rather than given a made-up value", () => {
	const result = data.initiativeBetween(turn("a", 17), turn("b", 17));
	assert.equal(result.tied, true);
	assert.equal(result.value, undefined);
	assert.equal(data.initiativeBetween(turn("a", 17), turn("b", 17.0000001)).tied, true);
	assert.equal(data.initiativeBetween(turn("a", 17.5), turn("b", 17)).tied, false);
});

test("DnD4e's four-decimal tiebreakers are split without losing precision", () => {
	const result = data.initiativeBetween(turn("a", 17.0123), turn("b", 17.0121));
	assert.equal(result.value, 17.0122);
	assert.equal(result.tied, false);
});

const ORDER = [turn("a", 21), turn("c", 17), turn("e", 17.001), turn("b", 12), turn("h", 6)].sort((x, y) => y.initiative - x.initiative);

test("dragging down slots the combatant between the new neighbours", () => {
	// a(21) e(17.001) c(17) b(12) h(6); drag a so it lands between c and b.
	const plan = data.planReorder(ORDER, "a", 2);
	assert.equal(plan.updates.at(-1)._id, "a");
	assert.equal(plan.updates.at(-1).initiative, 14.5);
	const next = data.sortTurns(ORDER.map(entry => ({ ...entry, initiative: plan.updates.find(update => update._id === entry.id)?.initiative ?? entry.initiative })));
	assert.deepEqual(next.map(entry => entry.id), ["e", "c", "a", "b", "h"]);
});

test("dragging to the top or bottom takes one step beyond the edge", () => {
	assert.equal(data.planReorder(ORDER, "h", 0).updates.at(-1).initiative, 22);
	assert.equal(data.planReorder(ORDER, "a", 4).updates.at(-1).initiative, 5);
});

test("a drop that leaves the order unchanged produces no update", () => {
	assert.equal(data.planReorder(ORDER, "c", 2), null);
	assert.equal(data.planReorder(ORDER, "a", 0), null);
});

test("an out-of-range drop index is clamped", () => {
	assert.equal(data.planReorder(ORDER, "a", 99).updates.at(-1).initiative, 5);
	assert.equal(data.planReorder(ORDER, "h", -4).updates.at(-1).initiative, 22);
});

/** Apply a plan and return the resulting order of ids. */
function applied(turns, plan) {
	return data.sortTurns(turns.map(entry => ({ ...entry, initiative: plan.updates.find(update => update._id === entry.id)?.initiative ?? entry.initiative })))
		.map(entry => entry.id);
}

// Three orcs rolled together (a, b, c all 14), with real neighbours above and below.
const TIED = data.sortTurns([turn("boss", 20), turn("a", 14), turn("b", 14), turn("c", 14), turn("pc", 9)]);

test("dropping between two tied combatants lands exactly there and leaves the rest of the tie in order", () => {
	assert.deepEqual(TIED.map(entry => entry.id), ["boss", "a", "b", "c", "pc"]);
	assert.deepEqual(applied(TIED, data.planReorder(TIED, "pc", 3)), ["boss", "a", "b", "pc", "c"], "between b and c");
	assert.deepEqual(applied(TIED, data.planReorder(TIED, "pc", 2)), ["boss", "a", "pc", "b", "c"], "between a and b");
	assert.deepEqual(applied(TIED, data.planReorder(TIED, "boss", 3)), ["a", "b", "c", "boss", "pc"], "after the whole tie");
});

test("dragging one of a tied group to another spot inside it reorders only that member", () => {
	assert.deepEqual(applied(TIED, data.planReorder(TIED, "c", 2)), ["boss", "a", "c", "b", "pc"], "c between a and b");
	assert.deepEqual(applied(TIED, data.planReorder(TIED, "a", 2)), ["boss", "b", "a", "c", "pc"], "a between b and c");
});

test("spreading a tie keeps every value distinct and never crosses a close outside neighbour", () => {
	const crowded = data.sortTurns([turn("up", 14.0001), turn("a", 14), turn("b", 14), turn("c", 14), turn("down", 13.9999)]);
	const plan = data.planReorder(crowded, "down", 3);
	const result = data.sortTurns(crowded.map(entry => ({ ...entry, initiative: plan.updates.find(update => update._id === entry.id)?.initiative ?? entry.initiative })));
	assert.deepEqual(result.map(entry => entry.id), ["up", "a", "b", "down", "c"]);
	const values = result.map(entry => entry.initiative);
	assert.equal(new Set(values).size, values.length, "no remaining ties");
	assert.deepEqual([...values].sort((x, y) => y - x), values, "values strictly follow the order");
	assert.equal(values[0], 14.0001, "the neighbour above is untouched");
	assert.equal(values[1], 14, "the top of the tie keeps its value");
});

test("only the combatants whose value actually changes are updated in a tie", () => {
	const plan = data.planReorder(TIED, "pc", 2);
	assert.deepEqual(plan.updates.map(update => update._id).sort(), ["b", "c", "pc"], "a keeps its value");
});

test("a large tie is pulled apart without leaving duplicates", () => {
	const orcs = Array.from({ length: 30 }, (_, i) => turn("orc" + String(i).padStart(2, "0"), 12));
	const rows = data.sortTurns([turn("x", 18), ...orcs, turn("y", 3)]);
	const plan = data.planReorder(rows, "x", 15);
	const order = applied(rows, plan);
	assert.equal(order[15], "x");
	assert.deepEqual(order.slice(0, 15), orcs.slice(0, 15).map(entry => entry.id));
	assert.deepEqual(order.slice(16, 31), orcs.slice(15).map(entry => entry.id));
	assert.equal(order.at(-1), "y");
});

test("next player counts turns from the acting combatant and wraps into the next round", () => {
	const turns = [
		{ id: "kessa", name: "Kessa", isPlayer: true }, { id: "mirelle", name: "Mirelle", isPlayer: true },
		{ id: "gnoll", name: "Gnoll", isPlayer: false }, { id: "gorm", name: "Gorm", isPlayer: false },
		{ id: "hyena", name: "Hyena", isPlayer: false }, { id: "alden", name: "Alden", isPlayer: true },
	];
	assert.deepEqual(data.nextPlayer(turns, "kessa", true), { name: "Mirelle", turns: 1, started: true });
	assert.equal(data.nextPlayer(turns, "mirelle", true).turns, 4);
	assert.equal(data.nextPlayer(turns, "gnoll", true).name, "Alden");
	assert.equal(data.nextPlayer(turns, "gnoll", true).turns, 3);
	assert.deepEqual(data.nextPlayer(turns, "alden", true), { name: "Kessa", turns: 1, started: true });
});

test("next player: a lone player counts all the way round to themselves, and no players means no line", () => {
	assert.equal(data.nextPlayer([{ id: "x", name: "Solo", isPlayer: true }, { id: "y", name: "Orc", isPlayer: false }], "x", true).turns, 2);
	assert.equal(data.nextPlayer([{ id: "y", name: "Orc", isPlayer: false }], "y", true), null);
	assert.equal(data.nextPlayerHtml(null), "");
});

test("next player before combat names the first player and their turn; a hidden acting combatant yields nothing", () => {
	const turns = [{ id: "o", name: "Orc", isPlayer: false }, { id: "k", name: "Kessa", isPlayer: true }];
	assert.deepEqual(data.nextPlayer(turns, null, false), { name: "Kessa", turns: 2, started: false });
	assert.match(data.nextPlayerHtml(data.nextPlayer(turns, null, false)), /First player: <strong>Kessa<\/strong>.*turn 2/);
	assert.equal(data.nextPlayer(turns, "hidden-combatant", true), null);
	assert.match(data.nextPlayerHtml({ name: "Kessa", turns: 1, started: true }), />next</);
	assert.match(data.nextPlayerHtml({ name: "Kessa", turns: 3, started: true }), /in 3 turns/);
});

test("timer text is m:ss and the colour stages start at one and two minutes", () => {
	assert.equal(data.formatTimer(0), "0:00");
	assert.equal(data.formatTimer(59999), "0:59");
	assert.equal(data.formatTimer(65000), "1:05");
	assert.equal(data.formatTimer(-5), "0:00");
	assert.deepEqual([0, 59999, 60000, 119999, 120000, 600000].map(data.timerStage),
		["none", "none", "yellow", "yellow", "orange", "orange"]);
});

test("a paused timer names its reason and stays coloured at its frozen value", () => {
	const running = { elapsedMs: 65000, pausedBy: null };
	assert.doesNotMatch(data.timerHtml(running), /Paused/);
	assert.match(data.timerClasses(running), /is-yellow/);
	assert.doesNotMatch(data.timerClasses(running), /is-paused/);
	const paused = { elapsedMs: 125000, pausedBy: "Target Automation" };
	assert.match(data.timerHtml(paused), /Paused · Target Automation/);
	assert.match(data.timerHtml(paused), />2:05</);
	assert.match(data.timerClasses(paused), /is-orange is-paused/);
});
