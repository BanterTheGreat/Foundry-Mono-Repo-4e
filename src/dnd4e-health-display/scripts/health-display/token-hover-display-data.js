import { getEffectPresentation } from "./token-hover-effects.js";

const NPC_HEALTH_SEGMENTS = 4;
const PC_HEALTH_SEGMENTS = 6;

/**
 * Build hover-display presentation data without exposing exact hit point values.
 *
 * @param {Token} token The hovered token.
 * @param {object} options Current presentation options.
 * @param {boolean} options.useEffectDescriptions Whether effect descriptions replace names.
 * @param {boolean} options.expandTraits Whether NPC trait descriptions are fully expanded.
 * @param {boolean} options.showTraits Whether NPC trait descriptions should be included.
 * @returns {object}
 */
export function getTokenHoverDisplayData(token, { useEffectDescriptions, expandTraits, showTraits }) {
	const actor = token.actor;
	const hp = actor.system?.attributes?.hp ?? {};
	const value = Number(hp.value);
	const maximum = Number(hp.max);
	const role = getSpecialRole(actor);
	const segmentCount = getHealthSegmentCount(actor);
	const filledSegments = getFilledSegments(value, maximum, segmentCount);
	const effectPresentation = getEffectPresentation(actor, useEffectDescriptions);
	const healthState = getHealthState(actor, value, maximum, filledSegments);

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
		turnDistance: getTurnDistance(token),
		traits: showTraits ? getNpcTraits(actor) : [],
		expandTraits,
		...effectPresentation,
	};
}

/**
 * Choose health detail by actor type.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {number}
 */
function getHealthSegmentCount(actor) {
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
 * @param {number} value Current hit points.
 * @param {number} maximum Maximum hit points.
 * @param {number} filledSegments Number of filled health segments.
 * @returns {string}
 */
function getHealthState(actor, value, maximum, filledSegments) {
	if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) {
		return "Unknown";
	}

	if (value <= 0) {
		return "Defeated";
	}

	const states = actor.type === "Player Character"
		? ["Defeated", "Critical", "Heavily Wounded", "Bloodied", "Hurt", "Scraped", "Healthy"]
		: ["Defeated", "Last Stand", "Bloodied", "Hurt", "Healthy"];

	return states[filledSegments] ?? "Healthy";
}

/**
 * Count initiative slots from the active combatant to this token's next turn.
 *
 * @param {Token} token The displayed token.
 * @returns {{label: string, count: number}|null}
 */
function getTurnDistance(token) {
	const combat = game.combat;
	const turns = combat?.turns ?? [];
	const currentIndex = Number(combat?.turn);

	if (!combat?.started || !turns.length || !Number.isInteger(currentIndex) || currentIndex < 0) {
		return null;
	}

	let targetIndex = turns.findIndex((combatant) => combatant.tokenId === token.document?.id);

	if (targetIndex < 0) {
		targetIndex = turns.findIndex((combatant) => combatant.actorId === token.actor?.id);
	}

	if (targetIndex < 0) {
		return null;
	}

	const count = (targetIndex - currentIndex + turns.length) % turns.length;
	return {
		count,
		label: count === 0 ? "Acting now" : `Acts in ${count} turn${count === 1 ? "" : "s"}`,
	};
}

/**
 * Expose NPC trait features only to the GM.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {Array<{description: string}>}
 */
function getNpcTraits(actor) {
	if (actor.type !== "NPC" || !game.user?.isGM) {
		return [];
	}

	return Array.from(actor.items ?? [])
		.filter((item) => item.type === "feature" && ["trait", "race"].includes(item.system?.featureType))
		.map((item) => ({ description: getPlainText(item.system?.description?.value) }))
		.filter((item) => item.description);
}

/**
 * Convert an item's rich-text description into safe compact display text.
 *
 * @param {string} html Rich-text content.
 * @returns {string}
 */
function getPlainText(html) {
	const container = document.createElement("div");
	container.innerHTML = html ?? "";
	return container.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * Return only the special 4e monster classifications requested by the display.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {{key: string, label: string, icon?: string}|null}
 */
function getSpecialRole(actor) {
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
