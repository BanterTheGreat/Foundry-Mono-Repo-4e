/**
 * Build all effect-related presentation data for an actor.
 *
 * @param {Actor} actor The displayed actor.
 * @param {boolean} useDescriptions Whether descriptions should replace effect names.
 * @returns {{effects: Array<object>, combatStats: Array<object>}}
 */
export function getEffectPresentation(actor, useDescriptions) {
	const shownEffects = getShownEffects(actor);

	return {
		effects: getEffectDisplayData(shownEffects, useDescriptions),
		combatStats: getEffectCombatStats(actor, shownEffects),
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
 * @param {boolean} useDescriptions Whether descriptions should replace effect names.
 * @returns {Array<{name: string, img: string, duration: object|null}>}
 */
function getEffectDisplayData(effects, useDescriptions) {
	return effects.map((effect) => ({
		name: getEffectLabel(effect, useDescriptions),
		img: effect.img || effect.icon || "icons/svg/aura.svg",
		duration: getEffectDuration(effect),
	}));
}

/**
 * Use condition names and temporary-effect descriptions in the compact list.
 *
 * @param {ActiveEffect} effect The displayed effect.
 * @param {boolean} useDescription Whether descriptions should replace effect names.
 * @returns {string}
 */
function getEffectLabel(effect, useDescription) {
	if (!useDescription || (effect.statuses?.size ?? 0) > 0) {
		return effect.name;
	}

	const description = document.createElement("div");
	description.innerHTML = effect.description ?? "";
	return description.textContent?.trim() || effect.name;
}

/**
 * Build the short duration label shown beneath an effect name.
 *
 * @param {ActiveEffect} effect The displayed effect.
 * @returns {{label: string}|null}
 */
function getEffectDuration(effect) {
	const durationType = effect.system?.durationType;
	let label;

	switch (durationType) {
		case "endOfEncounter":
			label = "Encounter";
			break;
		case "saveEnd":
			label = "Save Ends";
			break;
		case "endOfTargetTurn":
			label = `EoT ${effect.parent?.name ?? "Target"}`;
			break;
		case "endOfUserTurn":
			label = `EoT ${getEffectSourceActor(effect)?.name ?? "User"}`;
			break;
		case "startOfTargetTurn":
		case "startOfUserTurn":
			label = effect.duration?.label || durationType;
			break;
		case "custom":
			label = effect.duration?.label || "Custom";
			break;
		default:
			return null;
	}

	return { label };
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

/**
 * Total attack, damage, and defence changes from only the displayed effects.
 *
 * @param {Actor} actor The displayed actor.
 * @param {ActiveEffect[]} effects The effects included in the display.
 * @returns {Array<{icon: string, label: string, value: string, tone: string}>}
 */
function getEffectCombatStats(actor, effects) {
	const totals = {
		attack: 0,
		damage: 0,
		speed: 0,
		defences: 0,
		ac: 0,
		fort: 0,
		ref: 0,
		wil: 0,
	};

	for (const effect of effects) {
		for (const change of effect.system?.changes ?? effect.changes ?? []) {
			if (!isAdditiveChange(change)) {
				continue;
			}

			const value = evaluateEffectChange(change.value, actor);
			const key = change.key ?? "";

			if (key.startsWith("system.modifiers.attack.")) {
				totals.attack += value;
			} else if (key.startsWith("system.modifiers.damage.")) {
				totals.damage += value;
			} else if (key.startsWith("system.movement.base.") || key.startsWith("system.movement.walk.")) {
				totals.speed += value;
			} else if (key.startsWith("system.modifiers.defences.")) {
				totals.defences += value;
			} else {
				for (const defence of ["ac", "fort", "ref", "wil"]) {
					if (key.startsWith(`system.defences.${defence}.`)) {
						totals[defence] += value;
					}
				}
			}
		}
	}

	return [
		getModifierStat("fa-solid fa-crosshairs", "To Hit from shown effects", totals.attack),
		getModifierStat("fa-solid fa-burst", "Damage from shown effects", totals.damage),
		getModifierStat("fa-solid fa-person-running", "Speed from shown effects", totals.speed),
		getModifierStat("fa-solid fa-shield-halved", "Armor Class from shown effects", totals.defences + totals.ac),
		getModifierStat("fa-solid fa-dumbbell", "Fortitude from shown effects", totals.defences + totals.fort),
		getModifierStat("fa-solid fa-bolt", "Reflex from shown effects", totals.defences + totals.ref),
		getModifierStat("fa-solid fa-brain", "Will from shown effects", totals.defences + totals.wil),
	].filter((stat) => stat.value !== "+0");
}

/**
 * Test whether an effect change adds to its target value.
 *
 * @param {object} change An ActiveEffect change.
 * @returns {boolean}
 */
function isAdditiveChange(change) {
	return change.type === "add"
		|| change.mode === CONST.ACTIVE_EFFECT_MODES.ADD
		|| change.mode === 2;
}

/**
 * Evaluate a numeric effect value against the affected actor's roll data.
 *
 * @param {number|string} value The effect change value.
 * @param {Actor} actor The affected actor.
 * @returns {number}
 */
function evaluateEffectChange(value, actor) {
	const number = Number(value);

	if (Number.isFinite(number)) {
		return number;
	}

	try {
		const formula = Roll.replaceFormulaData(String(value), actor.getRollData(), { missing: 0 });
		const result = Roll.safeEval(formula);
		return Number.isFinite(result) ? result : 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Format a signed global modifier for the display.
 *
 * @param {string} icon Font Awesome icon classes.
 * @param {string} label Accessible statistic label.
 * @param {number} value Prepared modifier value.
 * @returns {{icon: string, label: string, value: string, tone: string}}
 */
function getModifierStat(icon, label, value) {
	const number = Number(value) || 0;
	return {
		icon,
		label,
		value: number >= 0 ? `+${number}` : String(number),
		tone: number > 0 ? "is-positive" : number < 0 ? "is-negative" : "is-neutral",
	};
}
