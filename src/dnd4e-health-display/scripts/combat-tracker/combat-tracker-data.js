/**
 * Build template data for the compact combat tracker HUD.
 *
 * @param {Combat|null} combat The encounter to display.
 * @param {boolean} isGM Whether the current user is a GM.
 * @returns {{round: number, combatants: Array<object>, hasCombatants: boolean}}
 */
export function getCombatTrackerData(combat, isGM) {
	const combatants = Array.from(combat?.turns ?? combat?.combatants ?? [])
		.filter((combatant) => isGM || !isCombatantHidden(combatant))
		.map((combatant) => getCombatantRowData(combatant, combat, isGM));

	return {
		round: combat?.round ?? 1,
		combatants,
		hasCombatants: combatants.length > 0,
	};
}

/** @param {Combatant} combatant @param {Combat} combat @param {boolean} isGM @returns {object} */
function getCombatantRowData(combatant, combat, isGM) {
	const actor = combatant.actor;
	const hp = actor?.system?.attributes?.hp;
	const hasHp = hp?.max != null;
	const hpValue = Number(hp?.value) || 0;
	const hpMaximum = Math.max(Number(hp?.max) || 0, 1);
	const isDefeated = Boolean(combatant.isDefeated);

	return {
		id: combatant.id,
		name: combatant.name,
		img: combatant.img || actor?.img || "icons/svg/mystery-man.svg",
		initiative: combatant.initiative == null ? "—" : Math.round(combatant.initiative),
		hasHp,
		hp: {
			value: hpValue,
			maximum: hpMaximum,
			percent: getResourcePercent(hpValue, hpMaximum),
			bloodied: hasHp && hpValue > 0 && hpValue <= hpMaximum / 2,
		},
		canEditHp: hasHp && (isGM || combatant.isOwner),
		isCurrent: combat?.combatant?.id === combatant.id,
		isDefeated,
		isHidden: isCombatantHidden(combatant),
		conditions: getConditionIcons(actor),
	};
}

/** @param {Actor|null} actor @returns {Array<{img: string, name: string}>} */
function getConditionIcons(actor) {
	if (!actor) {
		return [];
	}

	return Array.from(actor.effects ?? [])
		.filter((effect) => !effect.disabled && !effect.isSuppressed)
		.map((effect) => ({ img: effect.img, name: effect.name }))
		.slice(0, 6);
}

/** @param {number} value The current resource. @param {number} maximum The resource maximum. */
function getResourcePercent(value, maximum) {
	return Math.min(100, Math.max(0, (value / maximum) * 100));
}

/** @param {Combatant} combatant @returns {boolean} */
function isCombatantHidden(combatant) {
	return Boolean(combatant.hidden || combatant.token?.hidden);
}
