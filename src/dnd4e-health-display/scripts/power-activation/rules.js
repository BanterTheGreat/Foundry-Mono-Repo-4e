import { AREA_TYPES } from "./area-geometry.js";

export const MODULE_ID = "dnd4e-health-display";
export const SETTING = "enablePowerTargetAutomation";
export const FLAG = "targetAutomation";

/** Read portable, per-item automation configuration. */
export function automationConfig(item) {
	const config = item.getFlag(MODULE_ID, FLAG) ?? {};
	return {
		enabled: config.enabled === true, targetCount: Number(config.targetCount ?? 1),
		targetCountMode: config.targetCountMode === "upTo" ? "upTo" : "exact",
		targetMode: config.targetMode === "exact" ? "exact" : "area",
		targetDisposition: ["allies", "enemies"].includes(config.targetDisposition) ? config.targetDisposition : "all",
		includeCaster: config.includeCaster === true,
		targetCondition: typeof config.targetCondition === "string" ? config.targetCondition : "",
		targetAdjacent: ["allies", "enemies"].includes(config.targetAdjacent) ? config.targetAdjacent : "",
		summonActor: typeof config.summonActor === "string" ? config.summonActor : "",
		placementMode: config.placementMode === "summon" ? "summon" : "targets",
		originActors: Array.isArray(config.originActors) ? config.originActors.filter(uuid => typeof uuid === "string") : [],
		originMode: config.originMode === "custom" || (config.originMode !== "character" && config.originActors?.length > 0) ? "custom" : "character",
		allowCaster: config.allowCaster !== false,
		placeRegion: config.placeRegion === true,
		wallSolid: config.wallSolid === true,
		wallHeight: Number(config.wallHeight ?? 1),
	};
}

/** Resolve custom origins as a replacement for the character-wide list. */
export function powerOriginRules(item) {
	const config = automationConfig(item);
	if (config.originMode === "custom") {
		return { originActors: config.originActors, allowCaster: config.allowCaster };
	}
	const actors = item.actor?.getFlag?.(MODULE_ID, FLAG)?.originActors;
	return { originActors: Array.isArray(actors) ? actors.filter(uuid => typeof uuid === "string") : [], allowCaster: true };
}

/** Count squares between occupied token footprints, with equal-cost diagonals. */
export function squareDistance(source, target, size) {
	const gap = (a, lengthA, b, lengthB) => Math.max(0, b - a - lengthA + size, a - b - lengthB + size) / size;
	return Math.max(gap(source.x, source.w, target.x, target.w), gap(source.y, source.h, target.y, target.h));
}

/**
 * Enforce condition and adjacency requirements using visible scene creatures.
 * Adjacency includes diagonals and uses the target's disposition and elevation.
 */
export function targetFilterProblems(target, config, tokens, size) {
	const problems = [];
	const name = target.visible ? target.name : "Unavailable target";
	if (config.targetCondition && !target.actor?.statuses?.has(config.targetCondition)) {
		problems.push(`${name} requires condition: ${config.targetCondition}.`);
	}
	if (config.targetAdjacent) {
		const disposition = Number(target.document.disposition);
		const required = config.targetAdjacent === "allies" ? disposition : -disposition;
		const adjacent = Math.abs(disposition) === 1 && tokens.some(other => other !== target && other.id !== target.id
			&& other.visible && other.actor && Number(other.document.disposition) === required
			&& Number(other.document.elevation) === Number(target.document.elevation)
			&& squareDistance(target, other, size) === 1);
		if (!adjacent) {
			problems.push(`${name} must be adjacent to one of its ${config.targetAdjacent}.`);
		}
	}
	return problems;
}

/**
 * Validate distinct creature counts independently of area selection.
 * Counted powers require at least one target, including in up-to mode.
 */
export function targetCountProblems(selected, required, mode = "exact") {
	if (mode === "upTo") {
		return selected < 1 || selected > required
			? [`Selected ${selected} targets; this power expects 1 to ${required}.`] : [];
	}
	return selected !== required
		? [`Selected ${selected} targets; this power expects exactly ${required}.`] : [];
}

/** Report advisory problems without discarding selected tokens. */
export function selectionProblems(source, targets, range, required, size, countMode = "exact") {
	const problems = targetCountProblems(targets.length, required, countMode);
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
	if (config.enabled && config.placementMode === "summon") {
		return Boolean(config.summonActor) && !item.hasAttack;
	}
	return config.enabled && ["weapon", "melee", "touch", "reach", "range", ...AREA_TYPES].includes(item.system.rangeType)
		&& ((AREA_TYPES.includes(item.system.rangeType) && config.targetMode !== "exact")
			|| (Number.isInteger(config.targetCount) && config.targetCount > 0));
}
