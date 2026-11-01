import { computeTurnsAway } from "./token-ring-data.js";

/**
 * Build all effect-related presentation data for an actor.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {{effects: Array<object>}}
 */
export function getEffectPresentation(actor) {
	return {
		effects: getEffectDisplayData(getShownEffects(actor)),
	};
}

/**
 * Collect enabled temporary effects and conditions for display.
 *
 * @param {Actor} actor The displayed actor.
 * @returns {ActiveEffect[]}
 */
function getShownEffects(actor) {
	return Array.from(actor.effects ?? []).filter((effect) => {
		const isStatus = (effect.statuses?.size ?? 0) > 0;
		return (effect.isTemporary || isStatus) && !effect.disabled && !effect.isSuppressed;
	});
}

/**
 * Convert displayed effects to template data.
 *
 * @param {ActiveEffect[]} effects The displayed effects.
 * @returns {Array<{name: string, img: string, isCondition: boolean, description: string, ending: object}>}
 */
function getEffectDisplayData(effects) {
	return effects.map((effect) => ({
		name: effect.name,
		img: effect.img || effect.icon || "icons/svg/aura.svg",
		isCondition: (effect.statuses?.size ?? 0) > 0,
		description: getEffectDescriptionText(effect),
		ending: getEffectEnding(effect),
	}));
}

/**
 * Read an effect's description as plain text.
 *
 * @param {ActiveEffect} effect The displayed effect.
 * @returns {string}
 */
export function getEffectDescriptionText(effect) {
	const description = document.createElement("div");
	description.innerHTML = effect.description ?? "";
	return description.textContent?.trim() ?? "";
}

/**
 * Describe how an effect ends, with how many turns away that is while a combat is running.
 *
 * @param {ActiveEffect} effect The displayed effect.
 * @returns {{type: string, who?: string, label?: string, turnsAway?: number|null}}
 */
export function getEffectEnding(effect) {
	const target = effect.parent ?? null;

	switch (effect.system?.durationType) {
		case "saveEnd":
			return { type: "save", turnsAway: getTurnsAway(target, false) };
		case "endOfEncounter":
			return { type: "encounter" };
		case "endOfTargetTurn":
			return { type: "endOfTurn", who: target?.name ?? "Target", turnsAway: getTurnsAway(target, false) };
		case "startOfTargetTurn":
			return { type: "startOfTurn", who: target?.name ?? "Target", turnsAway: getTurnsAway(target, true) };
		case "endOfUserTurn": {
			const source = getEffectSourceActor(effect);
			return { type: "endOfTurn", who: source?.name ?? "User", turnsAway: getTurnsAway(source, false) };
		}
		case "startOfUserTurn": {
			const source = getEffectSourceActor(effect);
			return { type: "startOfTurn", who: source?.name ?? "User", turnsAway: getTurnsAway(source, true) };
		}
		case "custom":
			return { type: "custom", label: effect.duration?.label || "Custom" };
		default:
			return { type: "none" };
	}
}

/**
 * Count the turns until an actor's turn boundary in the running combat.
 *
 * @param {Actor|null} actor The actor whose turn matters.
 * @param {boolean} atStart Whether the start rather than the end of that turn matters.
 * @returns {number|null}
 */
function getTurnsAway(actor, atStart) {
	const combat = game.combat;
	const turns = combat?.turns ?? [];

	if (!actor || !combat?.started || !turns.length) {
		return null;
	}

	const tokenId = actor.token?.id;
	let targetIndex = tokenId ? turns.findIndex((combatant) => combatant.tokenId === tokenId) : -1;

	if (targetIndex < 0) {
		targetIndex = turns.findIndex((combatant) => combatant.actorId === actor.id);
	}

	return computeTurnsAway({ turnCount: turns.length, currentIndex: Number(combat.turn), targetIndex, atStart });
}

/**
 * Resolve the actor which originated an applied ActiveEffect.
 *
 * @param {ActiveEffect} effect The displayed effect.
 * @returns {Actor|null}
 */
function getEffectSourceActor(effect) {
	if (!effect.origin) {
		return null;
	}

	try {
		const origin = fromUuidSync(effect.origin);

		if (origin?.documentName === "Actor") {
			return origin;
		}

		return origin?.actor ?? null;
	} catch (_error) {
		return null;
	}
}
