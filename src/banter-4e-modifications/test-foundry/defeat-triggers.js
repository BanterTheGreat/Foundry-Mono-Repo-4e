import { TriggerWorld, powerData, settle, waitForFact } from "./trigger-prompt-fixture.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";

/** Live HP-hook, item-sheet and chat-button coverage for defeat triggers and feats. */
export function registerDefeatTriggerTests(quench) {
  const key = "banter-4e-modifications.defeat-triggers";
  quench.registerBatch(key, ({ describe, it, before, beforeEach, after, afterEach, assert }) => {
    describe("Defeat triggers and feats in Foundry", function () {
      this.timeout(40000);
      let world;
      let currentTest = "(setup)";
      const recordRejection = event => window.triggerPromptStrayErrors.push({
        test: currentTest, message: String(event.reason?.message ?? event.reason), stack: event.reason?.stack,
      });
      const personal = TRIGGER_ID.YOU_REDUCE_ENEMY_TO_ZERO;
      const adjacent = TRIGGER_ID.ADJACENT_ENEMY_REDUCED_TO_ZERO;
      const reaction = (...triggers) => powerData("Defeat Reaction", { triggers });
      const hero = (powers, extra = {}) => ({ key: "hero", col: 5, row: 5, powers, ...extra });
      const enemy = (extra = {}) => ({ key: "enemy", col: 6, row: 5, disposition: -1, ...extra });

      before(async function () {
        this.timeout(60000);
        window.triggerPromptStrayErrors = [];
        window.addEventListener("unhandledrejection", recordRejection);
        world = await TriggerWorld.open();
      });
      beforeEach(function () { currentTest = this.currentTest.title; });
      afterEach(async function () { await world?.endEncounter(); });
      after(async function () {
        this.timeout(60000);
        try {
          await world?.close();
          await settle();
        } finally {
          window.removeEventListener("unhandledrejection", recordRejection);
        }
      });

      /** Apply native damage while a real chat message carries the in-flight attribution receipt. */
      async function lethalDamage(attackerKey, targetKey, { group = false, overkill = 0 } = {}) {
        const attacker = world.get(attackerKey);
        const target = world.get(targetKey);
        const before = target.actor.system.attributes.hp.value;
        const temp = Number(target.actor.system.attributes.temphp.value);
        const receiptKey = group ? `${attacker.token.id}:${target.token.id}` : target.token.id;
        const message = await world.encounterDocuments.createMessage({
          content: "[Integration test] Damage attribution receipt",
          speaker: { scene: world.scene.id, actor: attacker.actor.id, token: attacker.token.id },
          flags: { "dnd4e-health-display": {
            damageApplication: { sceneId: world.scene.id },
            attackResults: { casterId: attacker.token.id },
            damageApplications: { [receiptKey]: { state: "applying", health: { before, after: -overkill } } },
          } },
        });
        await target.actor.applyDamage(before + temp + overkill);
        await message.update({ [`flags.dnd4e-health-display.damageApplications.${receiptKey}.state`]: "applied" });
      }

      it("prompts the recorded killer, not other actors or the active turn's actor", async function () {
        await world.encounter([
          hero([reaction(personal)]), enemy(),
          { key: "killer", col: 10, row: 5, powers: [reaction(personal)] },
        ]);
        await lethalDamage("killer", "enemy", { group: true, overkill: 5 });
        await world.waitForPrompt("killer", personal);
        await settle();
        assert.deepEqual(world.promptSummary(), [`killer:${personal}`]);
      });

      it("does not attribute manual edits, friendly defeats, healing or further damage below zero", async function () {
        await world.encounter([hero([reaction(personal)]), enemy(), { key: "friend", col: 7, row: 5 }]);
        await world.setHp("enemy", 0);
        await world.setHp("enemy", -5);
        await world.setHp("enemy", 40);
        await lethalDamage("hero", "friend");
        await settle();
        assert.deepEqual(world.promptSummary(), [], "unattributed and friendly defeats do not qualify");
        await lethalDamage("hero", "enemy");
        await world.waitForPrompt("hero", personal);
        await world.setHp("enemy", -5);
        await settle();
        assert.lengthOf(world.prompts(), 1, "only the positive-to-zero transition qualifies");
      });

      it("prompts adjacent hostile observers on manual defeat, including diagonal large-token adjacency", async function () {
        await world.encounter([
          hero([reaction(adjacent)], { width: 2 }), enemy({ col: 7, row: 7 }),
          { key: "far", col: 10, row: 7, powers: [reaction(adjacent)] },
          { key: "friendly", col: 8, row: 7, disposition: -1, powers: [reaction(adjacent)] },
        ]);
        await world.setHp("enemy", 0);
        await world.waitForPrompt("hero", adjacent);
        await settle();
        assert.deepEqual(world.promptSummary(), [`hero:${adjacent}`]);
        await world.setHp("enemy", -5);
        await world.setHp("enemy", 40);
        await settle();
        assert.lengthOf(world.prompts(), 1, "damage below zero and healing do not repeat the prompt");
      });

      it("ignores nonlethal damage and distant defeats, then prompts for an adjacent defeat", async function () {
        await world.encounter([hero([reaction(adjacent)]), enemy(), enemy({ key: "far", col: 10 })]);
        await world.setHp("enemy", 1);
        await world.setHp("far", 0);
        await settle();
        assert.deepEqual(world.promptSummary(), []);
        await world.setHp("enemy", -1);
        await world.waitForPrompt("hero", adjacent);
        assert.deepEqual(world.promptSummary(), [`hero:${adjacent}`]);
      });

      it("saves both defeat assignments through a real feat's Triggers sheet control", async function () {
        await world.encounter([hero([]), enemy()], { start: false });
        const [feat] = await world.get("hero").actor.createEmbeddedDocuments("Item", [{ name: "Defeat Feat", type: "feature" }]);
        const controls = [];
        Hooks.callAll("getItemSheetHeaderButtons", feat.sheet, controls);
        Hooks.callAll("getHeaderControlsApplicationV2", feat.sheet, controls);
        const control = controls.find(entry => /trigger/i.test(entry.label ?? ""));
        assert.exists(control, "the real feat sheet exposes Triggers");
        (control.onclick ?? control.onClick)();
        const app = await waitForFact(() => [...foundry.applications.instances.values()].find(entry => entry.title?.includes(feat.name) && entry.element?.querySelector(".trigger-prompts-config")), "the feat trigger dialog");
        try {
          const form = app.element.querySelector("form");
          form.elements[`${personal}.enabled`].checked = true;
          form.elements[`${adjacent}.enabled`].checked = true;
          app.element.querySelector("button[data-action='save']").click();
          await waitForFact(() => feat.getFlag("banter-4e-modifications", "trigger-prompts")?.assignments?.length === 2, "saved feat triggers");
          assert.sameMembers(feat.getFlag("banter-4e-modifications", "trigger-prompts").assignments.map(entry => entry.triggerId), [personal, adjacent]);
        } finally {
          await app.close();
        }
      });

      it("offers an assigned feat and posts its native card once when the prompt button is clicked", async function () {
        const feat = { name: "Defeat Feat", type: "feature", system: { description: { value: "<p>Defeat feat integration rules.</p>" } },
          flags: { "banter-4e-modifications": { "trigger-prompts": { version: 1, assignments: [{ triggerId: adjacent, parameters: {} }] } } } };
        await world.encounter([hero([feat]), enemy()]);
        const item = world.get("hero").actor.items.find(entry => entry.name === feat.name);
        const nativeRoll = item.roll;
        let rolls = 0;
        item.roll = async function (...args) {
          rolls += 1;
          return nativeRoll.apply(this, args);
        };
        const before = item.toObject();
        await world.setHp("enemy", 0);
        const prompt = await world.waitForPrompt("hero", adjacent);
        assert.deepEqual(prompt.flags.triggerPrompts.choices.map(entry => entry.itemId), [item.id]);
        const button = await waitForFact(() => document.querySelector(`.banter-trigger-alert[data-message-id='${prompt.id}'] [data-item-id='${item.id}']`), "the feat's floating prompt button");
        assert.exists(button);
        const posted = () => game.messages.filter(message => message.id !== prompt.id && message.content.includes("Defeat feat integration rules."));
        assert.lengthOf(posted(), 0);
        button.click();
        await waitForFact(() => posted().length === 1, "the feat's native chat card");
        assert.isTrue(prompt.flags.triggerPrompts.used);
        assert.deepEqual(item.toObject(), before, "posting the feat changes no item resources");
        button.click();
        await settle();
        assert.lengthOf(posted(), 1, "the claimed prompt cannot post a duplicate card");
        assert.equal(rolls, 0, "posting a feat never calls Item.roll");
        item.roll = nativeRoll;
      });
    });
  }, { displayName: "BANTER: Defeat triggers and feat prompts", preSelected: false });
  return key;
}
