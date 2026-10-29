import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../scripts/actor-display/npc-power-hints.js", import.meta.url), "utf8")
	.replace(/^export /gm, "");
const context = vm.createContext({
	CONFIG: { DND4E: { conditionTypes: { bloodied: "Bloodied", dazed: "Dazed", prone: "Prone", slowed: "Slowed", blinded: "Blinded" } },
		statusEffects: [{ id: "bloodied", name: "Bloodied" }, { id: "dazed", name: "Dazed" }, { id: "custom", name: "Custom condition" }] },
	game: { i18n: { localize: value => value } },
	document: { createElement: () => ({ set innerHTML(html) { this.textContent = html.replace(/<[^>]*>/g, " "); } }) },
});
vm.runInContext(source, context);
const npc = { document: { disposition: -1 } };

/** Build a scene PC with independent defenses. */
function pc(name, fort, ref, wil) {
	return { name, actor: { uuid: `Actor.${name}`, name, type: "Player Character",
		system: { defences: { fort: { value: fort }, ref: { value: ref }, wil: { value: wil } } } } };
}

/** Build a native-schema power. */
function power(def = "ref", extra = {}) {
	return { hasAttack: true, system: { actionType: "standard", attack: { isAttack: true, def },
		autoGenChatPowerCard: true, ...extra }, effects: [] };
}

test("scene PCs with tied lowest non-AC defenses appear once; higher defenses and NPCs do not", () => {
	const mira = pc("Mira", 20, 15, 15);
	const thorn = pc("Thorn", 21, 14, 18);
	const gale = pc("Gale", 12, 17, 19);
	const result = context.getNpcPowerHints(power(), npc, [mira, mira, thorn, gale,
		{ actor: { type: "NPC" } }, { actor: null }]);
	assert.equal(result.weakSummary, "Mira\nThorn");
	assert.match(result.weakTooltip, /Reflex/);
	assert.equal(result.hasPowerHints, true);
	assert.equal(context.getNpcPowerHints(power("wil"), npc, [mira]).weakSummary, "Mira");
});

test("friendly disposition, AC, unknown defense, utilities and empty scenes suppress weak PCs", () => {
	const party = [pc("Mira", 20, 15, 18)];
	for (const [item, token, tokens] of [
		[power(), { document: { disposition: 1 } }, party], [power("ac"), npc, party],
		[power("unknown"), npc, party], [{ ...power(), hasAttack: false }, npc, party],
		[power(), npc, []],
	]) {
		const result = context.getNpcPowerHints(item, token, tokens);
		assert.equal(result.weakSummary, "");
		assert.equal(result.weakTooltip, "");
		assert.equal(result.hasPowerHints, false);
	}
	assert.equal(context.getNpcPowerHints(power(), { document: { disposition: 0 } }, party).weakSummary, "Mira");
});

test("incomplete and nonnumeric defenses never create misleading weaknesses; numeric strings work", () => {
	for (const bad of [null, undefined, "", NaN, "unknown"]) {
		assert.equal(context.getNpcPowerHints(power(), npc, [pc("Mira", bad, 15, 18)]).weakSummary, "");
	}
	assert.equal(context.getNpcPowerHints(power(), npc, [pc("Mira", "20", "15", "18")]).weakSummary, "Mira");
});

test("action types are explicit, including interrupt and fallback", () => {
	for (const [key, expected] of Object.entries({ standard: "Standard", minor: "Minor", reaction: "Reaction",
		interrupt: "Interrupt", move: "Move", free: "Free", none: "No action", opportunity: "Opportunity", rest: "Rest", custom: "Other" })) {
		assert.equal(context.getNpcPowerHints(power("ac", { actionType: key }), npc).actionLabel, expected);
	}
});

test("native target statuses combine with explicit rules conditions without duplicates", () => {
	const item = power("ac", { hit: { detail: "<p>The target is <strong>dazed</strong> and slowed.</p>" },
		effect: { detail: "The attack knocks the target prone." } });
	item.effects = [{ system: { powerEffectType: "hit" }, statuses: new Set(["dazed", "custom"]) },
		{ system: { powerEffectType: "self" }, statuses: new Set(["blinded"]) },
		{ disabled: true, system: { powerEffectType: "hit" }, statuses: ["blinded"] },
		{ transfer: true, system: { powerEffectType: "hit" }, statuses: ["blinded"] }];
	assert.deepEqual(Array.from(context.getPowerConditions(item)), ["Dazed", "Custom condition", "Slowed", "Prone"]);
	const friendly = context.getNpcPowerHints(item, { document: { disposition: 1 } });
	assert.match(friendly.conditionSummary, /Dazed/);
	assert.equal(friendly.weakSummary, "");
});

test("requirements, negations, immunity, removed conditions and flavor are not condition applications", () => {
	const item = power("ac", { requirement: "The target is prone.", trigger: "An enemy is dazed.",
		description: { chat: "The creature is blinded." }, hit: { detail: "The target is not dazed. It is immune to slowed. The target is already prone. Remove blinded from the target." } });
	assert.deepEqual(Array.from(context.getPowerConditions(item)), []);
	// A condition applied until a turn ends still counts: the word 'ends' belongs to its duration.
	item.system.hit.detail = "The target is dazed (save ends).";
	assert.deepEqual(Array.from(context.getPowerConditions(item)), ["Dazed"]);
});

test("custom cards and miss rules supply explicit condition applications", () => {
	const item = power("ac", { autoGenChatPowerCard: false, description: { value: "<p>The target falls prone.</p>" },
		miss: { detail: "The target becomes slowed." } });
	assert.deepEqual(Array.from(context.getPowerConditions(item)), ["Slowed", "Prone"]);
});


test("Bloodied is omitted from native statuses and rules text while other conditions remain", () => {
	const item = power("ac", { hit: { detail: "The target is bloodied. The target is dazed." } });
	item.effects = [{ system: { powerEffectType: "hit" }, statuses: ["bloodied", "slowed"] }];
	assert.deepEqual(Array.from(context.getPowerConditions(item)), ["Slowed", "Dazed"]);
	item.system.hit.detail = "The target becomes bloodied.";
	item.effects[0].statuses = ["bloodied"];
	const result = context.getNpcPowerHints(item, npc);
	assert.equal(result.conditionSummary, "");
	assert.equal(result.hasPowerHints, false);
});


test("orange fallback lists all scene PCs tied for lowest targeted defense only when nobody is explicitly weak", () => {
	const mira = pc("Mira", 12, 16, 18);
	const thorn = pc("Thorn", 11, 16, 20);
	const gale = pc("Gale", 10, 19, 18);
	const fallback = context.getNpcPowerHints(power(), npc, [mira, mira, thorn, gale]);
	assert.equal(fallback.weakSummary, "Mira\nThorn");
	assert.equal(fallback.isWeakFallback, true);
	assert.equal(fallback.weakLabel, "Lowest");
	assert.match(fallback.weakTooltip, /Lowest Reflex/);
	assert.equal(fallback.hasPowerHints, true);
	const explicit = context.getNpcPowerHints(power(), npc, [mira, pc("Explicit", 25, 20, 22)]);
	assert.equal(explicit.weakSummary, "Explicit");
	assert.equal(explicit.isWeakFallback, false);
	assert.equal(explicit.weakLabel, "Weak");
	for (const [item, token, tokens] of [[power("ac"), npc, [mira]], [power(), { document: { disposition: 1 } }, [mira]], [power(), npc, []]]) {
		const result = context.getNpcPowerHints(item, token, tokens);
		assert.equal(result.isWeakFallback, false);
		assert.equal(result.weakSummary, "");
	}
});


test("hit percentages include defense equality, natural 1/20, fractions and per-PC defenses", () => {
	assert.equal(context.formatPowerHitChances([{ name: "Mira", value: 20 }, { name: "Thorn", value: 22 }], 10), "Mira (55%)\nThorn (45%)");
	for (const [bonus, expected] of [[100, 95], [-100, 5], [10.5, 55], [9.5, 50]]) {
		assert.equal(context.formatPowerHitChances([{ name: "Mira", value: 20 }], bonus), `Mira (${expected}%)`);
	}
	for (const bonus of [null, undefined, NaN, Infinity, "10"]) {
		assert.equal(context.formatPowerHitChances([{ name: "Mira", value: 20 }], bonus), "Mira");
	}
	const fallback = context.getNpcPowerHints(power(), npc, [pc("Mira", 12, 16, 18)]);
	assert.equal(context.formatPowerHitChances(fallback.weakTargets, 10), "Mira (75%)");
});
