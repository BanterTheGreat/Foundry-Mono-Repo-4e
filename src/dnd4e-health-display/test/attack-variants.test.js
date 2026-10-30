import assert from "node:assert/strict";
import test from "node:test";
import { attackVariants } from "../scripts/power-activation/attack-variants.js";
import { OpportunityAttackChatActions } from "../../banter-4e-modifications/scripts/modules/opportunity-attack-chat/opportunity-attack-chat-actions.js";

for (const actorType of ["NPC", "Player Character"]) {
	for (const system of [
		{ attack: {} },
		{ attack: { canCharge: true, canOpp: true } },
		{ attack: { isBasic: true } },
		{ rollModes: [{ charge: true }, { opportunityAttack: true }] },
		{ rollModes: { charge: { chargeAttack: true }, opportunity: { opportunityAttack: true } } },
		{ rollModes: [{ charge: false, opportunityAttack: false }] },
	]) {
		test(`${actorType} targeting modes match the existing chat buttons: ${JSON.stringify(system)}`, async () => {
			const item = { type: "power", hasAttack: true, system, actor: { type: actorType } };
			const variants = attackVariants(item);
			let variance = {};
			for (const variant of variants.slice(1)) {
				assert.equal(OpportunityAttackChatActions.findNextVariant({ flags: { dnd4e: { variance } } }, item.actor, item), variant.id);
				let rolled;
				item.actor.usePower = async (_item, options) => { rolled = options.variance; };
				await OpportunityAttackChatActions.rollChatCardVariant({ isAuthor: true }, item.actor, item, variant.id, {});
				assert.deepEqual(variant.variance, rolled);
				variance = variant.variance;
			}
			assert.equal(OpportunityAttackChatActions.findNextVariant({ flags: { dnd4e: { variance } } }, item.actor, item), variants.length > 1 ? "regular" : null);
		});
	}
}

test("utilities and non-powers have no alternate attack modes", () => {
	assert.deepEqual(attackVariants({ type: "power", hasAttack: false }), []);
	assert.deepEqual(attackVariants({ type: "weapon", hasAttack: true }), []);
	assert.equal(attackVariants({ type: "power", hasAttack: true, system: { attack: { isBasic: true } } })[0].label, "Basic attack");
});

test("PC and NPC basic attacks offer Charge even when its variant checkbox is off", () => {
	for (const type of ["NPC", "Player Character"]) {
		const item = { type: "power", hasAttack: true, actor: { type },
			system: { attack: { isBasic: true, canCharge: false } } };
		assert.deepEqual(attackVariants(item).find(variant => variant.id === "charge")?.variance, { isCharge: true });
		item.system.attack.isBasic = false;
		assert.equal(attackVariants(item).some(variant => variant.id === "charge"), false);
	}
});
