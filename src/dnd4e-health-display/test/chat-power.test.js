import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const controllerSource = readFileSync(new URL("../scripts/actor-display/actor-display.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");

/** Load the actual HUD action with Foundry's application base stubbed. */
function loadChatAction() {
	const context = vm.createContext({
		foundry: { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base) => base } } },
	});
	vm.runInContext(`${controllerSource}\nglobalThis.chatAction = HorizontalActorDisplay.DEFAULT_OPTIONS.actions.chatPower;`, context);
	return context.chatAction;
}

for (const actorType of ["Player Character", "NPC"]) {
	test(`${actorType}: sending a limited power to chat consumes one use`, async () => {
		const power = { system: { uses: { value: 2 } }, roll: async () => "chat-card" };
		let useCalls = 0;
		const actor = {
			type: actorType,
			items: new Map([["power", power]]),
			// DnD4e 0.9.3 usePower consumes a use and posts the card by default.
			async usePower(item) {
				assert.equal(item, power);
				useCalls++;
				item.system.uses.value--;
				return item.roll();
			},
		};
		const result = await loadChatAction().call({ actor }, {}, { dataset: { itemId: "power" } });
		assert.equal(power.system.uses.value, 1);
		assert.equal(useCalls, 1);
		assert.equal(result, "chat-card");
	});
}

test("sending a deleted power to chat is harmless", async () => {
	const actor = { items: new Map(), usePower: () => assert.fail("No power should be used") };
	assert.equal(await loadChatAction().call({ actor }, {}, { dataset: { itemId: "missing" } }), undefined);
});
