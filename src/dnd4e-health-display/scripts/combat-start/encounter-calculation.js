// Kassoon's standard-monster XP table, indexed by level. Rank costs are derived
// here rather than reading statblock XP (also correcting its level 39 solo typo).
const STANDARD_XP = [
	0,
	100, 125, 150, 175, 200, 250, 300, 350, 400, 500,
	600, 700, 800, 1000, 1200, 1400, 1600, 2000, 2400, 2800,
	3200, 4150, 5100, 6050, 7000, 9000, 11000, 13000, 15000, 19000,
	23000, 27000, 31000, 39000, 47000, 55000, 63000, 79000, 95000, 111000,
];
const RANK_MULTIPLIERS = { standard: 1, minion: 0.25, elite: 2, solo: 5 };

/** Return the shared level/rank importance, or null for invalid encounter data. */
export function getEncounterWeight(level, rank = "standard") {
	if (!Number.isInteger(level) || level < 1 || level > 40 || !Object.hasOwn(RANK_MULTIPLIERS, rank)) {
		return null;
	}
	return Math.round(STANDARD_XP[level] * RANK_MULTIPLIERS[rank]);
}

/**
 * Calculate encounter strength from its added tokens, including hidden enemies.
 * Player-owned actors form the party; hostile non-player actors form the opposition.
 * Mixed-level parties use their average level rounded up.
 *
 * @param {Combat|null} combat
 * @param {number} hostileDisposition
 * @returns {object} Template-ready totals and an enemy breakdown.
 */
export function getEncounterCalculation(combat, hostileDisposition = -1) {
	const party = [];
	const groups = new Map();
	const warnings = [];
	let totalXP = 0;
	let enemyCount = 0;
	for (const combatant of combat?.combatants ?? []) {
		const actor = combatant.actor;
		if (!actor) {
			warnings.push(`${combatant.name ?? "Token"} has no actor and cannot be calculated.`);
			continue;
		}
		const rawLevel = Number(actor.system?.details?.level?.value ?? actor.system?.details?.level ?? actor.system?.level);
		const validLevel = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 40;
		if (actor.hasPlayerOwner) {
			party.push({ name: combatant.name, level: validLevel ? rawLevel : "Unknown" });
			if (!validLevel) {
				warnings.push(`${combatant.name} needs a level from 1 to 40.`);
			}
			continue;
		}
		if (combatant.token?.disposition !== hostileDisposition) {
			continue;
		}
		enemyCount += 1;
		const rank = actor.system?.details?.role?.secondary || "standard";
		const validRank = Object.hasOwn(RANK_MULTIPLIERS, rank);
		const xp = getEncounterWeight(rawLevel, rank);
		if (xp === null) {
			warnings.push(`${combatant.name} needs a level from 1 to 40 and a standard, minion, elite, or solo rank.`);
		}
		const key = JSON.stringify([combatant.actorId ?? actor.id ?? combatant.id, rawLevel, rank]);
		const group = groups.get(key) ?? {
			name: actor.name ?? combatant.name,
			level: validLevel ? rawLevel : "Unknown",
			rank: validRank ? rank[0].toUpperCase() + rank.slice(1) : "Unknown",
			count: 0,
			xp: xp ?? "—",
			totalXP: xp === null ? "—" : 0,
		};
		group.count += 1;
		if (xp !== null) {
			group.totalXP += xp;
			totalXP += xp;
		}
		groups.set(key, group);
	}

	const partyLevel = party.length && party.every((member) => Number.isInteger(member.level))
		? Math.ceil(party.reduce((sum, member) => sum + member.level, 0) / party.length)
		: null;
	const ready = partyLevel !== null && warnings.length === 0;
	const budget = partyLevel === null ? null : party.length * STANDARD_XP[partyLevel];
	let encounterLevel = null;
	let difference = null;
	let difficulty = ready ? "None" : "Unavailable";
	if (ready && totalXP > 0) {
		encounterLevel = STANDARD_XP.findIndex((xp) => xp * party.length >= totalXP);
		if (encounterLevel < 0) {
			encounterLevel = "40+";
		} else {
			const delta = encounterLevel - partyLevel;
			difference = delta >= 0 ? `+${delta}` : String(delta);
		}
		difficulty = getDifficulty(totalXP, party.length, partyLevel);
	}
	return {
		party, partyCount: party.length, partyLevel: partyLevel ?? "—",
		enemyGroups: Array.from(groups.values()), enemyCount,
		totalXP, budget: budget ?? "—", encounterLevel: encounterLevel ?? "—",
		difference, difficulty, warnings, hasParty: party.length > 0,
	};
}

/**
 * Apply Kassoon's XP thresholds with deterministic equality boundaries.
 * Normal includes both of the site's otherwise unhandled equality cases.
 *
 * @param {number} xp
 * @param {number} size
 * @param {number} level
 * @returns {string}
 */
function getDifficulty(xp, size, level) {
	const budget = size * STANDARD_XP[level];
	const trivial = level > 4 ? size * STANDARD_XP[level - 4] : budget - 300;
	const easy = level > 1 ? size * STANDARD_XP[level - 1] : budget - 150;
	const normal = level < 40 ? size * STANDARD_XP[level + 1] : 111000 * size + 222000;
	const hard = level + 4 <= 40 ? size * STANDARD_XP[level + 4] : 111000 * size + 333000;
	if (xp > hard) {
		return "Extreme";
	}
	if (xp > normal) {
		return "Hard";
	}
	if (xp < trivial) {
		return "Trivial";
	}
	if (xp < easy) {
		return "Easy";
	}
	return "Normal";
}
