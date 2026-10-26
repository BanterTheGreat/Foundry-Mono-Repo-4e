import { AREA_TYPES } from "./area-geometry.js";

export const MODULE_ID = "dnd4e-health-display";
export const SETTING = "enablePowerTargetAutomation";
export const FLAG = "targetAutomation";

/** Read portable, per-item automation configuration. */
export function automationConfig(item) {
	const config = item.getFlag(MODULE_ID, FLAG) ?? {};
	return {
		enabled: config.enabled === true, targetCount: Number(config.targetCount ?? 1),
		targetMode: config.targetMode === "exact" ? "exact" : "area",
		targetDisposition: ["allies", "enemies"].includes(config.targetDisposition) ? config.targetDisposition : "all",
		includeCaster: config.includeCaster === true,
		placeRegion: config.placeRegion === true,
	};
}

/** Count squares between occupied token footprints, with equal-cost diagonals. */
export function squareDistance(source, target, size) {
	const gap = (a, lengthA, b, lengthB) => Math.max(0, b - a - lengthA + size, a - b - lengthB + size) / size;
	return Math.max(gap(source.x, source.w, target.x, target.w), gap(source.y, source.h, target.y, target.h));
}

/** Report advisory problems without discarding selected tokens. */
export function selectionProblems(source, targets, range, required, size) {
	const problems = [];
	if (targets.length !== required) {
		problems.push(`Selected ${targets.length} targets; this power expects exactly ${required}.`);
	}
	for (const token of targets) {
		if (!token.actor || !token.visible) {
			problems.push("A selected target is unavailable.");
			continue;
		}
		if (squareDistance(source, token, size) > range.maximum) {
			problems.push(`${token.name} is outside range ${range.maximum}.`);
		}
		if (Number(source.document.elevation) !== Number(token.document.elevation)) {
			problems.push(`${token.name} has a different elevation; check range manually.`);
		}
	}
	return problems;
}

/** Whether this power is configured for the supported targeting workflow. */
export function supportsTargetAutomation(item) {
	const config = automationConfig(item);
	return config.enabled && ["weapon", "melee", "touch", "reach", "range", ...AREA_TYPES].includes(item.system.rangeType)
		&& ((AREA_TYPES.includes(item.system.rangeType) && config.targetMode !== "exact")
			|| (Number.isInteger(config.targetCount) && config.targetCount > 0));
}
