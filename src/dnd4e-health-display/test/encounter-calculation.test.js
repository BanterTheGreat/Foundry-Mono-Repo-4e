import assert from "node:assert/strict";
import test from "node:test";
import { getEncounterCalculation } from "../scripts/combat-start/encounter-calculation.js";

/** Build token-backed combatants with deliberately misleading statblock XP. */
function enemy(level, rank = "standard", overrides = {}) {
	return {
		id: "enemy", actorId: "enemy", name: "Enemy token", token: { disposition: -1 },
		actor: { name: "Enemy", hasPlayerOwner: false, system: { details: { level, role: { secondary: rank }, exp: 999999 } } },
		...overrides,
	};
}

/** Build player-owned tokens without depending on their disposition. */
function party(...levels) {
	return levels.map((level, index) => enemy(level, "standard", {
		id: `hero-${index}`, actorId: `hero-${index}`, name: `Hero ${index}`,
		actor: { hasPlayerOwner: true, system: { details: { level: { value: level } } } },
	}));
}

test("rank XP ignores statblocks and counts every token, including hidden duplicates", () => {
	const calculation = getEncounterCalculation({ combatants: [
		...party(3, 3, 3, 3, 3),
		enemy(3), enemy(3, "standard", { hidden: true }),
		enemy(3, "minion"), enemy(3, "elite"), enemy(3, "solo"),
		enemy(40, "solo", { token: { disposition: 0 } }),
		enemy(40, "solo", { token: { disposition: 1 } }),
	] });
	assert.equal(calculation.totalXP, 1388);
	assert.equal(calculation.enemyCount, 5);
	assert.equal(calculation.budget, 750);
	assert.equal(calculation.encounterLevel, 7);
	assert.equal(calculation.difficulty, "Hard");
	assert.deepEqual(calculation.enemyGroups.map(({ count, xp }) => ({ count, xp })), [
		{ count: 2, xp: 150 }, { count: 1, xp: 38 }, { count: 1, xp: 300 }, { count: 1, xp: 750 },
	]);
});

test("synthetic tokens of the same actor retain their own levels and ranks", () => {
	const calculation = getEncounterCalculation({ combatants: [...party(4, 5), enemy(3), enemy(4), enemy(4, "elite")] });
	assert.equal(calculation.partyLevel, 5);
	assert.equal(calculation.budget, 400);
	assert.equal(calculation.enemyGroups.length, 3);
	assert.equal(calculation.totalXP, 675);
});

test("Kassoon equality gaps resolve to Normal and encounter levels round upward", () => {
	for (const [xpEnemies, expectedXP, expectedLevel, difficulty] of [
		[[enemy(4, "solo")], 875, 4, "Normal"],
		[[enemy(6, "solo")], 1250, 6, "Normal"],
		[[enemy(6, "solo"), enemy(1, "minion")], 1275, 7, "Hard"],
		[[enemy(9, "solo")], 2000, 9, "Hard"],
		[[enemy(9, "solo"), enemy(1, "minion")], 2025, 10, "Extreme"],
		[[enemy(1)], 100, 1, "Trivial"],
		[[enemy(1, "solo")], 500, 1, "Easy"],
	]) {
		const calculation = getEncounterCalculation({ combatants: [...party(5, 5, 5, 5, 5), ...xpEnemies] });
		assert.equal(calculation.totalXP, expectedXP);
		assert.equal(calculation.encounterLevel, expectedLevel);
		assert.equal(calculation.difficulty, difficulty);
	}
});

test("empty encounters and missing party tokens do not invent a difficulty", () => {
	assert.equal(getEncounterCalculation(null).difficulty, "Unavailable");
	assert.equal(getEncounterCalculation({ combatants: [enemy(3)] }).encounterLevel, "—");
	assert.equal(getEncounterCalculation({ combatants: party(1) }).difficulty, "None");
	assert.equal(getEncounterCalculation({ combatants: [...party(1, 1, 1, 1, 1), enemy(1, "solo")] }).difficulty, "Normal");
});

test("invalid enemy data produces an explicit warning instead of a misleading rating", () => {
	for (const badEnemy of [enemy(0), enemy(41), enemy(3, "unknown"), { name: "Missing actor" }]) {
		const calculation = getEncounterCalculation({ combatants: [...party(5), badEnemy] });
		assert.equal(calculation.difficulty, "Unavailable");
		assert.equal(calculation.warnings.length, 1);
	}
});

test("high-level solos correct Kassoon's typo and encounters above the table remain Extreme", () => {
	assert.equal(getEncounterCalculation({ combatants: [...party(30), enemy(39, "solo")] }).totalXP, 475000);
	const calculation = getEncounterCalculation({ combatants: [...party(30), enemy(40, "solo")] });
	assert.equal(calculation.totalXP, 555000);
	assert.equal(calculation.encounterLevel, "40+");
	assert.equal(calculation.difficulty, "Extreme");
});
