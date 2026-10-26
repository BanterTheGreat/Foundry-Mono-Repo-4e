import { MODULE_ID } from "./rules.js";
import { loadDamageRollClass } from "./system-adapter.js";

const CONTEXT = Symbol("powerActivationDamage");
const wrapped = new WeakSet();

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
		if (context && options.hitTypeDamage && !options.hitTypeHealing) {
			const toMessage = roll.toMessage;
			roll.toMessage = function(...args) {
				context.message = Promise.resolve(toMessage.apply(this, args));
				return context.message;
			};
		}
		return roll;
	};
	wrapped.add(RollClass);
}

/** Roll once, await its actual message, then wait for that message's local dice. */
export async function rollDamageAndWait(item, event, RollClass = null) {
	RollClass ??= await loadDamageRollClass();
	captureDamageMessage(RollClass);
	const context = {};
	const power = new Proxy(item, {
		get(target, key) {
			if (key === "getRollData") {
				return (...args) => {
					const data = item.getRollData(...args);
					Object.defineProperty(data, CONTEXT, { value: context, configurable: true });
					return data;
				};
			}
			const value = Reflect.get(target, key, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	const roll = await item.rollDamage.call(power, { event });
	if (!roll) {
		return null;
	}
	const message = await context.message;
	if (!message) {
		ui.notifications.warn("Damage was rolled, but its chat message could not be confirmed. Check chat for the result.");
		return { total: null };
	}
	if (typeof game.dice3d?.waitFor3DAnimationByMessageID === "function") {
		try {
			await game.dice3d.waitFor3DAnimationByMessageID(message.id);
		} catch (error) {
			console.warn(`${MODULE_ID} | Could not wait for Dice So Nice; showing damage result`, error);
		}
	}
	return { total: message.rolls?.[0]?.total ?? null };
}
