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
