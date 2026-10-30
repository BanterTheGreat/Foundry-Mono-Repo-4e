import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const controllerSource = readFileSync(new URL("../scripts/actor-display/actor-display.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");

/** Load the actual HUD action with Foundry's application base stubbed. */
function loadChatAction(showPowerInChat = () => assert.fail("No card expected")) {
	const context = vm.createContext({
		showPowerInChat,
		foundry: { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base) => base } } },
	});
	vm.runInContext(`${controllerSource}\nglobalThis.chatAction = ActorDisplay.DEFAULT_OPTIONS.actions.chatPower;`, context);
	return context.chatAction;
}

for (const actorType of ["Player Character", "NPC"]) {
	test(`${actorType}: Show in Chat delegates usage policy to the activation service`, async () => {
		const power = { system: { uses: { value: 2 } } };
		const actor = {
			type: actorType,
			items: new Map([["power", power]]),
			usePower: () => assert.fail("Informational cards must not use the power"),
		};
		let shown;
		const result = await loadChatAction(async item => { shown = item; return "chat-card"; })
			.call({ actor, onClosePowers() {} }, {}, { dataset: { itemId: "power" } });
		assert.equal(shown, power);
		assert.equal(power.system.uses.value, 2);
		assert.equal(result, "chat-card");
	});
}

test("sending a deleted power to chat is harmless", async () => {
	const actor = { items: new Map(), usePower: () => assert.fail("No power should be used") };
	assert.equal(await loadChatAction().call({ actor, onClosePowers() {} }, {}, { dataset: { itemId: "missing" } }), undefined);
});
