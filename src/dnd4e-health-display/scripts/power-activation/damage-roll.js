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
					args[0] = { ...args[0], flags: { ...args[0]?.flags, ...(context.review.variance ? { dnd4e: { ...args[0]?.flags?.dnd4e, variance: context.review.variance } } : {}), [MODULE_ID]: { damageReview: { ...context.review, ...(Number.isFinite(Number(data.powMax)) && options.expression?.includes("@powMax") ? { baseDiceMaximum: Number(data.powMax) } : {}), pending: true, edited: false } } } };
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
	const roll = await (review?.healing ? item.rollHealing : item.rollDamage).call(power, { event: review ? {} : event, variance: review?.variance ?? {}, ...(review ? { fastForward: false } : {}) });
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
 * Split additive native terms into dice and fixed contributions. Parenthetical
 * rolls retain their evaluated dice; multiplication by a constant scales both.
 * Unsupported expressions fall back to the intact native result.
 */
function diceContribution(roll) {
	if (!roll.terms?.length) {
		return null;
	}
	const values = [];
	const operators = [];
	for (const term of roll.terms) {
		if (term.operator) {
			operators.push(term.operator);
			continue;
		}
		let value;
		if (term.faces) {
			value = { total: term.total, dice: term.total,
				formula: `${term.number}d${term.faces}${(term.modifiers ?? []).join("")}` };
		} else if (term.roll) {
			value = diceContribution(term.roll);
		} else if (Number.isFinite(term.total) && !term.rolls && !term.terms) {
			value = { total: term.total, dice: 0, formula: "" };
		}
		if (!value || !Number.isFinite(value.total)) {
			return null;
		}
		values.push(value);
	}
	// Foundry normally supplies a leading zero for unary signs; accept either.
	if (operators.length === values.length && ["+", "-"].includes(operators[0])) {
		values.unshift({ total: 0, dice: 0, formula: "" });
	}
	if (operators.length !== values.length - 1) {
		return null;
	}
	for (const precedence of [["*", "/"], ["+", "-"]]) {
		for (let i = 0; i < operators.length;) {
			const op = operators[i];
			if (!precedence.includes(op)) {
				i++;
				continue;
			}
			const left = values[i];
			const right = values[i + 1];
			let result;
			if (["+", "-"].includes(op)) {
				const sign = op === "+" ? 1 : -1;
				result = { total: left.total + sign * right.total, dice: left.dice + sign * right.dice,
					formula: right.formula ? (left.formula ? `${left.formula} ${op} (${right.formula})`
						: `${op === "-" ? "-" : ""}${right.formula}`) : left.formula };
			} else {
				if ((left.formula && right.formula) || (op === "/" && right.formula)) {
					return null;
				}
				const factor = left.formula ? right.total : left.total;
				const expression = left.formula || right.formula;
				result = { total: op === "*" ? left.total * right.total : left.total / right.total,
					dice: op === "*" ? left.dice * right.total + right.dice * left.total : left.dice / right.total,
					formula: expression ? `(${expression}) ${op} ${factor}` : "" };
			}
			values.splice(i, 2, result);
			operators.splice(i, 1);
		}
	}
	return operators.length ? null : values[0];
}

/**
 * Describe the original native roll and the applied post-roll adjustment without
 * evaluating either again. Totals use the native divisor and rounding; the Mod
 * is their effective difference, so the displayed equation always balances.
 */
export function damageCalculation(message, normalMessage = null) {
	const saved = message.flags?.[MODULE_ID]?.damageReview?.baseRolls?.[0];
	const current = message.rolls[0];
	const base = saved && typeof current.constructor.fromJSON === "function"
		? current.constructor.fromJSON(JSON.stringify(saved)) : saved ?? current;
	let rolled = damageMessageTotal({ rolls: [base] });
	const total = damageMessageTotal(message);
	const rawFormula = String(base.formula ?? base._formula ?? "");
	let formula = rawFormula.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
	// Numeric wrapper parentheses and zero additions are native expression chrome.
	formula = formula.replace(/\(\s*([+-]?\d+(?:\.\d+)?)\s*\)/g, "$1");
	formula = formula.replace(/\s*\+\s*0(?=\s*(?:[+)]|$))/g, "").trim();
	if (message.flags?.[MODULE_ID]?.damageReview?.type === "crit") {
		const dice = formula.match(/\b\d*d\d+(?:[a-z]+\d*)*/gi) ?? [];
		formula = ["Max", ...dice].join(" + ");
	}
	const split = diceContribution(base);
	const divisor = Number(base.options?.divisors?.[base.options.hitType]?.value) || 1;
	if (split && message.flags?.[MODULE_ID]?.damageReview?.type !== "crit") {
		rolled = Math.floor(split.dice / divisor);
		formula = split.formula || "0";
	}
	if (divisor !== 1) {
		formula = `(${formula || "Roll"}) ÷ ${divisor} ↓`;
	}
	const critical = message.flags?.[MODULE_ID]?.damageReview?.type === "crit";
	const criticalDice = critical && split ? Math.floor(split.dice / divisor) : 0;
	// The constant part of a critical roll includes ability/enhancement bonuses.
	// Use the native powMax substitution, not that combined constant subtotal.
	let maximum = message.flags?.[MODULE_ID]?.damageReview?.baseDiceMaximum
		?? base.options?.formulaInnerData?.powMax;
	if (critical && maximum == null && normalMessage) {
		const normal = normalMessage.flags?.[MODULE_ID]?.damageReview?.baseRolls?.[0] ?? normalMessage.rolls[0];
		const normalFormula = normal.formula ?? normal._formula;
		if (normalFormula && typeof globalThis.Roll?.prototype?.evaluateSync === "function") {
			const maximized = new Roll(normalFormula).evaluateSync({ maximize: true });
			maximum = diceContribution(maximized)?.dice;
		}
	}
	const criticalMaximum = critical ? Math.floor((maximum == null
		? base.total - (split?.dice ?? 0) : Number(maximum)) / divisor) : 0;
	const criticalDiceFormula = critical ? (split?.formula || "0") : "";
	return { rolled, critical, criticalMaximum, criticalDice,
		criticalDiceFormula: divisor !== 1 ? `(${criticalDiceFormula}) ÷ ${divisor} ↓` : criticalDiceFormula,
		calculationModifier: critical ? total - criticalMaximum - criticalDice : total - rolled,
		rollFormula: formula, fullRollFormula: rawFormula };
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
