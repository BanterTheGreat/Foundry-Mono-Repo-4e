import { TriggerWorld, powerData, WEAPON_ATTACK, RANGED_ATTACK, settle, waitForFact } from "./trigger-prompt-fixture.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";
import { TriggerItemLimits } from "../scripts/modules/trigger-prompts/trigger-item-limits.js";
import { PowerTriggerDialog } from "../scripts/modules/trigger-prompts/power-trigger-dialog.js";

const MODULE = "banter-4e-modifications";
const FLAG = "trigger-prompts";

/** Exercise restrictions and persisted allowances against native documents, combat and rest. */
export function registerTriggerLimitTests(quench) {
  const key = "banter-4e-modifications.trigger-limits";
  quench.registerBatch(key, ({ describe, it, before, beforeEach, afterEach, after, assert }) => {
    describe("Trigger restrictions and shared limits", function () {
      this.timeout(40000);
      let world;
      let currentTest;
      const rejection = event => window.triggerPromptStrayErrors.push({ test: currentTest, message: String(event.reason?.message ?? event.reason), stack: event.reason?.stack });
      const bloody = TRIGGER_ID.YOU_BLOODY_ENEMY;
      const defeat = TRIGGER_ID.YOU_REDUCE_ENEMY_TO_ZERO;
      const allyDefeat = TRIGGER_ID.ALLY_REDUCED_TO_ZERO;
      const feat = (triggers, limit = "none", parameters = {}) => ({
        name: "Limited Trigger Feat", type: "feature",
        system: { description: { value: "<p>Shared trigger allowance test.</p>" } },
        flags: { [MODULE]: { [FLAG]: { version: 1, limit, assignments: triggers.map(triggerId => ({ triggerId, parameters })) } } },
      });
      const hero = (item, extra = {}) => ({ key: "hero", col: 5, row: 5, powers: [item], ...extra });
      const enemy = (extra = {}) => ({ key: "enemy", col: 6, row: 5, disposition: -1, ...extra });
      const item = () => world.get("hero").actor.items.find(entry => entry.name === "Limited Trigger Feat");

      before(async function () {
        this.timeout(60000);
        window.triggerPromptStrayErrors = [];
        window.addEventListener("unhandledrejection", rejection);
        world = await TriggerWorld.open();
      });
      beforeEach(function () { currentTest = this.currentTest.title; });
      afterEach(async function () { await world?.endEncounter(); });
      after(async function () {
        this.timeout(60000);
        try { await world?.close(); await settle(); }
        finally { window.removeEventListener("unhandledrejection", rejection); }
      });

      /** Persist a native damage receipt, then let real DnD4e HP hooks report its change. */
      async function damageTo(hp, { targetKey = "enemy", power = WEAPON_ATTACK } = {}) {
        const source = world.get("hero");
        const target = world.get(targetKey);
        const attack = source.actor.items.find(entry => entry.name === power);
        const before = target.actor.system.attributes.hp.value;
        const temp = Number(target.actor.system.attributes.temphp.value);
        const message = await world.encounterDocuments.createMessage({
          content: "[Integration test] Shared allowance damage receipt",
          speaker: { scene: world.scene.id, actor: source.actor.id, token: source.token.id },
          flags: { "dnd4e-health-display": {
            damageApplication: { sceneId: world.scene.id, itemUuid: attack.uuid },
            attackResults: { casterId: source.token.id, itemUuid: attack.uuid },
            damageApplications: { [target.token.id]: { state: "applying", health: { before, after: hp } } },
          } },
        });
        await target.actor.applyDamage(before - hp + temp);
        await message.update({ [`flags.dnd4e-health-display.damageApplications.${target.token.id}.state`]: "applied" });
      }

      async function clearPrompts() {
        for (const message of world.prompts()) {
          await game.TriggerPrompts.promptChat.dismissPrompt(message.id);
        }
      }

      it("tracer: attributes a native bloodying hit and excludes minions with a positive control", async function () {
        await world.encounter([hero(feat([bloody], "none", { nonMinion: true })), enemy({ type: "NPC" })]);
        await world.get("enemy").actor.update({ "system.details.role.secondary": "minion" });
        await damageTo(20);
        await settle();
        assert.lengthOf(world.prompts(), 0, "a minion does not qualify");
        await world.get("enemy").actor.update({ "system.details.role.secondary": "standard" });
        await world.setHp("enemy", 40);
        await damageTo(20);
        await world.waitForPrompt("hero", bloody);
        assert.lengthOf(world.prompts(), 1);
      });

      it("melee and adjacency restrictions reject ranged hits and reach beyond adjacency", async function () {
        await world.encounter([hero(feat([bloody], "none", { meleeOnly: true, adjacentOnly: true })), enemy()]);
        await damageTo(20, { power: RANGED_ATTACK });
        await settle();
        assert.lengthOf(world.prompts(), 0, "ranged damage does not qualify");
        await world.setHp("enemy", 40);
        await world.move("enemy", 7, 5);
        await damageTo(20);
        await settle();
        assert.lengthOf(world.prompts(), 0, "a melee hit two squares away is not adjacent");
        await world.setHp("enemy", 40);
        await world.move("enemy", 6, 5);
        await damageTo(20);
        await world.waitForPrompt("hero", bloody);
      });

      it("ally defeat includes another ally, excludes self and enemies, and fires only on crossing zero", async function () {
        await world.encounter([hero(feat([allyDefeat])), enemy(), { key: "ally", col: 7, row: 5 }]);
        await world.setHp("hero", 0);
        await world.setHp("enemy", 0);
        await world.setHp("ally", 1);
        await settle();
        assert.lengthOf(world.prompts(), 0);
        await world.setHp("ally", -1);
        await world.waitForPrompt("hero", allyDefeat);
        await world.setHp("ally", -5);
        await world.setHp("ally", 40);
        await settle();
        assert.lengthOf(world.prompts(), 1);
      });

      it("one item shares its turn allowance across bloodied and defeat triggers and concurrent claims", async function () {
        await world.encounter([hero(feat([bloody, defeat], "turn")), enemy()]);
        await damageTo(0);
        const prompt = await world.waitForPrompt("hero", bloody);
        await settle();
        assert.lengthOf(world.prompts(), 1, "one hit crossing both thresholds creates one prompt");
        const claims = await Promise.all([game.TriggerPrompts.promptChat.claimPrompt(prompt.id, item().id), game.TriggerPrompts.promptChat.claimPrompt(prompt.id, item().id)]);
        assert.equal(claims.filter(Boolean).length, 1, "exactly one claimant wins");
        await world.setHp("enemy", 40);
        await damageTo(20);
        await settle();
        assert.lengthOf(world.prompts(), 1, "another threshold in the same turn is suppressed");
        await world.combat.nextTurn();
        await damageTo(0);
        await world.waitForPrompt("hero", defeat);
        assert.lengthOf(world.prompts(), 2, "the next creature's turn refreshes the item allowance");
      });

      it("ignoring a turn-limited prompt releases it, and a new handler retains first-encounter state", async function () {
        await world.encounter([hero(feat([bloody, defeat], "turn")), enemy()]);
        await damageTo(20);
        await world.waitForPrompt("hero", bloody);
        await clearPrompts();
        await damageTo(0);
        const next = await world.waitForPrompt("hero", defeat);
        assert.exists(next, "Ignore leaves the turn allowance available");
        await clearPrompts();
        await item().setFlag(MODULE, FLAG, { limit: "firstEncounter" });
        await world.setHp("enemy", 40);
        await damageTo(20);
        await world.waitForPrompt("hero", bloody);
        await clearPrompts();
        const restored = new TriggerItemLimits(game.TriggerPrompts.socket);
        assert.isNull(await restored.request(item(), "offer"), "reloading the handler does not reset encounter state");
        await world.combat.nextTurn();
        await damageTo(0);
        await settle();
        assert.lengthOf(world.prompts(), 0, "the ignored first occurrence remains the first for this encounter");
      });

      it("daily usage survives Short Rest and refreshes through the real Extended Rest method", async function () {
        await world.encounter([hero(feat([allyDefeat], "day")), enemy(), { key: "ally", col: 7, row: 5 }]);
        await world.setHp("ally", 0);
        const prompt = await world.waitForPrompt("hero", allyDefeat);
        assert.exists(await game.TriggerPrompts.promptChat.claimPrompt(prompt.id, item().id));
        await world.get("hero").actor.shortRest(null, { surge: 0 });
        await world.setHp("ally", 40);
        await world.setHp("ally", 0);
        await settle();
        assert.lengthOf(world.prompts(), 1, "Short Rest does not refresh daily usage");
        await world.get("hero").actor.longRest(null, { envi: true });
        await world.setHp("ally", 40);
        await world.setHp("ally", -1);
        await waitForFact(() => world.prompts().length === 2, "the post-Extended-Rest daily prompt");
      });

      it("first-encounter usage refreshes for the same feat document in a new combat", async function () {
        await world.encounter([hero(feat([bloody], "firstEncounter")), enemy()]);
        await damageTo(20);
        const first = await world.waitForPrompt("hero", bloody);
        assert.exists(await game.TriggerPrompts.promptChat.claimPrompt(first.id, item().id));
        await world.setHp("enemy", 40);
        await damageTo(20);
        await settle();
        assert.lengthOf(world.prompts(), 1);
        const savedItemUuid = item().uuid;
        await world.combat.delete();
        world.combat = await Combat.create({ scene: world.scene.id, flags: { "foundry-test-harness": { runId: world.encounterDocuments.runId } } });
        await world.combat.createEmbeddedDocuments("Combatant", [...world.entries.values()].map((entry, index) => ({
          tokenId: entry.token.id, sceneId: world.scene.id, actorId: entry.actor.id, initiative: 20 - index,
        })));
        await world.combat.startCombat();
        await waitForFact(() => game.combat?.id === world.combat.id && game.combat.started, "the replacement encounter");
        assert.equal(item().uuid, savedItemUuid);
        await world.setHp("enemy", 40);
        await damageTo(20);
        await waitForFact(() => world.prompts().length === 2, "the first event in the new encounter");
      });

      it("a prompt from the previous turn cannot claim the refreshed allowance", async function () {
        await world.encounter([hero(feat([bloody, defeat], "turn")), enemy()]);
        await damageTo(20);
        const old = await world.waitForPrompt("hero", bloody);
        await world.combat.nextTurn();
        assert.isNull(await game.TriggerPrompts.promptChat.claimPrompt(old.id, item().id));
        await damageTo(0);
        const fresh = await world.waitForPrompt("hero", defeat);
        assert.exists(await game.TriggerPrompts.promptChat.claimPrompt(fresh.id, item().id));
      });

      it("the feat dialog persists all restrictions and its shared limit", async function () {
        await world.encounter([hero(feat([])), enemy()], { start: false });
        PowerTriggerDialog.show(item());
        const app = await waitForFact(() => [...foundry.applications.instances.values()].find(entry => entry.title?.includes(item().name) && entry.element?.querySelector(".trigger-prompts-config")), "the restrictions dialog");
        try {
          const form = app.element.querySelector("form");
          for (const field of ["enabled", "nonMinion", "meleeOnly", "adjacentOnly"]) {
            form.elements[`${bloody}.${field}`].checked = true;
          }
          form.elements.sharedLimit.value = "firstEncounter";
          app.element.querySelector("button[data-action='save']").click();
          await waitForFact(() => item().getFlag(MODULE, FLAG)?.limit === "firstEncounter", "saved restriction configuration");
          assert.deepEqual(item().getFlag(MODULE, FLAG).assignments[0].parameters, { nonMinion: true, meleeOnly: true, adjacentOnly: true });
        } finally { await app.close(); }
      });
    });
  }, { displayName: "BANTER: Trigger restrictions and shared limits", preSelected: false });
  return key;
}
