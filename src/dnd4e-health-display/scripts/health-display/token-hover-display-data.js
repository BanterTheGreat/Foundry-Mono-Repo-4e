import { getEffectPresentation } from "./token-hover-effects.js";

const NPC_HEALTH_SEGMENTS = 4;
const PC_HEALTH_SEGMENTS = 6;

/**
 * Build hover-display presentation data without exposing exact hit point values.
 *
 * @param {Token} token The hovered token.
 * @returns {object}
 */
export function getTokenHoverDisplayData(token) {
	const actor = token.actor;
	const hp = actor.system?.attributes?.hp ?? {};
	const value = Number(hp.value);
	const maximum = Number(hp.max);
	const role = getSpecialRole(actor);
	const segmentCount = getHealthSegmentCount(actor, role);
	const filledSegments = getFilledSegments(value, maximum, segmentCount);
	const effectPresentation = getEffectPresentation(actor);
	const healthState = getHealthState(actor, role, value, maximum, filledSegments);

	return {
		name: token.name || actor.name,
		defeated: actor.type === "NPC" && Number.isFinite(value) && value <= 0,
		role,
		healthState,
		healthLabel: `Health: ${healthState}`,
		segmentCount,
		segments: Array.from({ length: segmentCount }, (_unused, index) => ({
			filled: index < filledSegments,
		})),
		...effectPresentation,
	};
}

/**
 * Choose health detail by actor type.
 *
 * @param {Actor} actor The displayed actor.
 * @param {{key: string}|null} role The actor's special role.
 * @returns {number}
 */
function getHealthSegmentCount(actor, role) {
	if (role?.key === "minion") {
		return 1;
	}

	return actor.type === "Player Character" ? PC_HEALTH_SEGMENTS : NPC_HEALTH_SEGMENTS;
}

/**
 * Convert hit points to an appropriate number of filled health segments.
 *
 * @param {number} value Current hit points.
 * @param {number} maximum Maximum hit points.
 * @param {number} [segmentCount=NPC_HEALTH_SEGMENTS] Number of segments in the bar.
 * @returns {number}
 */
function getFilledSegments(value, maximum, segmentCount = NPC_HEALTH_SEGMENTS) {
	if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0 || value <= 0) {
		return 0;
	}

	return Math.min(segmentCount, Math.ceil((value / maximum) * segmentCount));
}

/**
 * Convert the filled health segments into an actor-appropriate state label.
 *
 * @param {Actor} actor The displayed actor.
 * @param {{key: string}|null} role The actor's special role.
 * @param {number} value Current hit points.
 * @param {number} maximum Maximum hit points.
 * @param {number} filledSegments Number of filled health segments.
 * @returns {string}
 */
function getHealthState(actor, role, value, maximum, filledSegments) {
	if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) {
		return "Unknown";
	}

	if (value <= 0) {
		return "Defeated";
	}

	if (role?.key === "minion") {
		return "Alive";
	}

	const states = actor.type === "Player Character"
		? ["Defeated", "Critical", "Heavily Wounded", "Bloodied", "Hurt", "Scraped", "Healthy"]
		: ["Defeated", "Last Stand", "Bloodied", "Hurt", "Healthy"];

	return states[filledSegments] ?? "Healthy";
}

/**
 * Return only the special 4e monster classifications requested by the display.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {{key: string, label: string, icon?: string}|null}
 */
export function getSpecialRole(actor) {
	const role = actor.system?.details?.role ?? {};

	if (role.secondary === "solo" || role.primary === "solo") {
		return {
			key: "solo",
			label: "Solo",
			icon: "fa-solid fa-skull",
		};
	}

	if (role.leader) {
		return {
			key: "leader",
			label: "Leader",
			icon: "fa-solid fa-star",
		};
	}

	if (role.secondary === "elite" || role.primary === "elite") {
		return {
			key: "elite",
			label: "Elite",
			icon: "fa-solid fa-diamond",
		};
	}

	if (role.secondary === "minion" || role.primary === "minion") {
		return {
			key: "minion",
			label: "Minion",
		};
	}

	return null;
}
