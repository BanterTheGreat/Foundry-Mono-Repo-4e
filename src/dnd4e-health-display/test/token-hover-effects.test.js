import assert from "node:assert/strict";
import test from "node:test";
import { getEffectPresentation } from "../scripts/health-display/token-hover-effects.js";

/** A div whose textContent is its HTML with tags removed, enough for description parsing. */
const fakeDocument = {
	createElement: () => {
		let html = "";
		return {
			set innerHTML(value) {
				html = value;
			},
			get textContent() {
				return html.replace(/<[^>]*>/g, "");
			},
		};
	},
};

/** A started combat of four combatants where `acting` is the current index. */
function withCombat(acting, turns = [
	{ tokenId: "t-hero", actorId: "hero" },
	{ tokenId: "t-gob1", actorId: "goblin" },
	{ tokenId: "t-gob2", actorId: "goblin" },
	{ tokenId: "t-boss", actorId: "boss" },
]) {
	globalThis.game = { combat: { started: true, turn: acting, turns } };
}

const actorOf = (id, name, token) => ({ id, name, token, effects: [] });
const effectOf = (parent, name, extra = {}) => ({
	name,
	img: `${name}.png`,
	description: "",
	statuses: new Set(),
	isTemporary: true,
	disabled: false,
	isSuppressed: false,
	system: {},
	parent,
	...extra,
});

function present(actor, effects, useDescriptions = false) {
	actor.effects = effects;
	return getEffectPresentation(actor, useDescriptions).effects;
}

test.beforeEach(() => {
	globalThis.document = fakeDocument;
	globalThis.game = { combat: null };
	globalThis.fromUuidSync = () => null;
});

test("conditions are flagged and custom effects expose their description as plain text", () => {
	const hero = actorOf("hero", "Hero");
	const [dazed, wind] = present(hero, [
		effectOf(hero, "Dazed", { statuses: new Set(["dazed"]), description: "<p>Ignored</p>" }),
		effectOf(hero, "Second Wind", { description: "<p>+2 bonus to <b>all</b> defenses.</p>" }),
	]);
	assert.equal(dazed.isCondition, true);
	assert.equal(wind.isCondition, false);
	assert.equal(wind.description, "+2 bonus to all defenses.");
	assert.equal(wind.name, "Second Wind", "the title stays the effect name when descriptions are not requested");
});

test("the classic label mode is unchanged: descriptions replace names only for non-conditions", () => {
	const hero = actorOf("hero", "Hero");
	const [dazed, wind] = present(hero, [
		effectOf(hero, "Dazed", { statuses: new Set(["dazed"]), description: "Cannot flank" }),
		effectOf(hero, "Second Wind", { description: "+2 bonus to all defenses." }),
	], true);
	assert.equal(dazed.name, "Dazed");
	assert.equal(wind.name, "+2 bonus to all defenses.");
});

test("without a running combat nothing knows how many turns away an ending is", () => {
	const hero = actorOf("hero", "Hero");
	const [save, eot] = present(hero, [
		effectOf(hero, "Dazed", { system: { durationType: "saveEnd" } }),
		effectOf(hero, "Slowed", { system: { durationType: "endOfTargetTurn" } }),
	]);
	assert.deepEqual(save.ending, { type: "save", turnsAway: null });
	assert.equal(eot.ending.turnsAway, null);
	globalThis.game = { combat: { started: false, turn: 0, turns: [{ actorId: "hero" }] } };
	assert.equal(present(hero, [effectOf(hero, "Dazed", { system: { durationType: "saveEnd" } })])[0].ending.turnsAway, null,
		"an unstarted combat has no turn order to count");
});

test("save and target-turn endings count to the affected creature's turn", () => {
	withCombat(0);
	const boss = actorOf("boss", "Gorrak Ironjaw");
	const [save, eot, sot] = present(boss, [
		effectOf(boss, "Dazed", { system: { durationType: "saveEnd" } }),
		effectOf(boss, "Slowed", { system: { durationType: "endOfTargetTurn" } }),
		effectOf(boss, "Blessed", { system: { durationType: "startOfTargetTurn" } }),
	]);
	assert.deepEqual(save.ending, { type: "save", turnsAway: 3 });
	assert.deepEqual(eot.ending, { type: "endOfTurn", who: "Gorrak Ironjaw", turnsAway: 3 });
	assert.deepEqual(sot.ending, { type: "startOfTurn", who: "Gorrak Ironjaw", turnsAway: 3 });
});

test("an effect ending at the end of the acting creature's turn is this turn, but its start is a full round away", () => {
	withCombat(3);
	const boss = actorOf("boss", "Gorrak");
	const [end, start] = present(boss, [
		effectOf(boss, "Slowed", { system: { durationType: "endOfTargetTurn" } }),
		effectOf(boss, "Second Wind", { system: { durationType: "startOfTargetTurn" } }),
	]);
	assert.equal(end.ending.turnsAway, 0);
	assert.equal(start.ending.turnsAway, 4);
});

test("user-turn endings resolve the effect's source actor, and stay unknown when it cannot be found", () => {
	withCombat(0);
	const hero = actorOf("hero", "Kess Varro");
	const boss = actorOf("boss", "Gorrak Ironjaw");
	boss.documentName = "Actor";
	globalThis.fromUuidSync = (uuid) => (uuid === "Actor.boss" ? boss : null);
	const [known, unknown, start] = present(hero, [
		effectOf(hero, "Grabbed", { origin: "Actor.boss", system: { durationType: "endOfUserTurn" } }),
		effectOf(hero, "Marked", { origin: "Actor.gone", system: { durationType: "endOfUserTurn" } }),
		effectOf(hero, "Blinded", { origin: "Actor.boss", system: { durationType: "startOfUserTurn" } }),
	]);
	assert.deepEqual(known.ending, { type: "endOfTurn", who: "Gorrak Ironjaw", turnsAway: 3 });
	assert.deepEqual(unknown.ending, { type: "endOfTurn", who: "User", turnsAway: null });
	assert.deepEqual(start.ending, { type: "startOfTurn", who: "Gorrak Ironjaw", turnsAway: 3 });
});

test("unlinked tokens of one monster type are told apart by token id", () => {
	withCombat(0);
	const second = actorOf("goblin", "Goblin Cutthroat", { id: "t-gob2" });
	const first = actorOf("goblin", "Goblin Cutthroat", { id: "t-gob1" });
	assert.equal(present(second, [effectOf(second, "Dazed", { system: { durationType: "saveEnd" } })])[0].ending.turnsAway, 2);
	assert.equal(present(first, [effectOf(first, "Dazed", { system: { durationType: "saveEnd" } })])[0].ending.turnsAway, 1);
	const linked = actorOf("goblin", "Goblin Cutthroat");
	assert.equal(present(linked, [effectOf(linked, "Dazed", { system: { durationType: "saveEnd" } })])[0].ending.turnsAway, 1,
		"without a token id the first matching actor wins, as the initiative display does");
});

test("a creature outside the encounter has no turn distance", () => {
	withCombat(0);
	const stranger = actorOf("nobody", "Stranger");
	assert.equal(present(stranger, [effectOf(stranger, "Dazed", { system: { durationType: "saveEnd" } })])[0].ending.turnsAway, null);
});

test("encounter, custom and unrecognised durations", () => {
	const hero = actorOf("hero", "Hero");
	const [encounter, custom, customBare, none] = present(hero, [
		effectOf(hero, "Blessing", { system: { durationType: "endOfEncounter" } }),
		effectOf(hero, "Charm", { system: { durationType: "custom" }, duration: { label: "Until dawn" } }),
		effectOf(hero, "Curse", { system: { durationType: "custom" } }),
		effectOf(hero, "Odd", { system: {} }),
	]);
	assert.deepEqual(encounter.ending, { type: "encounter" });
	assert.deepEqual(custom.ending, { type: "custom", label: "Until dawn" });
	assert.deepEqual(customBare.ending, { type: "custom", label: "Custom" });
	assert.deepEqual(none.ending, { type: "none" });
});

test("the existing duration label used by the classic display is unchanged", () => {
	const hero = actorOf("hero", "Hero");
	const effects = present(hero, [
		effectOf(hero, "Dazed", { system: { durationType: "saveEnd" } }),
		effectOf(hero, "Blessing", { system: { durationType: "endOfEncounter" } }),
		effectOf(hero, "Slowed", { system: { durationType: "endOfTargetTurn" } }),
	]);
	assert.deepEqual(effects.map((entry) => entry.duration?.label), ["Save Ends", "Encounter", "EoT Hero"]);
});
