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
