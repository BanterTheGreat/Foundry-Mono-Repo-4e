import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../scripts/actor-display/actor-display-data.js", import.meta.url), "utf8")
	.replace(/^import .*;\r?\n/gm, "")
	.replace(/^export /gm, "");

/** Exercise description selection through both category builders with plain-text content. */
function descriptions(type, description) {
	const context = vm.createContext({
		document: { createElement: () => ({
			set innerHTML(text) {
				this.childNodes = [{ nodeType: 3, textContent: text }];
			},
			querySelectorAll: () => [],
		}) },
		foundry: { utils: { escapeHTML: (text) => text } },
	});
	vm.runInContext(source, context);
	const actor = { type, items: [{ id: "trait", name: "Rush into Battle", type: "feature", system: { featureType: "trait", description } }] };
	return [context.getFeatureCategories(actor), context.getTraitCategories(actor)]
		.map((categories) => categories[0].features[0].description);
}

test("NPC features retain full rules when chat flavour is present", () => {
	for (const result of descriptions("NPC", { chat: "The lookout barrels into you.", value: "The lookout barrels into you. The target grants combat advantage." })) {
		assert.match(result, /target grants combat advantage/);
	}
});

test("NPC features fall back to chat when the full description is missing", () => {
	for (const result of descriptions("NPC", { chat: "Trait rules" })) {
		assert.equal(result, "Trait rules");
	}
});

test("PC features keep their compact chat descriptions", () => {
	for (const result of descriptions("Player Character", { chat: "Short summary", value: "Full rules" })) {
		assert.equal(result, "Short summary");
	}
});
