import assert from "node:assert/strict";
import test from "node:test";
import {
	MAX_EFFECT_ROWS,
	buildEffectRows,
	buildGems,
	buildTagOutline,
	buildTokenRingData,
	computeTurnsAway,
	describeEnding,
	placeEffectStrip,
	shortName,
	sortEffectRows,
} from "../scripts/health-display/token-ring-data.js";

const effect = (name, ending, extra = {}) => ({ name, img: `${name}.png`, isCondition: false, description: "", ending, ...extra });

test("gems follow the health segments and leave a gap at the bloodied mark", () => {
	const gems = buildGems([true, true, false, false]);
	assert.deepEqual(gems.map((gem) => gem.filled), [true, true, false, false]);
	assert.deepEqual(gems.map((gem) => gem.gapAfter), [false, true, false, false], "the gap follows the middle gem");
	const pc = buildGems([true, true, true, true, false, false]);
	assert.deepEqual(pc.map((gem) => gem.gapAfter), [false, false, true, false, false, false]);
});

test("a minion's single gem has no gap, and no segments means no gems", () => {
	assert.deepEqual(buildGems([true]), [{ filled: true, gapAfter: false }]);
	assert.deepEqual(buildGems([false]), [{ filled: false, gapAfter: false }]);
	assert.deepEqual(buildGems([]), []);
});

test("a centred gem row gives a stepped outline with a step and a fillet on both sides", () => {
	const outline = buildTagOutline({ width: 130, tabHeight: 24, plateHeight: 28, tabLeft: 20, tabWidth: 90 });
	assert.deepEqual([outline.width, outline.height], [130, 52]);
	assert.equal(outline.path, "M20 9A9 9 0 0 1 29 0H101A9 9 0 0 1 110 9V19A5 5 0 0 0 115 24H119A11 11 0 0 1 130 35V41A11 11 0 0 1 119 52H11A11 11 0 0 1 0 41V35A11 11 0 0 1 11 24H15A5 5 0 0 0 20 19Z");
	assert.equal(outline.path.match(/A5 5 0 0 0/g).length, 2, "one concave fillet per step");
});

test("a gem row flush with the right edge steps only on the left", () => {
	const outline = buildTagOutline({ width: 130, tabHeight: 24, plateHeight: 28, tabLeft: 40, tabWidth: 90 });
	assert.equal(outline.path.match(/A5 5 0 0 0/g).length, 1);
	assert.match(outline.path, /^M40 9A9 9 0 0 1 49 0H121A9 9 0 0 1 130 9V41A11/, "the right edge runs straight down");
});

test("a gem row as wide as the tag is a plain rounded block, and the outline always closes", () => {
	const flush = buildTagOutline({ width: 90, tabHeight: 24, plateHeight: 28, tabLeft: 0, tabWidth: 90 });
	assert.equal(flush.path.includes("A5 5"), false, "no steps, so no fillets");
	for (const measure of [
		{ width: 130, tabHeight: 24, plateHeight: 28, tabLeft: 20, tabWidth: 90 },
		{ width: 130, tabHeight: 24, plateHeight: 28, tabLeft: 40, tabWidth: 90 },
		{ width: 90, tabHeight: 24, plateHeight: 28, tabLeft: 0, tabWidth: 90 },
		{ width: 60, tabHeight: 8, plateHeight: 8, tabLeft: 5, tabWidth: 50 },
	]) {
		const { path } = buildTagOutline(measure);
		assert.ok(path.endsWith("Z"));
		assert.ok(!/NaN|undefined/.test(path));
	}
	const tiny = buildTagOutline({ width: 60, tabHeight: 8, plateHeight: 8, tabLeft: 5, tabWidth: 50 });
	assert.match(tiny.path, /A4 4 0 0 1/, "corner radii shrink to fit short rows");
});

test("computeTurnsAway counts forwards around the order and rejects unknown creatures", () => {
	assert.equal(computeTurnsAway({ turnCount: 10, currentIndex: 2, targetIndex: 5, atStart: false }), 3);
	assert.equal(computeTurnsAway({ turnCount: 10, currentIndex: 8, targetIndex: 1, atStart: false }), 3, "wraps past the end");
	assert.equal(computeTurnsAway({ turnCount: 10, currentIndex: 2, targetIndex: 2, atStart: false }), 0, "end of the current turn is this turn");
	assert.equal(computeTurnsAway({ turnCount: 10, currentIndex: 2, targetIndex: 2, atStart: true }), 10, "the current turn's start has passed");
	assert.equal(computeTurnsAway({ turnCount: 10, currentIndex: 2, targetIndex: -1, atStart: false }), null);
	assert.equal(computeTurnsAway({ turnCount: 0, currentIndex: 0, targetIndex: 0, atStart: false }), null);
	assert.equal(computeTurnsAway({ turnCount: 5, currentIndex: -1, targetIndex: 2, atStart: false }), null, "no active turn");
});

test("shortName keeps short names and otherwise uses the first non-article word", () => {
	assert.equal(shortName("Kess Varro"), "Kess Varro");
	assert.equal(shortName("Vorhaal the Pale Warden"), "Vorhaal");
	assert.equal(shortName("The Pale Warden of the Deep"), "Pale");
	assert.equal(shortName('Hana "Gale" Soliogn'), "Hana");
	assert.equal(shortName(undefined), "");
});

test("endings read as compact labels and flag the ones due this or next turn", () => {
	assert.deepEqual(describeEnding({ type: "save", turnsAway: 6 }), { kind: "save", label: "Save", turnsAway: 6, soon: false });
	assert.equal(describeEnding({ type: "save", turnsAway: 1 }).soon, true);
	assert.equal(describeEnding({ type: "save", turnsAway: 0 }).soon, true);
	assert.equal(describeEnding({ type: "save", turnsAway: 2 }).soon, false);
	assert.equal(describeEnding({ type: "endOfTurn", who: "Vorhaal the Pale Warden", turnsAway: 1 }).label, "EoT Vorhaal");
	assert.equal(describeEnding({ type: "startOfTurn", who: "Tilda", turnsAway: 5 }).label, "SoT Tilda");
	assert.equal(describeEnding({ type: "encounter" }).kind, "encounter");
	assert.equal(describeEnding({ type: "encounter" }).soon, false);
	assert.equal(describeEnding({ type: "custom", label: "Until dawn" }).label, "Until dawn");
	assert.equal(describeEnding({ type: "custom" }).label, "Custom");
	assert.equal(describeEnding({ type: "none" }).kind, "none");
	assert.equal(describeEnding(undefined).kind, "none");
	assert.equal(describeEnding({ type: "save" }).soon, false, "without a running combat nothing is flagged soon");
	assert.equal(describeEnding({ type: "save" }).turnsAway, null);
});

test("effects sort soonest first, then encounter-long, then open-ended, keeping ties in order", () => {
	const rows = [
		{ id: "open", ending: describeEnding({ type: "none" }) },
		{ id: "encounter", ending: describeEnding({ type: "encounter" }) },
		{ id: "far", ending: describeEnding({ type: "save", turnsAway: 6 }) },
		{ id: "custom", ending: describeEnding({ type: "custom", label: "x" }) },
		{ id: "now", ending: describeEnding({ type: "save", turnsAway: 0 }) },
		{ id: "tie-a", ending: describeEnding({ type: "endOfTurn", who: "A", turnsAway: 3 }) },
		{ id: "tie-b", ending: describeEnding({ type: "endOfTurn", who: "B", turnsAway: 3 }) },
	];
	assert.deepEqual(sortEffectRows(rows).map((row) => row.id), ["now", "tie-a", "tie-b", "far", "encounter", "open", "custom"]);
	assert.equal(rows[0].id, "open", "the input array is not mutated");
});

test("conditions show a title only; other effects carry their description", () => {
	const { rows } = buildEffectRows([
		effect("Dazed", { type: "save" }, { isCondition: true, description: "Should never be shown" }),
		effect("Second Wind", { type: "startOfTurn", who: "Tilda", turnsAway: 5 }, { description: "  +2 bonus to all defenses.  " }),
		effect("Aura", { type: "encounter" }, { description: "" }),
	]);
	const byTitle = Object.fromEntries(rows.map((row) => [row.title, row]));
	assert.equal(byTitle.Dazed.description, "");
	assert.equal(byTitle["Second Wind"].description, "+2 bonus to all defenses.");
	assert.equal(byTitle.Aura.description, "", "no description means a one-line row");
	assert.equal(byTitle.Aura.isEncounter, true);
	assert.equal(byTitle.Dazed.isOpenEnded, false);
});

test("an effect due this turn is marked soon, one due in three turns is not", () => {
	const { rows } = buildEffectRows([
		effect("Later", { type: "save", turnsAway: 3 }),
		effect("Sooner", { type: "endOfTurn", who: "Kess", turnsAway: 1 }),
	]);
	assert.deepEqual(rows.map((row) => [row.title, row.soon]), [["Sooner", true], ["Later", false]]);
});

test("more than the row limit collapses the tail into an overflow count", () => {
	const many = Array.from({ length: MAX_EFFECT_ROWS + 3 }, (_unused, index) => effect(`E${index}`, { type: "save", turnsAway: index }));
	const { rows, overflow } = buildEffectRows(many);
	assert.equal(rows.length, MAX_EFFECT_ROWS - 1);
	assert.equal(overflow, 4);
	const exact = buildEffectRows(many.slice(0, MAX_EFFECT_ROWS));
	assert.equal(exact.rows.length, MAX_EFFECT_ROWS, "exactly the limit still fits");
	assert.equal(exact.overflow, 0);
	assert.deepEqual(buildEffectRows([]), { rows: [], overflow: 0 });
	assert.deepEqual(buildEffectRows(undefined), { rows: [], overflow: 0 });
});

test("ring data carries gems, role and name, never a state word, and keeps a minimum size", () => {
	const base = {
		name: "Gorrak", healthLabel: "Health: Bloodied", healthState: "Bloodied", segments: [{ filled: true }, { filled: true }, { filled: false }, { filled: false }],
		role: { key: "elite", label: "Elite", icon: "fa-solid fa-diamond" }, effects: [],
	};
	const tiny = buildTokenRingData(base, { size: 10 });
	assert.equal(tiny.size, 44, "tiny zoomed-out tokens still get a readable ring");
	assert.equal(tiny.outer, 44 + 60);
	assert.equal(tiny.radius, 22 + 4, "the thin hover ring hugs the token");
	assert.equal(tiny.role.key, "elite");
	assert.equal(tiny.gems.length, 4);
	assert.equal(tiny.tagTop, 30 + 44 + 3);
	assert.equal(tiny.healthLabel, "Health: Bloodied", "the state stays available to screen readers");
	for (const key of ["stateLabel", "turnDistance", "animate", "segments", "bar"]) {
		assert.equal(tiny[key], undefined, `${key} is not part of the tag design`);
	}
	for (const healthState of ["Bloodied", "Defeated", "Last Stand", "Healthy", "Alive"]) {
		assert.equal(buildTokenRingData({ ...base, healthState }, { size: 80 }).stateLabel, undefined);
	}
	assert.equal(buildTokenRingData({ ...base, role: undefined }, { size: 80 }).role, null);
	assert.equal(buildTokenRingData({ ...base, defeated: true }, { size: 80 }).defeated, true, "defeated still strikes the name through");
});

test("the effect strip sits to the right of the ring, centred on the token", () => {
	const placement = placeEffectStrip({
		centre: 52, radius: 33, strip: { width: 260, height: 100 }, frame: { left: 100, top: 300 }, viewport: { width: 1600, height: 900 },
	});
	assert.equal(placement.flip, false);
	assert.equal(placement.left, 52 + 41 + 16);
	assert.equal(placement.top, 52 - 50);
	assert.equal(placement.stubLeft, 52 + 41);
});

test("the strip flips to the left near the right edge", () => {
	const placement = placeEffectStrip({
		centre: 52, radius: 33, strip: { width: 260, height: 100 }, frame: { left: 1400, top: 300 }, viewport: { width: 1600, height: 900 },
	});
	assert.equal(placement.flip, true);
	assert.equal(placement.left, 52 - 41 - 16 - 260);
	assert.equal(placement.stubLeft, 52 - 41 - 16);
});

test("the strip is nudged to stay on screen at the top and bottom", () => {
	const top = placeEffectStrip({
		centre: 52, radius: 33, strip: { width: 260, height: 200 }, frame: { left: 100, top: 10 }, viewport: { width: 1600, height: 900 },
	});
	assert.equal(10 + top.top, 48, "keeps clear of the top controls");
	const bottom = placeEffectStrip({
		centre: 52, radius: 33, strip: { width: 260, height: 200 }, frame: { left: 100, top: 850 }, viewport: { width: 1600, height: 900 },
	});
	assert.equal(850 + bottom.top, 900 - 200 - 56, "keeps clear of the macro bar");
});
