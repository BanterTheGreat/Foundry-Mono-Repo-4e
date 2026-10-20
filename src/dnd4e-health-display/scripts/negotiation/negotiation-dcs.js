/** Easy DCs transcribed from modern-4e/glossary/skill_checks.typ, levels 1–30. */
const EASY_DCS = [7, 8, 8, 9, 10, 10, 11, 11, 12, 13, 14, 15, 15, 16, 17, 17, 18, 18, 19, 20, 21, 22, 22, 23, 24, 24, 25, 25, 26, 27];

/**
 * Calculate the usual negotiation DC from distinct PC actors in the viewed scene.
 * Duplicate tokens do not increase a hero's weight. Missing levels are reported, never assumed.
 * A manual level uses its own printed DC row, rather than adding to the calculated DC.
 */
export function negotiationDcs(tokens, overrideLevel = 0) {
	const seen = new Set();
	const levels = [];
	let missingLevels = 0;
	for (const token of tokens) {
		const actor = token.actor;
		if (actor?.type !== 'Player Character') {
			continue;
		}
		const key = token.actorId ?? actor.uuid ?? actor.id ?? token.id;
		if (key && seen.has(key)) {
			continue;
		}
		seen.add(key);
		const raw = actor.system?.details?.level;
		const level = Number(raw?.value ?? raw);
		if (!Number.isInteger(level) || level < 1 || level > 30) {
			missingLevels += 1;
			continue;
		}
		levels.push(level);
	}
	const partyLevel = levels.length ? Math.round(levels.reduce((sum, n) => sum + n, 0) / levels.length) : null;
	const manual = Number(overrideLevel);
	const level = Number.isInteger(manual) && manual >= 1 && manual <= 30 ? manual : partyLevel;
	const easy = level === null ? null : EASY_DCS[level - 1];
	return { partyLevel, level, count: levels.length, missingLevels, easy, normal: easy === null ? null : easy + 5, hard: easy === null ? null : easy + 10 };
}
