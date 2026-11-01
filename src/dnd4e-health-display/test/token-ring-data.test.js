import assert from "node:assert/strict";
import test from "node:test";
import {
	MAX_EFFECT_ROWS,
	buildEffectRows,
	buildRingGeometry,
	buildTokenRingData,
	computeTurnsAway,
	describeEnding,
	placeEffectStrip,
	shortName,
	sortEffectRows,
} from "../scripts/health-display/token-ring-data.js";

const effect = (name, ending, extra = {}) => ({ name, img: `${name}.png`, isCondition: false, description: "", ending, ...extra });

test("the health arc has one path per segment, keeps fill flags, and notches the middle", () => {
	const geometry = buildRingGeometry([true, true, false, false], 56);
	assert.equal(geometry.segments.length, 4);
	assert.deepEqual(geometry.segments.map((segment) => segment.filled), [true, true, false, false]);
	assert.ok(geometry.segments.every((segment) => /^M[\d.]+ [\d.]+A/.test(segment.path)));
	assert.ok(geometry.notch, "multi-segment bars carry a bloodied notch");
	assert.match(geometry.bar, /^M[\d.]+ [\d.]+A/, "one continuous bar encloses the segments");
	assert.ok(geometry.segments.every((segment) => segment.delay === undefined), "nothing is animated");
	assert.equal(geometry.outer, 56 + 48, "the frame is the token plus padding on both sides");
});

test("a minion's single segment spans the whole arc with no notch or gap", () => {
	const geometry = buildRingGeometry([true], 56);
	assert.equal(geometry.segments.length, 1);
	assert.equal(geometry.notch, null);
	assert.match(geometry.segments[0].path, /A\S+ \S+ 0 1 1/, "290 degrees needs the large-arc flag");
	assert.ok(geometry.bar, "even a single segment sits in its bar");
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

test("ring data hides the state word for healthy creatures and keeps the role and a minimum size", () => {
	const base = {
		name: "Gorrak", healthLabel: "Health: Bloodied", segments: [{ filled: true }, { filled: true }, { filled: false }, { filled: false }],
		role: { key: "elite", label: "Elite", icon: "fa-solid fa-diamond" }, turnDistance: { count: 3, label: "Acts in 3 turns" }, effects: [],
	};
	const hurt = buildTokenRingData({ ...base, healthState: "Bloodied" }, { size: 10 });
	assert.equal(hurt.stateLabel, "Bloodied");
	assert.equal(hurt.size, 44, "tiny zoomed-out tokens still get a readable ring");
	assert.equal(hurt.role.key, "elite");
	assert.equal(hurt.turnDistance, undefined, "the plate no longer carries the initiative counter");
	assert.equal(hurt.animate, undefined, "the ring is not animated");
	assert.equal(hurt.plateTop, 24 + 44 + 4);
	for (const healthState of ["Healthy", "Alive"]) {
		assert.equal(buildTokenRingData({ ...base, healthState }, { size: 80 }).stateLabel, "");
	}
	assert.equal(buildTokenRingData({ ...base, healthState: "Healthy", role: undefined }, { size: 80 }).role, null);
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
