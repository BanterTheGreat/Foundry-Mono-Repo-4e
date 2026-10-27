import { MODULE_ID } from "./rules.js";
import { loadDamageRollClass, loadDamageDialogClass } from "./system-adapter.js";

const CONTEXT = Symbol("powerActivationDamage");
const wrapped = new WeakSet();
const dialogs = new WeakSet();

/**
 * Capture the native toMessage promise on this call's roll only. DnD4e 0.9.3
 * does not await it, and the message reconstructs the evaluated Roll document.
 * The private roll-data symbol follows the same proxy seam as Banter's capture.
 */
function captureDamageMessage(RollClass) {
	if (wrapped.has(RollClass)) {
		return;
	}
	const create = RollClass.createRoll;
	RollClass.createRoll = function(parts, replacements, data, options = {}) {
		const roll = create.call(this, parts, replacements, data, options);
		const context = data?.[CONTEXT];
		if (context && (context.review?.healing ? options.hitTypeHealing : options.hitTypeDamage && !options.hitTypeHealing)) {
			const toMessage = roll.toMessage;
			roll.toMessage = function(...args) {
				if (context.review) {
					args[0] = { ...args[0], flags: { ...args[0]?.flags, [MODULE_ID]: { damageReview: { ...context.review, pending: true, edited: false } } } };
				}
				context.message = Promise.resolve(toMessage.apply(this, args));
				return context.message;
			};
		}
		return roll;
	};
	wrapped.add(RollClass);
}

/** Roll once, await its actual message, then wait for that message's local dice. */
export async function rollDamageAndWait(item, event, RollClass = null, review = null, DialogClass = null) {
	RollClass ??= await loadDamageRollClass();
	captureDamageMessage(RollClass);
	const context = { review };
	if (review) {
		DialogClass ??= await loadDamageDialogClass();
		if (!dialogs.has(DialogClass)) {
			const original = DialogClass.asPromise;
			DialogClass.asPromise = function(config) {
				const scoped = config.rollConfig?.data?.[CONTEXT];
				if (!scoped?.review) {
					return original.call(this, config);
				}
				return config.callbackFn(null, { ...config.rollConfig, hitType: scoped.review.healing ? "heal" : scoped.review.type, fastForward: true });
			};
			dialogs.add(DialogClass);
		}
	}
	const power = new Proxy(item, {
		get(target, key) {
			if (key === "getRollData") {
				return (...args) => {
					// Actor roll data can be reused by later attacks. Keep the marker on a per-call copy.
					const data = { ...item.getRollData(...args) };
					Object.defineProperty(data, CONTEXT, { value: context, configurable: true });
					return data;
				};
			}
			const value = Reflect.get(target, key, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	const roll = await (review?.healing ? item.rollHealing : item.rollDamage).call(power, { event: review ? {} : event, ...(review ? { fastForward: false } : {}) });
	if (!roll) {
		return null;
	}
	const message = await context.message;
	if (!message) {
		ui.notifications.warn("The roll was made, but its chat message could not be confirmed. Check chat for the result.");
		return { total: null };
	}
	if (typeof game.dice3d?.waitFor3DAnimationByMessageID === "function") {
		try {
			await game.dice3d.waitFor3DAnimationByMessageID(message.id);
		} catch (error) {
			console.warn(`${MODULE_ID} | Could not wait for Dice So Nice; showing damage result`, error);
		}
	}
	return { total: message.rolls?.[0]?.total ?? null, ...(review ? { message } : {}) };
}

/** Replace the post-roll modifier while retaining the original evaluated damage dice. */
export async function adjustDamageMessage(message, formula, data) {
	if (!message.isOwner) {
		throw new Error("You no longer own this damage message.");
	}
	const review = message.flags[MODULE_ID].damageReview;
	const modifier = formula.trim();
	if (review.modifierFormula === modifier) {
		return;
	}
	const bonus = await new Roll(modifier || "0", data).evaluate();
	if (!Number.isFinite(bonus.total)) {
		throw new Error("The modifier must produce a finite number.");
	}
	const baseRolls = review.baseRolls ?? message.rolls.map(roll => JSON.parse(JSON.stringify(roll)));
	const rolls = baseRolls.map(roll => message.rolls[0].constructor.fromJSON(JSON.stringify(roll)));
	const roll = rolls[0];
	const baseTotal = roll.total;
	roll.terms.push(new foundry.dice.terms.OperatorTerm({ operator: "+" }),
		new foundry.dice.terms.ParentheticalTerm({ roll: bonus }));
	roll._formula = roll.constructor.getFormula(roll.terms);
	roll._total = baseTotal + bonus.total;
	await message.update({ rolls, content: String(roll.total),
		[`flags.${MODULE_ID}.damageReview.baseRolls`]: baseRolls,
		[`flags.${MODULE_ID}.damageReview.modifierFormula`]: modifier,
		[`flags.${MODULE_ID}.damageReview.edited`]: true,
		[`flags.${MODULE_ID}.damageReview.modifiers`]: [modifier || "+0"] });
}

/** Match the native damage card's divisor, including weakened and miss damage. */
export function damageMessageTotal(message) {
	const roll = message.rolls[0];
	const divisor = Number(roll?.options?.divisors?.[roll.options.hitType]?.value) || 1;
	return Math.floor(roll.total / divisor);
}

/**
 * Read original evaluated damage by type without rolling or redistributing modifiers.
 * DnD4e 0.9.3 labels top-level terms with flavor and shares an untyped remainder
 * between them. Keep that allocation, then divide once and reconcile rounding so
 * the displayed components sum to the native damage total.
 */
export function damageRollBreakdown(message) {
	const saved = message.flags?.[MODULE_ID]?.damageReview?.baseRolls?.[0];
	const current = message.rolls[0];
	const roll = saved && typeof current.constructor.fromJSON === "function"
		? current.constructor.fromJSON(JSON.stringify(saved)) : saved ?? current;
	const parts = [];
	let remaining = roll.total;
	for (const term of roll.terms ?? []) {
		if (Number.isFinite(term.total) && term.flavor) {
			parts.push({ type: term.flavor, value: term.total });
			remaining -= term.total;
		}
	}
	if (!parts.length) {
		parts.push({ type: "physical", value: remaining });
	} else if (remaining) {
		parts.forEach((part, index) => {
			part.value += 0 | remaining / parts.length + (index < remaining % parts.length);
		});
	}
	const divisor = Number(roll.options?.divisors?.[roll.options.hitType]?.value) || 1;
	const groups = new Map();
	for (const part of parts) {
		groups.set(part.type, (groups.get(part.type) ?? 0) + part.value);
	}
	let accumulated = 0;
	let displayed = 0;
	return [...groups].map(([type, value]) => {
		accumulated += value;
		const subtotal = Math.floor(accumulated / divisor);
		const total = subtotal - displayed;
		displayed = subtotal;
		const configured = globalThis.CONFIG?.DND4E?.damageTypes?.[type];
		return { type: String(type).replace(/[^a-z0-9-]/gi, "-"),
			label: configured ? game.i18n.localize(configured) : type.charAt(0).toUpperCase() + type.slice(1), total };
	});
}

/**
 * Resolve one target from shared outcome rolls, then add its individual bonus.
 * A known miss with no configured miss roll starts at zero. Missing hit/crit rolls
 * stay pending. Half-on-miss rounds the shared Hit result before the target bonus.
 */
export function targetDamageTotal(messages, outcome, sharedMiss = false, modifier = 0, requiredTypes = []) {
	const type = outcome === "critical" ? "crit" : ["miss", "fumble"].includes(outcome) ? "miss" : outcome === "hit" ? "normal" : null;
	if (outcome === "immune") {
		return modifier ?? 0;
	}
	if (!type) {
		return null;
	}
	const message = messages.find(entry => entry.flags?.[MODULE_ID]?.damageReview?.type === (type === "miss" && sharedMiss ? "normal" : type));
	if (!message) {
		return type === "miss" && !sharedMiss && !requiredTypes.includes("miss") ? (modifier ?? 0) : null;
	}
	const total = damageMessageTotal(message);
	return (type === "miss" && sharedMiss ? Math.floor(total / 2) : total) + (modifier ?? 0);
}

/** Label damage review in chat while leaving native roll rendering intact. */
export function registerDamageReview() {
	Hooks.on("renderChatMessageHTML", (message, element) => {
		const damageReview = message.flags?.[MODULE_ID]?.damageReview;
		// Keep real messages for native dialog results, review edits and Dice So
		// Nice, but hide backing rolls before the aggregate card is published.
		// Inline !important also wins over chat themes that override [hidden].
		if (damageReview?.sessionId && !damageReview.healing
			&& game.modules?.get("banter-4e-modifications")?.active
			&& game.settings.get("banter-4e-modifications", "enable-compact-chat-rolls")) {
			element.style.setProperty("display", "none", "important");
			return;
		}
		element.querySelector(".power-target-damage-review")?.remove();
		const review = message.flags?.[MODULE_ID]?.damageReview;
		if (!review || game.modules?.get("banter-4e-modifications")?.active) {
			return;
		}
		element.querySelector(".power-damage-review")?.remove();
		const label = document.createElement("strong");
		label.className = "power-damage-review";
		label.textContent = `${review.pending ? "Unconfirmed" : "Confirmed"} ${review.healing ? "healing" : "damage"}${review.edited ? ` · Manually edited (${review.modifiers.join(", ")})` : ""}`;
		element.querySelector(".message-content")?.prepend(label);
	});
}
