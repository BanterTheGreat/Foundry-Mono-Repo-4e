import assert from "node:assert/strict";
import test from "node:test";
import {
	assignAttackers, resolveDemands, groupCountProblems, supportsGroupAttack, snapshotFormFields, diffFormFields, applyFormChanges,
} from "../scripts/power-activation/multi-attack.js";

/** Deterministic pseudo-random source so shuffles are reproducible. */
function seeded(seed) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

/** Check every invariant an assignment must keep, whatever order it was found in. */
function assertValid(result, { demands, perAttacker, canReach }) {
	const counts = new Map();
	for (const [attacker, targets] of result.assignments) {
		assert.ok(targets.length <= perAttacker, `${attacker} attacks too many targets`);
		assert.equal(new Set(targets).size, targets.length, `${attacker} attacks one target twice`);
		for (const target of targets) {
			assert.ok(canReach(attacker, target), `${attacker} cannot reach ${target}`);
			counts.set(target, (counts.get(target) ?? 0) + 1);
		}
	}

	for (const [target, demand] of demands) {
		assert.equal(counts.get(target) ?? 0, demand, `${target} should receive ${demand} attackers`);
	}
}

test("three minions with a one-target power can all focus the same creature", () => {
	const demands = new Map([["boss", 3]]);
	for (let seed = 1; seed <= 20; seed++) {
		const config = { attackers: ["a", "b", "c"], demands, perAttacker: 1, canReach: () => true, random: seeded(seed) };
		const result = assignAttackers(config);
		assert.equal(result.ok, true);
		assertValid(result, config);
	}
});

test("a three-target power lets three minions make nine attacks, even on one creature each time", () => {
	const demands = new Map([["x", 3], ["y", 3], ["z", 3]]);
	for (let seed = 1; seed <= 20; seed++) {
		const config = { attackers: ["a", "b", "c"], demands, perAttacker: 3, canReach: () => true, random: seeded(seed) };
		const result = assignAttackers(config);
		assert.equal(result.ok, true);
		assertValid(result, config);
		for (const targets of result.assignments.values()) {
			assert.equal(targets.length, 3);
		}
	}
});

test("assignment is random between runs but always valid", () => {
	const demands = new Map([["x", 2], ["y", 2]]);
	const seen = new Set();
	for (let seed = 1; seed <= 40; seed++) {
		const config = { attackers: ["a", "b", "c", "d"], demands, perAttacker: 1, canReach: () => true, random: seeded(seed) };
		const result = assignAttackers(config);
		assertValid(result, config);
		seen.add(JSON.stringify([...result.assignments]));
	}

	assert.ok(seen.size > 1, "different seeds should produce different attacker choices");
});

test("assignment rearranges earlier choices so range-limited attackers still fit", () => {
	const reach = { a: ["x"], b: ["x", "y"] };
	const demands = new Map([["x", 1], ["y", 1]]);
	for (let seed = 1; seed <= 30; seed++) {
		const config = { attackers: ["a", "b"], demands, perAttacker: 1, canReach: (attacker, target) => reach[attacker].includes(target), random: seeded(seed) };
		const result = assignAttackers(config);
		assert.equal(result.ok, true, `seed ${seed}`);
		assertValid(result, config);
		assert.deepEqual(result.assignments.get("a"), ["x"]);
	}
});

test("an unreachable demand is reported with the missing attacker count", () => {
	const result = assignAttackers({
		attackers: ["a", "b", "c"], demands: new Map([["far", 2], ["near", 1]]), perAttacker: 1,
		canReach: (attacker, target) => target === "near" || attacker === "a", random: seeded(3),
	});
	assert.equal(result.ok, false);
	assert.equal(result.shortfalls.get("far"), 1);
	assert.equal(result.shortfalls.has("near"), false);
});

test("a target cannot be demanded more times than there are attackers", () => {
	const result = assignAttackers({ attackers: ["a", "b"], demands: new Map([["x", 3]]), perAttacker: 5, canReach: () => true });
	assert.equal(result.ok, false);
	assert.equal(result.shortfalls.get("x"), 1);
});

test("default demands share the attack slots, keep typed values and never drop below one attacker", () => {
	assert.deepEqual([...resolveDemands(["a"], new Map(), 3, 3)], [["a", 3]]);
	assert.deepEqual([...resolveDemands(["a", "b", "c"], new Map(), 3, 3)], [["a", 1], ["b", 1], ["c", 1]]);
	assert.deepEqual([...resolveDemands(["a", "b"], new Map(), 3, 3)], [["a", 1], ["b", 2]]);
	assert.deepEqual([...resolveDemands(["a", "b"], new Map([["a", 2]]), 3, 3)], [["a", 2], ["b", 1]]);
	assert.deepEqual([...resolveDemands(["a", "b", "c", "d"], new Map(), 3, 3)], [["a", 1], ["b", 1], ["c", 1], ["d", 1]]);
	assert.deepEqual([...resolveDemands(["a"], new Map([["a", 9]]), 9, 3)], [["a", 3]], "one attacker cannot attack twice");
});

test("count problems require every slot in exact mode and at least one attack in up-to mode", () => {
	assert.deepEqual(groupCountProblems(new Map([["a", 2], ["b", 1]]), 3), []);
	assert.equal(groupCountProblems(new Map([["a", 2]]), 3).length, 1);
	assert.equal(groupCountProblems(new Map([["a", 2]]), 3, "upTo").length, 0);
	assert.equal(groupCountProblems(new Map([["a", 4]]), 3, "upTo").length, 1);
	assert.equal(groupCountProblems(new Map([["a", 0]]), 3, "upTo").length, 1);
});

/** Build a minimal token whose actor owns one copy of a power. */
function token(uuid, itemId = "power") {
	return { actor: { uuid, items: new Map(itemId ? [[itemId, { type: "power" }]] : []) } };
}

test("group attacks need a supported range type and one distinct actor per creature", () => {
	const item = (rangeType, extra = {}) => ({ id: "power", type: "power", hasAttack: true, system: { rangeType }, ...extra });
	const tokens = [token("Scene.s.Token.a.Actor.x"), token("Scene.s.Token.b.Actor.x")];
	for (const rangeType of ["melee", "touch", "reach", "weapon", "range"]) {
		assert.equal(supportsGroupAttack(item(rangeType), tokens), true, rangeType);
	}
	for (const rangeType of ["closeBurst", "closeBlast", "rangeBurst", "rangeBlast", "wall", "personal"]) {
		assert.equal(supportsGroupAttack(item(rangeType), tokens), false, rangeType);
	}
	assert.equal(supportsGroupAttack(item("melee", { hasAttack: false }), tokens), false);
	assert.equal(supportsGroupAttack(item("melee"), tokens.slice(0, 1)), false);
	assert.equal(supportsGroupAttack(item("melee"), [token("Actor.x"), token("Actor.x")]), false, "linked duplicates share one actor");
	assert.equal(supportsGroupAttack(item("melee"), [token("a"), token("b", null)]), false, "every attacker needs the power");
});

/** Build a form whose controls behave like DOM inputs. */
function form(fields) {
	return { elements: fields.map(field => ({ type: "text", ...field })) };
}

test("only the manual dialog edits are shared; automatic defaults stay per attacker", () => {
	const first = form([{ name: "0.cover", type: "checkbox", checked: true, value: "on" }, { name: "0.comAdv", type: "checkbox", checked: false, value: "on" },
		{ name: "bonus", value: "" }, { name: "d20", value: "1" }]);
	const before = snapshotFormFields(first);
	first.elements[1].checked = true;
	first.elements[2].value = "+2";
	const changes = diffFormFields(before, snapshotFormFields(first));
	assert.deepEqual(changes.map(change => change.name), ["0.comAdv", "bonus"]);

	const later = form([{ name: "0.cover", type: "checkbox", checked: false, value: "on" }, { name: "0.comAdv", type: "checkbox", checked: false, value: "on" },
		{ name: "bonus", value: "" }, { name: "d20", value: "1" }]);
	applyFormChanges(later, changes);
	assert.equal(later.elements[0].checked, false, "cover stays as that attacker's own default");
	assert.equal(later.elements[1].checked, true);
	assert.equal(later.elements[2].value, "+2");
});

test("per-target tab edits fall back to the first tab when the later attacker has fewer targets", () => {
	const later = form([{ name: "0.cover", type: "checkbox", checked: false, value: "on" }]);
	applyFormChanges(later, [{ name: "2.cover", checked: true, value: "on" }, { name: "5.missing", checked: true, value: "on" }]);
	assert.equal(later.elements[0].checked, true);
});
