import assert from "node:assert/strict";
import test from "node:test";
import { rollDamageAndWait } from "../scripts/power-activation/damage-roll.js";

/** Model native unawaited toMessage, whose document reconstructs the roll. */
function fixture(total = 18) {
	let publish;
	const ready = new Promise(resolve => { publish = resolve; });
	const message = { id: "damage", speaker: { actor: "actor" }, rolls: [{ total,
		toJSON: () => ({ total, options: { reconstructed: true } }) }] };
	class RollClass {
		static createRoll(parts, replacements, data, options) {
			return { total: 0, _evaluated: false, options,
				toJSON() { return { total: this.total, options: {} }; },
				async toMessage() { await ready; this.total = total; this._evaluated = true; return message; },
			};
		}
	}
	const item = { actor: { id: "actor" }, getRollData: () => ({}),
		async rollDamage() {
			const roll = RollClass.createRoll([], [], this.getRollData(), { hitTypeDamage: true });
			void roll.toMessage();
			return roll;
		},
	};
	return { RollClass, item, publish, message };
}

test("uses the actual message despite different serialized rolls and waits for its animation", async () => {
	globalThis.window = { setTimeout: fn => setTimeout(fn, 25), clearTimeout };
	globalThis.ui = { notifications: { warn: assert.fail } };
	globalThis.Hooks = { on: () => 1, off() {} };
	let finish;
	let start;
	const started = new Promise(resolve => { start = resolve; });
	globalThis.game = { user: { id: "user" }, dice3d: { waitFor3DAnimationByMessageID(id) {
		assert.equal(id, "damage"); start(); return new Promise(resolve => { finish = resolve; });
	} } };
	const f = fixture();
	let settled = false;
	const pending = rollDamageAndWait(f.item, {}, f.RollClass).then(value => { settled = true; return value; });
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(settled, false);
	f.publish();
	await Promise.race([started, pending]);
	assert.equal(settled, false);
	finish();
	assert.deepEqual(await pending, { total: 18 });
});

test("zero damage, no DSN, cancellation, and creation failure retain native behavior", async () => {
	globalThis.game = {};
	for (const total of [0, 17]) {
		const f = fixture(total);
		f.publish();
		assert.deepEqual(await rollDamageAndWait(f.item, {}, f.RollClass), { total });
	}
	const f = fixture();
	f.item.rollDamage = async () => null;
	assert.equal(await rollDamageAndWait(f.item, {}, f.RollClass), null);
	f.item.rollDamage = async () => { throw new Error("failed"); };
	await assert.rejects(rollDamageAndWait(f.item, {}, f.RollClass), /failed/);
});

test("overlapping rolls capture their own message through another getRollData proxy", async () => {
	globalThis.game = {};
	const pending = new Map();
	class RollClass {
		static createRoll(parts, replacements, data) {
			return { toMessage: () => new Promise(resolve => pending.set(data.name, resolve)) };
		}
	}
	const item = name => ({
		getRollData: () => ({ name }),
		async rollDamage() {
			// Model Banter's existing per-call proxy around the item and its roll data.
			const outer = this;
			const proxy = new Proxy(this, { get(target, key) {
				if (key === "getRollData") {
					return () => outer.getRollData();
				}
				return Reflect.get(target, key);
			} });
			const roll = RollClass.createRoll([], [], proxy.getRollData(), { hitTypeDamage: true });
			void roll.toMessage();
			return roll;
		},
	});
	const first = rollDamageAndWait(item("first"), {}, RollClass);
	const second = rollDamageAndWait(item("second"), {}, RollClass);
	await new Promise(resolve => setImmediate(resolve));
	pending.get("second")({ id: "second", rolls: [{ total: 29 }] });
	assert.deepEqual(await second, { total: 29 });
	pending.get("first")({ id: "first", rolls: [{ total: 11 }] });
	assert.deepEqual(await first, { total: 11 });
});

test("selects native damage variants only for the scoped session and tags chat before creation", async () => {
	globalThis.game = {};
	for (const type of ["normal", "crit", "miss"]) {
		const f = fixture(24);
		let nativeDialogs = 0;
		class Dialog {
			static asPromise() { nativeDialogs++; return "ordinary"; }
		}
		f.item.rollDamage = async function(options) {
			assert.equal(options.fastForward, false);
			return Dialog.asPromise({ rollConfig: { data: this.getRollData() }, callbackFn: (form, config) => {
				assert.equal(form, null);
				assert.equal(config.hitType, type);
				assert.equal(config.fastForward, true);
				const roll = f.RollClass.createRoll([], [], config.data, { hitTypeDamage: true });
				void roll.toMessage({ flavor: "Damage" });
				return roll;
			} });
		};
		f.publish();
		const result = await rollDamageAndWait(f.item, {}, f.RollClass, { sessionId: "session", type }, Dialog);
		assert.equal(result.message, f.message);
		assert.equal(nativeDialogs, 0);
		assert.equal(Dialog.asPromise({ rollConfig: { data: {} } }), "ordinary");
		assert.equal(nativeDialogs, 1);
	}
});

test("damage modifiers preserve original dice and persist the evaluated bonus and edit audit", async () => {
	const { adjustDamageMessage } = await import("../scripts/power-activation/damage-roll.js");
	const originalDie = { result: 6 };
	let evaluations = 0;
	globalThis.Roll = class {
		constructor(formula) { this.formula = formula; }
		async evaluate() { evaluations++; this.total = 7; this._evaluated = true; return this; }
	};
	globalThis.foundry = { dice: { terms: {
		OperatorTerm: class { constructor(data) { Object.assign(this, data); } },
		ParentheticalTerm: class { constructor(data) { Object.assign(this, data); } },
	} } };
	class Damage {
		static fromJSON(json) { return { terms: [originalDie], _total: JSON.parse(json).total, constructor: Damage, get total() { return this._total; } }; }
		static getFormula() { return "1d8 + (1d6 + 3)"; }
	}
	const message = { isOwner: true, flags: { "dnd4e-health-display": { damageReview: {} } },
		rolls: [Object.assign(new Damage(), { total: 6 })],
		async update(change) { this.change = change; },
	};
	await adjustDamageMessage(message, "1d6 + 3", {});
	assert.equal(evaluations, 1);
	assert.equal(message.change.rolls[0].terms[0], originalDie);
	assert.equal(message.change.rolls[0].terms[2].roll.total, 7);
	assert.equal(message.change.rolls[0].total, 13);
	assert.equal(message.change["flags.dnd4e-health-display.damageReview.edited"], true);
	assert.deepEqual(message.change["flags.dnd4e-health-display.damageReview.modifiers"], ["1d6 + 3"]);
});

test("a second attack opens normally when the item reuses roll data after damage", async () => {
	globalThis.game = {};
	const f = fixture();
	const sharedData = {};
	f.item.getRollData = () => sharedData;
	class Dialog {
		static asPromise() { return "attack dialog opened"; }
	}
	f.item.rollDamage = async function() {
		return Dialog.asPromise({ rollConfig: { data: this.getRollData() }, callbackFn: (form, config) => {
			const roll = f.RollClass.createRoll([], [], config.data, { hitTypeDamage: true });
			void roll.toMessage({});
			return roll;
		} });
	};
	f.publish();
	await rollDamageAndWait(f.item, {}, f.RollClass, { sessionId: "first", type: "normal" }, Dialog);
	let accidentallySubmitted = false;
	const second = Dialog.asPromise({ rollConfig: { data: f.item.getRollData() }, callbackFn() {
		accidentallySubmitted = true;
		return "wrong callback";
	} });
	assert.equal(second, "attack dialog opened");
	assert.equal(accidentallySubmitted, false);
});


test("replacing or clearing a damage modifier always starts from the original evaluated roll", async () => {
	const { adjustDamageMessage } = await import("../scripts/power-activation/damage-roll.js");
	let evaluations = 0;
	globalThis.Roll = class {
		constructor(formula) { this.formula = formula; }
		async evaluate() { evaluations++; this.total = this.formula === "1d6 + 3" ? 7 : Number(this.formula); return this; }
	};
	globalThis.foundry = { dice: { terms: {
		OperatorTerm: class { constructor(data) { Object.assign(this, data); } },
		ParentheticalTerm: class { constructor(data) { Object.assign(this, data); } },
	} } };
	class Damage {
		constructor(total) { this._total = total; this.terms = [{ result: 6 }]; }
		get total() { return this._total; }
		toJSON() { return { total: this.total, terms: this.terms }; }
		static fromJSON(json) { const data = JSON.parse(json); return Object.assign(new Damage(data.total), { terms: data.terms }); }
		static getFormula() { return "damage + modifier"; }
	}
	const review = {};
	const message = { isOwner: true, flags: { "dnd4e-health-display": { damageReview: review } }, rolls: [new Damage(6)],
		async update(change) {
			this.rolls = change.rolls;
			for (const [key, value] of Object.entries(change)) {
				if (key.startsWith("flags.")) { review[key.split(".").at(-1)] = value; }
			}
		},
	};
	for (const [formula, expected] of [["1d6 + 3", 13], ["1d6 + 3", 13], ["-2", 4], ["", 6], ["+3", 9]]) {
		await adjustDamageMessage(message, formula, {});
		assert.equal(message.rolls[0].total, expected);
		assert.equal(message.rolls[0].terms[0].result, 6);
		assert.equal(message.rolls[0].terms.length, 3);
		assert.equal(review.modifierFormula, formula);
	}
	assert.equal(evaluations, 4, "unchanged dice formulas reuse their evaluated modifier");
});

test("target totals share outcome rolls, respect divisors and add individual bonuses after half rounding", async () => {
	const { targetDamageTotal } = await import("../scripts/power-activation/damage-roll.js");
	const message = (type, total, divisor = 1) => ({
		flags: { "dnd4e-health-display": { damageReview: { type } } },
		rolls: [{ total, options: { hitType: type, divisors: { [type]: { value: divisor } } } }],
	});
	const rolls = [message("normal", 22, 2), message("crit", 30), message("miss", 3)];
	assert.equal(targetDamageTotal(rolls, "hit", false, 7), 18);
	assert.equal(targetDamageTotal(rolls, "critical", false, 7), 37);
	assert.equal(targetDamageTotal(rolls, "miss", true, 7), 12, "floor(11 / 2) + 7");
	assert.equal(targetDamageTotal(rolls, "miss", false, 7), 10);
	assert.equal(targetDamageTotal([], "miss", false, 7), 7, "no miss roll starts at zero");
	assert.equal(targetDamageTotal([], "fumble", false, -2), -2);
	assert.equal(targetDamageTotal([], "miss", false, 7, ["miss"]), null, "missing required miss roll stays pending");
	assert.equal(targetDamageTotal([], "miss", true, 7), null);
	assert.equal(targetDamageTotal([], "critical"), null);
	assert.equal(targetDamageTotal([], "attack"), null);
	assert.equal(targetDamageTotal(rolls, "hit"), 11, "other targets retain the shared value");
});

test("attack messages do not render target damage receipts", async () => {
	const { registerDamageReview } = await import("../scripts/power-activation/damage-roll.js");
	let render;
	globalThis.Hooks = { on(name, callback) { assert.equal(name, "renderChatMessageHTML"); render = callback; } };
	globalThis.game = { modules: { get: () => ({ active: true }) } };
	globalThis.canvas = { tokens: { get: id => ({ visible: id === "visible", name: id === "visible" ? "Iron Guard" : "Secret creature" }) } };
	globalThis.document = { createElement: () => ({ children: [], append(child) { this.children.push(child); } }) };
	registerDamageReview();
	const content = { children: [], append(child) { this.children.push(child); } };
	const element = { querySelector: selector => selector === ".message-content" ? content : null };
	render({ flags: { "dnd4e-health-display": { targetDamageReview: { pending: false, targets: [
		{ tokenId: "visible", total: 15, modifierFormula: "2d6" },
		{ tokenId: "hidden", total: 0, modifierFormula: "" },
	] } } } }, element);
	assert.deepEqual(content.children, []);
});

test("damage breakdown groups original typed terms, allocates native remainder and preserves divided totals", async () => {
	const { damageRollBreakdown } = await import("../scripts/power-activation/damage-roll.js");
	const message = roll => ({ rolls: [roll], flags: {} });
	const typed = damageRollBreakdown(message({ total: 17, terms: [
		{ total: 8, flavor: "radiant" }, { operator: "+" }, { total: 3, flavor: "fire" }, { operator: "+" },
		{ total: 2, flavor: "radiant" }, { operator: "+" }, { total: 4 },
	] }));
	assert.deepEqual(typed.map(({ type, total }) => [type, total]), [["radiant", 13], ["fire", 4]]);
	const divided = damageRollBreakdown(message({ total: 11, terms: [
		{ total: 7, flavor: "radiant" }, { operator: "+" }, { total: 4, flavor: "fire" },
	], options: { hitType: "miss", divisors: { miss: { value: 2 } } } }));
	assert.equal(divided.reduce((sum, component) => sum + component.total, 0), 5);
	assert.deepEqual(damageRollBreakdown(message({ total: 0, terms: [{ total: 0, flavor: "cold" }] })), [
		{ type: "cold", label: "Cold", total: 0 },
	]);
	assert.deepEqual(damageRollBreakdown(message({ total: 6, terms: [{ total: 6 }] })), [
		{ type: "physical", label: "Physical", total: 6 },
	]);
});

test("damage breakdown reconstructs original evaluated terms after a shared modifier without rerolling", async () => {
	const { damageRollBreakdown } = await import("../scripts/power-activation/damage-roll.js");
	let reconstructed = 0;
	const original = { total: 8, terms: [{ total: 8, flavor: "radiant" }] };
	const message = { flags: { "dnd4e-health-display": { damageReview: { baseRolls: [original] } } }, rolls: [{ total: 15,
		constructor: { fromJSON(json) { reconstructed++; return JSON.parse(json); } },
	}] };
	assert.deepEqual(damageRollBreakdown(message), [{ type: "radiant", label: "Radiant", total: 8 }]);
	assert.equal(reconstructed, 1);
	assert.equal(message.rolls[0].total, 15);
});

test("healing dialog submission keeps the native heal action and captures its healing message", async () => {
	globalThis.game = {};
	const warnings = [];
	globalThis.ui = { notifications: { warn: value => warnings.push(value) } };
	const f = fixture(12);
	let submittedType;
	class Dialog {
		static asPromise() { assert.fail("Automated healing must submit its scoped dialog"); }
	}
	f.item.rollHealing = async function() {
		return Dialog.asPromise({ rollConfig: { data: this.getRollData(), hitType: "normal" }, callbackFn: (form, config) => {
			submittedType = config.hitType;
			const roll = f.RollClass.createRoll([], [], config.data, config.hitType === "heal"
				? { hitTypeHealing: true } : { hitTypeDamage: true });
			void roll.toMessage({ flavor: config.hitType === "heal" ? "Healing" : "Damage" });
			return roll;
		} });
	};
	f.publish();
	const result = await rollDamageAndWait(f.item, {}, f.RollClass, { sessionId: "healing", type: "normal", healing: true }, Dialog);
	assert.equal(submittedType, "heal", "native callback must receive healing rather than damage");
	assert.equal(result.message, f.message);
	assert.deepEqual(warnings, []);
});

test("automated native damage stays hidden from its first render while healing and ordinary damage remain visible", async () => {
	const { registerDamageReview } = await import("../scripts/power-activation/damage-roll.js");
	let render;
	globalThis.Hooks = { on(name, callback) { render = callback; } };
	globalThis.game = { modules: { get: () => ({ active: true }) }, settings: { get: () => true } };
	registerDamageReview();
	const hidden = [];
	const element = { style: { setProperty(...args) { hidden.push(args); } }, querySelector: () => null };
	render({ flags: { "dnd4e-health-display": { damageReview: { sessionId: "session", type: "normal" } } } }, element);
	assert.deepEqual(hidden, [["display", "none", "important"]], "hide before damageChatParent is assigned");
	hidden.length = 0;
	render({ flags: {} }, element);
	assert.equal(hidden.length, 0);
	globalThis.game.settings.get = () => false;
	render({ flags: { "dnd4e-health-display": { damageReview: { sessionId: "session" } } } }, element);
	assert.equal(hidden.length, 0, "retain native cards when compact cards are disabled");
});

test("damage calculation keeps saved roll formulas and balances rounded post-roll adjustments", async () => {
	const { damageCalculation, damageMessageTotal } = await import("../scripts/power-activation/damage-roll.js");
	const options = { hitType: "normal", divisors: { normal: { value: 2 } } };
	const message = { rolls: [{ total: 17, options }], flags: { "dnd4e-health-display": { damageReview: {
		type: "normal", baseRolls: [{ total: 11, formula: "(1d6[radiant] + 6[radiant] + 0)", options }],
	} } } };
	const result = damageCalculation(message);
	assert.equal(result.rolled, 5);
	assert.equal(result.calculationModifier, 3);
	assert.equal(result.rolled + result.calculationModifier, damageMessageTotal(message));
	assert.equal(result.rollFormula, "((1d6 + 6)) ÷ 2 ↓");
	assert.equal(result.fullRollFormula, "(1d6[radiant] + 6[radiant] + 0)");
});

test("critical formula shows Max plus actual dice expressions, not their rolled values", async () => {
	const { damageCalculation, damageMessageTotal } = await import("../scripts/power-activation/damage-roll.js");
	const message = { rolls: [{ total: 31, formula: "(18[radiant] + 3d6[radiant]) + (1d8kh1[fire])" }],
		flags: { "dnd4e-health-display": { damageReview: { type: "crit" } } } };
	assert.equal(damageCalculation(message).rollFormula, "Max + 3d6 + 1d8kh1");
	message.rolls[0].formula = "18[radiant]";
	assert.equal(damageCalculation(message).rollFormula, "Max");
	assert.equal(damageCalculation(message).calculationModifier, 0);
});

test("damage calculation separates native fixed modifiers from nested dice results", async () => {
	const { damageCalculation } = await import("../scripts/power-activation/damage-roll.js");
	const die = { number: 1, faces: 6, total: 6 };
	const roll = { total: 12, formula: "(1d6[radiant] + 6[radiant] + (0))", terms: [
		{ roll: { total: 12, terms: [die, { operator: "+" }, { number: 6, total: 6 },
			{ operator: "+" }, { roll: { total: 0, terms: [{ number: 0, total: 0 }] } }] } },
	] };
	const message = { rolls: [roll], flags: { "dnd4e-health-display": { damageReview: { type: "normal" } } } };
	assert.equal(damageCalculation(message).rolled, 6);
	assert.equal(damageCalculation(message).calculationModifier, 6);
	assert.equal(damageCalculation(message).rollFormula, "1d6");
});

test("scaled damage dice retain their formula while fixed and manual bonuses join Mod", async () => {
	const { damageCalculation } = await import("../scripts/power-activation/damage-roll.js");
	const base = { total: 20, formula: "(1d6 + 6) * 2", terms: [
		{ roll: { total: 10, terms: [{ number: 1, faces: 6, total: 4 }, { operator: "+" }, { number: 6, total: 6 }] } },
		{ operator: "*" }, { number: 2, total: 2 },
	] };
	const message = { rolls: [{ total: 23 }], flags: { "dnd4e-health-display": { damageReview: { type: "normal", baseRolls: [base] } } } };
	const result = damageCalculation(message);
	assert.equal(result.rolled, 8);
	assert.equal(result.calculationModifier, 15);
	assert.equal(result.rollFormula, "(1d6) * 2");
});

test("critical calculation splits MAX, extra dice and manual Mod without rerolling", async () => {
	const { damageCalculation } = await import("../scripts/power-activation/damage-roll.js");
	const base = { total: 30, formula: "18 + 3d6", terms: [
		{ number: 18, total: 18 }, { operator: "+" }, { number: 3, faces: 6, total: 12 },
	] };
	const message = { rolls: [{ total: 34 }], flags: { "dnd4e-health-display": { damageReview: { type: "crit", baseRolls: [base] } } } };
	let result = damageCalculation(message);
	assert.equal(result.critical, true);
	assert.equal(result.criticalMaximum, 18);
	assert.equal(result.criticalDice, 12);
	assert.equal(result.criticalDiceFormula, "3d6");
	assert.equal(result.calculationModifier, 4);
	base.options = message.rolls[0].options = { hitType: "crit", divisors: { crit: { value: 2 } } };
	result = damageCalculation(message);
	assert.equal(result.criticalMaximum + result.criticalDice + result.calculationModifier, 17);
	assert.equal(result.criticalDiceFormula, "(3d6) ÷ 2 ↓");
});

test("critical MAX excludes fixed bonuses from the native critical formula", async () => {
	const { damageCalculation } = await import("../scripts/power-activation/damage-roll.js");
	const message = { rolls: [{ total: 18, formula: "12 + 2d6", options: { formulaInnerData: { powMax: 6 } }, terms: [
		{ number: 12, total: 12 }, { operator: "+" }, { number: 2, faces: 6, total: 6 },
	] }], flags: { "dnd4e-health-display": { damageReview: { type: "crit" } } } };
	const result = damageCalculation(message);
	assert.equal(result.criticalMaximum, 6);
	assert.equal(result.criticalDice, 6);
	assert.equal(result.calculationModifier, 6);
});
