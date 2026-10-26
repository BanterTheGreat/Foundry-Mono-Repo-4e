import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { MODULE_ID, FLAG } from "../scripts/power-activation/rules.js";

/** Exercise document permissions and persistence without a running Foundry client. */
function fixture() {
	const updates = [];
	const errors = [];
	let origins = ["Actor.first"];
	class App {
		async render() {}
	}
	const context = vm.createContext({
		MODULE_ID, FLAG,
		foundry: { applications: {
			api: { ApplicationV2: App, HandlebarsApplicationMixin: Base => Base },
			ux: { TextEditor: { implementation: { getDragEventData: () => ({ type: "Actor" }) } } },
		} },
		Actor: { implementation: { fromDropData: async () => ({ uuid: "Actor.companion" }) } },
		ui: { notifications: { error: message => errors.push(message) } },
		fromUuid: async uuid => ({ name: uuid }),
	});
	const source = readFileSync(new URL("../scripts/power-activation/actor-origins.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
	vm.runInContext(`${source}\nglobalThis.Manager = ActorOrigins;`, context);
	const actor = {
		isOwner: true, name: "Caster", getFlag: () => ({ originActors: origins }),
		async setFlag(module, key, value) { updates.push({ module, key, value: Array.from(value) }); origins = value; },
	};
	return { manager: new context.Manager(actor), actor, updates, errors, event: { preventDefault() {} } };
}

test("actor origin drops persist UUIDs without duplicates or embedded power edits", async () => {
	const f = fixture();
	await f.manager.addOrigin(f.event);
	await f.manager.addOrigin(f.event);
	assert.deepEqual(f.updates.at(-1), { module: MODULE_ID, key: `${FLAG}.originActors`, value: ["Actor.first", "Actor.companion"] });
	assert.deepEqual(f.errors, []);
});

test("revoking actor ownership prevents a previously opened manager from changing origins", async () => {
	const f = fixture();
	f.actor.isOwner = false;
	await f.manager.addOrigin(f.event);
	assert.equal(f.updates.length, 0);
});
