import { readFileSync } from "node:fs";
import { getEncounterCalculation } from "../../../../src/dnd4e-health-display/scripts/combat-start/encounter-calculation.js";

/** Validate one roster level before constructing a combatant. */
function validateLevel(level) {
	if (!Number.isInteger(level) || level < 1 || level > 40) {
		throw new Error("Levels must be integers from 1 to 40.");
	}
}

/** Adapt an explicit roster to the Battle Briefing's token-shaped input. */
function calculate(roster) {
	if (!roster || !Array.isArray(roster.party) || !Array.isArray(roster.enemies)) {
		throw new Error("Supply party (PC levels) and enemies (enemy groups) arrays.");
	}
	const combatants = roster.party.map((level, index) => {
		validateLevel(level);
		return {
			name: `PC ${index + 1}`,
			actor: { hasPlayerOwner: true, system: { details: { level } } },
		};
	});
	for (const [index, group] of roster.enemies.entries()) {
		if (!group || typeof group !== "object" || Array.isArray(group)) {
			throw new Error("Each enemy group must be an object.");
		}
		validateLevel(group.level);
		const rank = group.rank === undefined ? "standard" : group.rank;
		const count = group.count === undefined ? 1 : group.count;
		if (!["standard", "minion", "elite", "solo"].includes(rank)) {
			throw new Error("Enemy rank must be standard, minion, elite, or solo.");
		}
		if (!Number.isSafeInteger(count) || count < 1) {
			throw new Error("Enemy count must be a positive safe integer.");
		}
		for (let instance = 0; instance < count; instance += 1) {
			combatants.push({
				actorId: `enemy-${index}`,
				name: group.name ?? `Enemy group ${index + 1}`,
				token: { disposition: -1 },
				actor: {
					name: group.name ?? `Enemy group ${index + 1}`,
					hasPlayerOwner: false,
					system: { details: { level: group.level, role: { secondary: rank } } },
				},
			});
		}
	}
	return getEncounterCalculation({ combatants });
}

try {
	const roster = JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
	console.log(JSON.stringify(calculate(roster), null, 2));
} catch (error) {
	console.error(`Encounter calculation failed: ${error.message}`);
	process.exitCode = 1;
}
