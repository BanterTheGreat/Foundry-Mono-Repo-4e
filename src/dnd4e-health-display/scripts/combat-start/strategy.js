const MODULE_ID = "dnd4e-health-display";
const STRATEGY_FLAG = "strategy";

/** @returns {{environment: string[], pointers: Array<{id: string, notes: string[], combatantIds: string[]}>}} */
export function getDefaultStrategy() {
	return { environment: [], pointers: [] };
}

/** @param {Combat|null} combat @returns {object} The encounter's saved strategy notes. */
export function getStrategy(combat) {
	return foundry.utils.mergeObject(getDefaultStrategy(), combat?.getFlag(MODULE_ID, STRATEGY_FLAG) ?? {}, { inplace: false });
}

/** @param {Combat} combat @param {object} strategy @returns {Promise} */
export function setStrategy(combat, strategy) {
	return combat.setFlag(MODULE_ID, STRATEGY_FLAG, strategy);
}
