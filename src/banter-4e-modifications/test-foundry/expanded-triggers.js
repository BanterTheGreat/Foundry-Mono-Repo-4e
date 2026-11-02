import { TriggerWorld, powerData, WEAPON_ATTACK, RANGED_ATTACK, settle, waitForFact } from "./trigger-prompt-fixture.js";
import { TRIGGER_ID as ID } from "../scripts/modules/trigger-prompts/constants.js";
import { PowerTriggerDialog } from "../scripts/modules/trigger-prompts/power-trigger-dialog.js";

const MODULE = "banter-4e-modifications";
const DISPLAY = "dnd4e-health-display";

/** New trigger families against real documents, native hooks and confirmed automation messages. */
export function registerExpandedTriggerTests(quench) {
  const key = "banter-4e-modifications.expanded-triggers";
  quench.registerBatch(key, ({ describe, it, before, after, afterEach, assert }) => {
    describe("Expanded triggers and Target Automation", function () {
      this.timeout(45000);
      let world;
      const hero = powers => ({ key: "hero", col: 5, row: 5, powers });
      const enemy = { key: "enemy", col: 8, row: 5, disposition: -1, actorFlags: { opportunityAttack: { enabled: false } } };
      const reaction = (id, parameters = {}) => powerData("Reaction", { triggers: [{ triggerId: id, parameters }] });
      const count = () => world.prompts().length;
      const clear = async () => {
        for (const message of world.prompts()) {
          await message.delete();
        }
      };
      before(async function () { world = await TriggerWorld.open(); });
      afterEach(async function () { await world?.endEncounter(); });
      after(async function () { await world?.close(); });

      /** Create a real native-shaped message at the automation review boundary. */
      async function automated(attackerKey, targetKeys, { outcome = "hit", range = "range", defense = "ac", opportunity = false, critical = false, pending = true } = {}) {
        const source = world.get(attackerKey);
        const rolls = [];
        for (const targetKey of targetKeys) {
          const roll = await new Roll("20").evaluate();
          roll.options.multirollData = { targetID: world.get(targetKey).token.id, hitstate: outcome, critstate: critical ? "critical" : "" };
          rolls.push(roll);
        }
        return world.encounterDocuments.createMessage({
          flavor: "[Integration test] Automation result review", rolls,
          speaker: { scene: world.scene.id, actor: source.actor.id, token: source.token.id },
          flags: { [DISPLAY]: { attackResults: {
            sessionId: foundry.utils.randomID(), pending, sceneId: world.scene.id, casterId: source.token.id,
            targetIds: targetKeys.map(key => world.get(key).token.id),
            triggerMetadata: { attackRange: range, defenseType: defense, isOpportunity: opportunity },
          } } },
        });
      }

      it("you hit an enemy accepts native hits; critical-only waits for a confirmed critical verdict", async function () {
        await world.encounter([hero([reaction(ID.YOU_HIT_ENEMY)]), enemy]);
        await world.attack("hero", ["enemy"]);
        await world.waitForPrompt("hero", ID.YOU_HIT_ENEMY);
        await clear();
        await world.get("hero").actor.items.find(item => item.name === "Reaction").setFlag(MODULE, "trigger-prompts", {
          version: 1, assignments: [{ triggerId: ID.YOU_HIT_ENEMY, parameters: { criticalOnly: true } }],
        });
        await world.attack("hero", ["enemy"]);
        await automated("hero", ["enemy"], { pending: false });
        await automated("hero", ["enemy"], { pending: false, outcome: "miss" });
        const critical = await automated("hero", ["enemy"], { critical: true });
        await settle();
        assert.equal(count(), 0);
        await critical.update({ [`flags.${DISPLAY}.attackResults.pending`]: false });
        await world.waitForPrompt("hero", ID.YOU_HIT_ENEMY);
        assert.equal(count(), 1);
      });

      it("tracer: opportunity hit waits for automation confirmation and fires exactly once", async function () {
        await world.encounter([hero([reaction(ID.YOU_HIT_WITH_OPPORTUNITY_ATTACK)]), enemy]);
        const message = await automated("hero", ["enemy"], { opportunity: true });
        await settle();
        assert.equal(count(), 0);
        await message.update({ [`flags.${DISPLAY}.attackResults.pending`]: false });
        await world.waitForPrompt("hero", ID.YOU_HIT_WITH_OPPORTUNITY_ATTACK);
        await message.update({ content: "Updated after confirmation" });
        await settle();
        assert.equal(count(), 1);
      });

      it("opportunity hit rejects regular attacks and misses, with a native positive control", async function () {
        await world.encounter([hero([reaction(ID.YOU_HIT_WITH_OPPORTUNITY_ATTACK)]), enemy]);
        await automated("hero", ["enemy"], { pending: false });
        await automated("hero", ["enemy"], { opportunity: true, outcome: "miss", pending: false });
        await settle();
        assert.equal(count(), 0);
        const strike = world.get("hero").actor.items.find(item => item.name === WEAPON_ATTACK);
        await strike.update({ "system.attack.isOpp": true });
        await world.get("hero").actor.items.find(item => item.name === "Reaction").setFlag(MODULE, "trigger-prompts", { limit: "turn" });
        await world.attack("hero", ["enemy"]);
        await world.waitForPrompt("hero", ID.YOU_HIT_WITH_OPPORTUNITY_ATTACK);
      });

      it("marked attacks ignore a roster containing the marker and prompt once for another multi-target attack", async function () {
        await world.encounter([hero([reaction(ID.MARKED_ENEMY_ATTACKS_OTHER)]), { ...enemy, markedBy: "hero" },
          { key: "ally", col: 5, row: 6 }, { key: "other", col: 5, row: 7 }]);
        await world.attack("enemy", ["ally", "hero"], { total: 1 });
        await settle();
        assert.equal(count(), 0);
        await world.attack("enemy", ["ally", "other"], { total: 1 });
        await world.waitForPrompt("hero", ID.MARKED_ENEMY_ATTACKS_OTHER);
        await settle();
        assert.equal(count(), 1);
      });

      it("enter-range includes the final entered square and ignores movement outside range", async function () {
        await world.encounter([hero([reaction(ID.ENEMY_ENTERS_RANGE, { rangeSquares: 2 })]), enemy]);
        await world.get("hero").actor.setFlag(MODULE, "trigger-prompts", { opportunityAttack: { enabled: false } });
        await world.move("enemy", 9, 5);
        await settle();
        assert.equal(count(), 0);
        await world.move("enemy", 7, 5);
        await world.waitForPrompt("hero", ID.ENEMY_ENTERS_RANGE);
      });

      it("a completed native save prompts on success, whereas allied failure excludes successful saves", async function () {
        await world.encounter([hero([reaction(ID.YOU_MAKE_SAVING_THROW), powerData("Ally save reaction", { triggers: [ID.YOU_OR_ALLY_FAILS_SAVE] })]),
          { key: "ally", col: 6, row: 5 }, enemy]);
        await world.rollSave("hero", { fail: false });
        await world.waitForPrompt("hero", ID.YOU_MAKE_SAVING_THROW);
        assert.equal(world.prompts({ triggerId: ID.YOU_OR_ALLY_FAILS_SAVE }).length, 0);
        await world.rollSave("ally");
        await world.waitForPrompt("hero", ID.YOU_OR_ALLY_FAILS_SAVE);
      });

      it("ranged AC/Reflex hits reject melee, Will and misses in automation", async function () {
        await world.encounter([hero([reaction(ID.RANGED_AC_REFLEX_HITS_YOU)]), enemy]);
        for (const options of [{ range: "weapon" }, { defense: "wil" }, { outcome: "miss" }]) {
          await automated("enemy", ["hero"], { pending: false, ...options });
        }
        await settle();
        assert.equal(count(), 0);
        await automated("enemy", ["hero"], { pending: false, defense: "ref" });
        await world.waitForPrompt("hero", ID.RANGED_AC_REFLEX_HITS_YOU);
      });

      it("shared attack and defense filters apply to existing enemy-hit triggers", async function () {
        await world.encounter([hero([reaction(ID.ENEMY_HITS_YOU, { attackTypes: ["ranged"], defenseTypes: ["ref"] })]), enemy]);
        await world.attack("enemy", ["hero"]);
        await world.attack("enemy", ["hero"], { power: RANGED_ATTACK });
        await settle();
        assert.equal(count(), 0);
        await world.attack("enemy", ["hero"], { power: RANGED_ATTACK, defenseType: "ref" });
        await world.waitForPrompt("hero", ID.ENEMY_HITS_YOU);
      });

      it("companion targeted and hit route to its owner without an initiative slot", async function () {
        await world.encounter([hero([]), enemy, { key: "spirit", col: 6, row: 5 }]);
        const spirit = world.get("spirit");
        await world.combat.deleteEmbeddedDocuments("Combatant", [world.combat.combatants.find(c => c.tokenId === spirit.token.id).id]);
        await world.get("hero").actor.createEmbeddedDocuments("Item", [reaction(ID.COMPANION_TARGETED, { companionActorUuid: spirit.actor.uuid }),
          powerData("Companion hit", { triggers: [{ triggerId: ID.COMPANION_HIT, parameters: { companionActorUuid: spirit.actor.uuid, attackTypes: ["melee"] } }] })]);
        await world.attack("enemy", ["hero"]);
        await settle();
        assert.equal(count(), 0);
        await world.attack("enemy", ["spirit"], { power: RANGED_ATTACK });
        await world.waitForPrompt("hero", ID.COMPANION_TARGETED);
        assert.equal(world.prompts({ triggerId: ID.COMPANION_HIT }).length, 0);
        await automated("enemy", ["spirit"], { range: "weapon", pending: false });
        await world.waitForPrompt("hero", ID.COMPANION_HIT);
      });

      it("typed damage includes temporary HP, excludes healing and unknown types", async function () {
        await world.encounter([hero([reaction(ID.YOU_TAKE_DAMAGE, { damageTypes: ["fire", "cold"] })]), enemy]);
        const target = world.get("hero");
        await target.actor.update({ "system.attributes.temphp.value": 10 });
        const before = target.actor.system.attributes.hp.value;
        await target.actor.applyDamage(1);
        await settle();
        assert.equal(count(), 0, "untyped native damage cannot satisfy a typed filter");
        const receipt = await world.encounterDocuments.createMessage({ content: "[Integration test] Typed receipt", flags: { [DISPLAY]: {
          damageApplication: { sceneId: world.scene.id }, attackResults: { casterId: world.get("enemy").token.id },
          damageApplications: { [target.token.id]: { state: "applying", amount: 2, damageTypes: ["fire"], health: { before, after: before } } },
        } } });
        await target.actor.applyDamage(2);
        await world.waitForPrompt("hero", ID.YOU_TAKE_DAMAGE);
        await receipt.update({ [`flags.${DISPLAY}.damageApplications.${target.token.id}.state`]: "applied" });
        await clear();
        await target.actor.update({ "system.attributes.hp.value": before - 5 });
        await target.actor.applyDamage(-5);
        await settle();
        assert.equal(count(), 0);
      });

      it("the real Triggers dialog saves filters and an explicit companion", async function () {
        await world.encounter([hero([reaction(ID.COMPANION_HIT)]), enemy]);
        const item = world.get("hero").actor.items.find(i => i.name === "Reaction");
        PowerTriggerDialog.show(item);
        const dialog = await waitForFact(() => [...foundry.applications.instances.values()].find(app => app.title === `${item.name}: Trigger prompts` && app.element?.querySelector("form")), "trigger dialog");
        try {
          const form = dialog.element.querySelector("form");
          form.elements[`${ID.COMPANION_HIT}.companionActorUuid`].value = world.get("hero").actor.uuid;
          form.querySelector(`[name="${ID.COMPANION_HIT}.attackTypes"][value="melee"]`).checked = true;
          dialog.element.querySelector('[data-action="save"]').click();
          await waitForFact(() => item.flags[MODULE]?.["trigger-prompts"]?.assignments?.[0]?.parameters?.attackTypes?.includes("melee"), "saved filter");
          assert.equal(item.flags[MODULE]["trigger-prompts"].assignments[0].parameters.companionActorUuid, world.get("hero").actor.uuid);
        } finally {
          await dialog.close();
        }
      });
    });
  }, { displayName: "BANTER: Expanded triggers and Target Automation", preSelected: false });
  return key;
}
