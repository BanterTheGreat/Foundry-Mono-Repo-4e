export const GM_HUD_MERGED_CHANGE_HOOK = "dnd4eGmHorizontalHudMergedChanged";

let merged = false;

/** @returns {boolean} Whether the GM's combat tracker and Combat Pointers are currently embedded in the horizontal HUD, and should not also float as separate windows. */
export function isGmCombatMergedIntoHorizontalHud() {
	return merged;
}

/** @param {boolean} value The new merged state. */
export function setGmCombatMergedIntoHorizontalHud(value) {
	if (merged === value) {
		return;
	}

	merged = value;
	Hooks.callAll(GM_HUD_MERGED_CHANGE_HOOK, merged);
}
