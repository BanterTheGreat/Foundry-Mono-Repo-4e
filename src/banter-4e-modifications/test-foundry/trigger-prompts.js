import { RANGED_ATTACK, TriggerWorld, WEAPON_ATTACK, powerData, settle, waitForFact } from "./trigger-prompt-fixture.js";
import { ActorTriggerConfiguration } from "../scripts/modules/trigger-prompts/actor-trigger-configuration.js";
import { ItemTriggerAssignments } from "../scripts/modules/trigger-prompts/item-trigger-assignments.js";
import { PowerTriggerDialog } from "../scripts/modules/trigger-prompts/power-trigger-dialog.js";
import { TRIGGER_ID, TRIGGER_PROMPT_TIMEOUT_MS } from "../scripts/modules/trigger-prompts/constants.js";

const MODULE = "banter-4e-modifications";
const FLAG = "trigger-prompts";
const HIT = { total: 20, defense: 15 };
const MISS = { total: 5, defense: 15 };

/**
 * Register live trigger-prompt tests: every trigger, driven through the real Foundry hooks it
 * listens to, with a case that must prompt and a case that must not.
 */
export function registerTriggerPromptTests(quench) {
  const key = "banter-4e-modifications.trigger-prompts";
  quench.registerBatch(key, ({ describe, it, before, beforeEach, after, afterEach, assert }) => {
    describe("Trigger prompts in Foundry", function () {
      this.timeout(40000);
      let world;
      let stray;
      let currentTest = "(setup)";
      // Unhandled rejections are attributed to the running test, so a stray error from a hook
      // that races fixture cleanup can be traced rather than just failing the run.
      const recordRejection = event => stray.push({
        test: currentTest,
        message: String(event.reason?.message ?? event.reason).slice(0, 200),
        stack: String(event.reason?.stack ?? "").split("\n").slice(0, 10).map(line => line.trim()).join(" | "),
      });
      before(async function () {
        this.timeout(60000);
        stray = window.triggerPromptStrayErrors = [];
        window.addEventListener("unhandledrejection", recordRejection);
        world = await TriggerWorld.open();
      });
      beforeEach(function () {
        currentTest = this.currentTest.title;
      });
      afterEach(async function () {
        await world.endEncounter();
      });
      after(async function () {
        this.timeout(60000);
        await world?.close();
        await settle(1000);
        window.removeEventListener("unhandledrejection", recordRejection);
      });

      /** Assert that exactly these `creature:trigger` prompts exist after in-flight hooks settle. */
      async function assertPrompts(expected, message) {
        if (expected.length) {
          await waitForFact(() => world.prompts().length >= expected.length, `${expected.join(", ")} prompts`, 8000);
        }
        await settle();
        assert.deepEqual(world.promptSummary(), [...expected].sort(), message);
      }

      const hero = (powers, extra = {}) => ({ key: "hero", col: 5, row: 5, powers, ...extra });
      const enemy = (extra = {}) => ({ key: "enemy", col: 8, row: 5, disposition: -1, ...extra });
      const reaction = (...triggers) => powerData("Test Reaction", { triggers });

      describe("Opportunity attack", function () {
        const guard = (extra = {}) => ({ key: "guard", col: 10, row: 5, powers: [powerData("Test Opportunity Strike", { opportunity: true })], ...extra });
        const runner = { key: "runner", col: 5, row: 5, disposition: -1 };

        it("prompts a guard when a hostile creature moves past it", async function () {
          await world.encounter([guard(), runner]);
          await world.move("runner", 15, 5);
          const message = await world.waitForPrompt("guard", TRIGGER_ID.OPPORTUNITY_ATTACK);
          const prompt = message.flags.triggerPrompts;
          assert.deepEqual(prompt.choices.map(choice => choice.itemId), [world.powerId("guard", "Test Opportunity Strike")]);
          assert.include(prompt.recipientIds, game.user.id);
          assert.include(message.content, "runner moved adjacent to guard.");
          await assertPrompts(["guard:opportunity-attack"]);
        });

        it("does not prompt when the move only ends beside the guard", async function () {
          await world.encounter([guard(), runner]);
          await world.move("runner", 9, 5);
          await assertPrompts([], "ending adjacent is not provoking");
        });

        it("does not prompt when the move never comes near", async function () {
          await world.encounter([guard(), runner]);
          await world.move("runner", 15, 15);
          await assertPrompts([]);
        });

        it("does not prompt for a friendly creature passing by", async function () {
          await world.encounter([guard(), { key: "friend", col: 5, row: 6 }]);
          await world.move("friend", 15, 6);
          await assertPrompts([]);
        });

        it("respects the actor's opportunity-attack option", async function () {
          await world.encounter([guard({ actorFlags: { opportunityAttack: { enabled: false } } }), runner]);
          await world.move("runner", 15, 5);
          await assertPrompts([]);
        });

        it("measures a large guard from its whole footprint", async function () {
          // A 2x2 guard at columns 10-11 / rows 5-6: row 7 is adjacent to its lower edge, row 8 is not.
          await world.encounter([guard({ width: 2 }), { ...runner, row: 8 }, { key: "near", col: 5, row: 7, disposition: -1 }]);
          await world.move("near", 15, 7);
          await world.waitForPrompt("guard", TRIGGER_ID.OPPORTUNITY_ATTACK);
          for (const message of world.prompts()) {
            await message.delete();
          }
          await world.move("runner", 15, 8);
          await settle();
          assert.deepEqual(world.prompts().filter(message => message.content.includes("runner")), [], "two rows below is out of reach");
        });
      });

      describe("Enemy misses you", function () {
        it("prompts the missed creature", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU)]), enemy()]);
          await world.attack("enemy", ["hero"], MISS);
          const message = await world.waitForPrompt("hero", TRIGGER_ID.ENEMY_MISSES_YOU);
          assert.include(message.content, "enemy missed hero.");
          assert.deepEqual(message.flags.triggerPrompts.choices.map(choice => choice.itemId), [world.powerId("hero", "Test Reaction")]);
          await assertPrompts(["hero:enemy-misses-you"]);
        });

        it("does not prompt on a hit", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU)]), enemy()]);
          await world.attack("enemy", ["hero"], HIT);
          await assertPrompts([]);
        });

        it("treats a natural 1 as a miss and a natural 20 as a hit regardless of the total", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU)]), enemy()]);
          await world.attack("enemy", ["hero"], { natural: 20, defense: 99 });
          await settle();
          assert.deepEqual(world.promptSummary(), [], "a natural 20 hits");
          await world.attack("enemy", ["hero"], { natural: 1, defense: 1 });
          await assertPrompts(["hero:enemy-misses-you"], "a natural 1 misses");
        });

        it("does not prompt for a friendly attacker", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU)]), { key: "friend", col: 8, row: 5 }]);
          await world.attack("friend", ["hero"], MISS);
          await assertPrompts([]);
        });

        it("outside a started combat nothing prompts", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU)]), enemy()], { start: false });
          await world.attack("enemy", ["hero"], MISS);
          await assertPrompts([]);
        });
      });

      describe("Enemy misses you or an ally", function () {
        const ally = (key, row, range) => ({ key, col: 5, row, powers: [powerData("Test Reaction", { triggers: [{ triggerId: TRIGGER_ID.ENEMY_MISSES_ALLY, parameters: { rangeSquares: range } }] })] });

        it("prompts allies within their range, not those beyond it", async function () {
          await world.encounter([hero([]), enemy(), ally("near", 8, 5), ally("far", 20, 5)]);
          await world.attack("enemy", ["hero"], MISS);
          await world.waitForPrompt("near", TRIGGER_ID.ENEMY_MISSES_ALLY);
          await assertPrompts(["near:enemy-misses-ally"], "the far ally is out of range");
        });

        it("also prompts the missed creature itself", async function () {
          await world.encounter([hero([powerData("Test Reaction", { triggers: [TRIGGER_ID.ENEMY_MISSES_ALLY] })]), enemy()]);
          await world.attack("enemy", ["hero"], MISS);
          await assertPrompts(["hero:enemy-misses-ally"]);
        });

        it("does not prompt on a hit", async function () {
          await world.encounter([hero([]), enemy(), ally("near", 8, 5)]);
          await world.attack("enemy", ["hero"], HIT);
          await assertPrompts([]);
        });
      });

      describe("Enemy hits you", function () {
        it("prompts the creature that was hit", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_HITS_YOU)]), enemy()]);
          await world.attack("enemy", ["hero"], HIT);
          const message = await world.waitForPrompt("hero", TRIGGER_ID.ENEMY_HITS_YOU);
          assert.include(message.content, "enemy hit hero.");
          await assertPrompts(["hero:enemy-hits-you"]);
        });

        it("does not prompt on a miss", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_HITS_YOU)]), enemy()]);
          await world.attack("enemy", ["hero"], MISS);
          await assertPrompts([]);
        });

        it("honours the assigned range from the attacker", async function () {
          const within = powerData("Test Reaction", { triggers: [{ triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: { rangeSquares: 2 } }] });
          await world.encounter([hero([within]), enemy()]);
          await world.attack("enemy", ["hero"], HIT);
          await assertPrompts([], "the enemy is 3 squares away and the range is 2");
          await world.encounter([hero([within]), enemy({ col: 7 })]);
          await world.attack("enemy", ["hero"], HIT);
          await assertPrompts(["hero:enemy-hits-you"], "2 squares is in range");
        });

        it("does not offer a limited-use power that has no uses left", async function () {
          const spent = powerData("Spent Reaction", { triggers: [TRIGGER_ID.ENEMY_HITS_YOU] });
          spent.system.uses = { value: 0, max: "1", per: "encounter" };
          await world.encounter([hero([spent, powerData("Ready Reaction", { triggers: [TRIGGER_ID.ENEMY_HITS_YOU] })]), enemy()]);
          await world.attack("enemy", ["hero"], HIT);
          const message = await world.waitForPrompt("hero", TRIGGER_ID.ENEMY_HITS_YOU);
          assert.deepEqual(message.flags.triggerPrompts.choices.map(choice => choice.itemId), [world.powerId("hero", "Ready Reaction")]);
        });
      });

      describe("An attack against AC or Reflex misses you", function () {
        it("prompts for AC and Reflex but not for Fortitude or Will", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU)]), enemy()]);
          await world.attack("enemy", ["hero"], { ...MISS, defenseType: "fort" });
          await world.attack("enemy", ["hero"], { ...MISS, defenseType: "wil" });
          await settle();
          assert.deepEqual(world.promptSummary(), [], "Fortitude and Will do not qualify");
          await world.attack("enemy", ["hero"], { ...MISS, defenseType: "ref" });
          const message = await world.waitForPrompt("hero", TRIGGER_ID.ATTACK_AGAINST_AC_OR_REFLEX_MISSES_YOU);
          assert.include(message.content, "REF");
          await world.attack("enemy", ["hero"], { ...MISS, defenseType: "ac" });
          await waitForFact(() => world.prompts().length === 2, "the AC prompt");
        });
      });

      describe("You miss", function () {
        it("prompts the attacker who missed a hostile creature", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.YOU_MISS)]), enemy()]);
          await world.attack("hero", ["enemy"], MISS);
          await world.waitForPrompt("hero", TRIGGER_ID.YOU_MISS);
          await assertPrompts(["hero:you-miss"]);
        });

        it("does not prompt on a hit or when the target is an ally", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.YOU_MISS)]), enemy(), { key: "friend", col: 5, row: 6 }]);
          await world.attack("hero", ["enemy"], HIT);
          await world.attack("hero", ["friend"], MISS);
          await assertPrompts([]);
        });

        it("prompts only for the targets that were missed in a multi-target attack", async function () {
          await world.encounter([
            hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU)], { key: "heroA" }),
            { key: "heroB", col: 5, row: 7, powers: [reaction(TRIGGER_ID.ENEMY_MISSES_YOU)] },
            enemy(),
          ]);
          // One roll of 20 against two defenses: it hits the 15 and misses the 25.
          await world.attack("enemy", ["heroA", "heroB"], { total: 20, defense: [15, 25] });
          await assertPrompts(["heroB:enemy-misses-you"]);
        });
      });

      describe("A creature you marked hits an ally", function () {
        const reminder = { actorLevelTriggers: { [TRIGGER_ID.MARKED_ENEMY_HITS_ALLY]: { enabled: true } } };
        const layout = (heroExtra = {}, enemyExtra = {}) => [
          hero([], { actorFlags: reminder, ...heroExtra }),
          enemy({ markedBy: "hero", ...enemyExtra }),
          { key: "ally", col: 5, row: 8 },
          { key: "other", col: 9, row: 5, disposition: -1 },
        ];

        it("reminds the mark owner when its marked enemy hits an ally", async function () {
          await world.encounter(layout());
          await world.attack("enemy", ["ally"], HIT);
          const message = await world.waitForPrompt("hero", TRIGGER_ID.MARKED_ENEMY_HITS_ALLY);
          assert.include(message.content, "enemy, marked by hero, hit ally.");
          assert.deepEqual(message.flags.triggerPrompts.choices, [], "a reminder offers no power");
          await assertPrompts(["hero:marked-enemy-hits-ally"]);
        });

        it("does not prompt for an enemy the actor has not marked, or a miss, or a hit on the owner", async function () {
          await world.encounter(layout());
          await world.attack("other", ["ally"], HIT);
          await world.attack("enemy", ["ally"], MISS);
          await world.attack("enemy", ["hero"], HIT);
          await assertPrompts([]);
        });

        it("does not prompt unless the actor turned the reminder on", async function () {
          await world.encounter(layout({ actorFlags: undefined }));
          await world.attack("enemy", ["ally"], HIT);
          await assertPrompts([]);
        });
      });

      describe("A creature you marked becomes bloodied", function () {
        const layout = () => [hero([reaction(TRIGGER_ID.MARKED_CREATURE_BLOODIED)]), enemy({ markedBy: "hero" }), { key: "other", col: 9, row: 5, disposition: -1 }];

        it("prompts the mark owner when the marked creature drops to bloodied", async function () {
          await world.encounter(layout());
          await world.setHp("enemy", 15);
          const message = await world.waitForPrompt("hero", TRIGGER_ID.MARKED_CREATURE_BLOODIED);
          assert.include(message.content, "enemy, marked by hero, became bloodied.");
          await assertPrompts(["hero:marked-creature-bloodied"]);
        });

        it("does not prompt above the bloodied line, for an unmarked creature, or once already bloodied", async function () {
          await world.encounter(layout());
          await world.setHp("enemy", 30);
          await world.setHp("other", 10);
          await world.setHp("enemy", 18);
          await assertPrompts(["hero:marked-creature-bloodied"], "only the 30 -> 18 step crosses the line");
          await world.setHp("enemy", 5);
          await settle();
          assert.lengthOf(world.prompts(), 1, "further damage while bloodied is not a new transition");
        });
      });

      describe("You become bloodied", function () {
        it("prompts when the creature's own HP crosses the bloodied line", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.YOU_BECOME_BLOODIED)]), enemy()]);
          await world.setHp("hero", 10);
          const message = await world.waitForPrompt("hero", TRIGGER_ID.YOU_BECOME_BLOODIED);
          assert.include(message.content, "hero became bloodied.");
          await assertPrompts(["hero:you-become-bloodied"]);
        });

        it("does not prompt above the line, on healing, or when already bloodied", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.YOU_BECOME_BLOODIED)], { hp: 10 }), enemy()]);
          await world.setHp("hero", 5);
          await world.setHp("hero", 40);
          await world.setHp("hero", 30);
          await assertPrompts([]);
        });
      });

      describe("You are hit by a melee attack", function () {
        it("prompts for a weapon (melee) hit but not a ranged one", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK)]), enemy()]);
          await world.attack("enemy", ["hero"], { ...HIT, power: RANGED_ATTACK });
          await settle();
          assert.deepEqual(world.promptSummary(), [], "a ranged hit does not qualify");
          await world.attack("enemy", ["hero"], { ...HIT, power: WEAPON_ATTACK });
          const message = await world.waitForPrompt("hero", TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK);
          assert.include(message.content, "with a melee attack");
        });

        it("does not prompt on a melee miss", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK)]), enemy()]);
          await world.attack("enemy", ["hero"], { ...MISS, power: WEAPON_ATTACK });
          await assertPrompts([]);
        });
      });

      describe("An adjacent creature you marked moves", function () {
        const layout = (enemyExtra = {}) => [hero([reaction(TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT)]), enemy({ col: 6, markedBy: "hero", ...enemyExtra }), { key: "other", col: 6, row: 6, disposition: -1 }];

        it("prompts the mark owner when the marked creature moves away from beside them", async function () {
          await world.encounter(layout());
          await world.move("enemy", 6, 12);
          const message = await world.waitForPrompt("hero", TRIGGER_ID.MARKED_CREATURE_SHIFTS_ADJACENT);
          assert.include(message.content, "enemy, marked by hero, moved while adjacent.");
          await assertPrompts(["hero:marked-creature-moves-adjacent"]);
        });

        it("does not prompt when it never starts or passes adjacent, or for an unmarked creature", async function () {
          await world.encounter(layout({ col: 15, row: 15 }));
          await world.move("enemy", 20, 15);
          await world.move("other", 6, 12);
          await assertPrompts([]);
        });
      });

      describe("Fails a saving throw", function () {
        it("prompts after a real failed save", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.FAILS_SAVING_THROW)]), enemy()]);
          await world.rollSave("hero", { fail: true });
          const message = await world.waitForPrompt("hero", TRIGGER_ID.FAILS_SAVING_THROW, 15000);
          assert.include(message.content, "hero failed a saving throw.");
          await assertPrompts(["hero:fails-saving-throw"]);
        });

        it("does not prompt after a successful save", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.FAILS_SAVING_THROW)]), enemy()]);
          await world.rollSave("hero", { fail: false });
          await settle(1500);
          assert.deepEqual(world.promptSummary(), []);
        });
      });

      describe("Event handling", function () {
        it("keeps simultaneous attacks apart and credits each result to its own attacker", async function () {
          await world.encounter([
            hero([powerData("Miss Reaction", { triggers: [TRIGGER_ID.ENEMY_MISSES_YOU] }), powerData("Hit Reaction", { triggers: [TRIGGER_ID.ENEMY_HITS_YOU] })]),
            enemy({ key: "alpha" }),
            enemy({ key: "beta", col: 8, row: 6 }),
          ]);
          // Both attacks begin before either message exists, and their messages arrive in the opposite order.
          const alpha = world.startAttack("alpha", ["hero"], MISS);
          const beta = world.startAttack("beta", ["hero"], HIT);
          await beta();
          await alpha();
          await assertPrompts(["hero:enemy-hits-you", "hero:enemy-misses-you"]);
          assert.include(world.prompts({ triggerId: TRIGGER_ID.ENEMY_MISSES_YOU })[0].content, "alpha missed hero.");
          assert.include(world.prompts({ triggerId: TRIGGER_ID.ENEMY_HITS_YOU })[0].content, "beta hit hero.");
        });

        it("delivers one prompt per eligible creature and trigger for a single event", async function () {
          await world.encounter([
            hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU, TRIGGER_ID.ENEMY_MISSES_ALLY)]),
            { key: "friend", col: 5, row: 6, powers: [reaction(TRIGGER_ID.ENEMY_MISSES_ALLY)] },
            enemy(),
          ]);
          await world.attack("enemy", ["hero"], MISS);
          await assertPrompts(["friend:enemy-misses-ally", "hero:enemy-misses-ally", "hero:enemy-misses-you"]);
        });
      });

      describe("Prompt cards", function () {
        async function oneCard() {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_HITS_YOU)]), enemy()]);
          await world.attack("enemy", ["hero"], HIT);
          return world.waitForPrompt("hero", TRIGGER_ID.ENEMY_HITS_YOU);
        }

        it("is whispered to this GM with a ten second stored deadline", async function () {
          const message = await oneCard();
          assert.include(message.whisper, game.user.id);
          const prompt = message.flags.triggerPrompts;
          assert.isFalse(prompt.used);
          assert.approximately(prompt.expiresAt - Date.now(), TRIGGER_PROMPT_TIMEOUT_MS, 3000);
          assert.equal(prompt.actorUuid, world.get("hero").actor.uuid);
          assert.equal(message.author.id, game.user.id);
        });

        it("is claimed exactly once, persisting through a real message update", async function () {
          const message = await oneCard();
          const itemId = world.powerId("hero", "Test Reaction");
          const chat = game.TriggerPrompts.promptChat;
          const [first, second] = await Promise.all([chat.claimPrompt(message.id, itemId), chat.claimPrompt(message.id, itemId)]);
          assert.deepEqual([Boolean(first), Boolean(second)].sort(), [false, true], "exactly one claim wins");
          await waitForFact(() => game.messages.get(message.id).flags.triggerPrompts.used === true, "the persisted claim");
          assert.isNull(await chat.claimPrompt(message.id, itemId), "a claimed prompt cannot be claimed again");
        });

        it("refuses a claim for a power the prompt never offered", async function () {
          const message = await oneCard();
          assert.isNull(await game.TriggerPrompts.promptChat.claimPrompt(message.id, world.powerId("hero", WEAPON_ATTACK)));
          assert.isFalse(game.messages.get(message.id).flags.triggerPrompts.used);
        });

        it("is deleted when dismissed, but a claimed prompt cannot be dismissed", async function () {
          const message = await oneCard();
          const chat = game.TriggerPrompts.promptChat;
          assert.isTrue(await chat.dismissPrompt(message.id));
          await waitForFact(() => !game.messages.has(message.id), "the dismissed card to be deleted");
          const another = await (async () => {
            await world.attack("enemy", ["hero"], HIT);
            return waitForFact(() => world.prompts({ key: "hero" })[0], "a second card");
          })();
          await chat.claimPrompt(another.id, world.powerId("hero", "Test Reaction"));
          await waitForFact(() => game.messages.get(another.id)?.flags.triggerPrompts.used, "the claim");
          assert.isFalse(await chat.dismissPrompt(another.id));
          assert.isTrue(game.messages.has(another.id));
        });

        it("removes itself after its deadline without any user action", async function () {
          this.timeout(30000);
          const message = await oneCard();
          await waitForFact(() => !game.messages.has(message.id), "the expired card to be deleted", TRIGGER_PROMPT_TIMEOUT_MS + 6000);
        });

        it("is swept at startup once expired", async function () {
          const message = await oneCard();
          await message.update({ "flags.triggerPrompts.expiresAt": Date.now() - 60000 });
          await game.TriggerPrompts.promptChat.sweepExpiredPrompts();
          await waitForFact(() => !game.messages.has(message.id), "the sweep to delete the expired card");
        });

        it("renders its power button until used", async function () {
          const message = await oneCard();
          ui.sidebar.expand();
          ui.sidebar.changeTab("chat", "primary");
          await ui.chat.render({ force: true });
          const element = await waitForFact(() => ui.chat.element?.querySelector(`li[data-message-id="${message.id}"]`), "the rendered card");
          assert.exists(element.querySelector("[data-trigger-prompt-action='use']"));
          assert.include(element.querySelector("[data-trigger-prompt-action='dismiss']").textContent, "Ignore (");
        });
      });

      describe("Outcomes handed over by Player Defense or Target Automation", function () {
        // Target Automation calls this entry point when the GM applies a managed attack's results,
        // and Player Defense calls it for an unmanaged one, so one test covers the shared seam.
        const outcome = (outcomeName, defenseType = "ac") => game.TriggerPrompts.handleActiveDefenseOutcome({
          attackerActorId: world.get("enemy").actor.id, attackerTokenId: world.get("enemy").token.id, sceneId: world.scene.id,
          targetActorId: world.get("hero").actor.id, targetTokenId: world.get("hero").token.id, targetSceneId: world.scene.id,
          defenseType, attackRange: "weapon",
        }, outcomeName);

        it("prompts for a resolved miss exactly as a rolled attack would", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_MISSES_YOU, TRIGGER_ID.ENEMY_HITS_YOU)]), enemy()]);
          await outcome("miss");
          await assertPrompts(["hero:enemy-misses-you"]);
        });

        it("prompts for a resolved hit, including its melee and defense details", async function () {
          await world.encounter([hero([reaction(TRIGGER_ID.ENEMY_HITS_YOU, TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK)]), enemy()]);
          await outcome("hit", "WIL");
          await assertPrompts(["hero:enemy-hits-you", "hero:you-are-hit-by-melee-attack"]);
        });
      });

      describe("Configuration stored on powers", function () {
        async function powerOnActor(data) {
          await world.encounter([hero([data]), enemy()], { start: false });
          return world.get("hero").actor.items.find(item => item.name === data.name);
        }

        it("replaces the whole assignment list on save, as a real flag array", async function () {
          const item = await powerOnActor(powerData("Configurable"));
          await ItemTriggerAssignments.write(item, [
            { triggerId: TRIGGER_ID.YOU_MISS, parameters: {}, source: "manual" },
            { triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: { rangeSquares: 4 }, source: "text" },
          ]);
          assert.lengthOf(item.getFlag(MODULE, FLAG).assignments, 2);
          await ItemTriggerAssignments.write(item, [{ triggerId: TRIGGER_ID.YOU_MISS, parameters: {}, source: "manual" }]);
          assert.deepEqual(item.getFlag(MODULE, FLAG).assignments.map(assignment => assignment.triggerId), [TRIGGER_ID.YOU_MISS], "a dropped assignment must not linger");
          await ItemTriggerAssignments.write(item, []);
          assert.deepEqual(ItemTriggerAssignments.read(item), { configured: true, assignments: [] });
        });

        it("keeps its assignments when the power is copied to another actor or the world", async function () {
          const item = await powerOnActor(powerData("Traveller", { triggers: [{ triggerId: TRIGGER_ID.ENEMY_HITS_YOU, parameters: { rangeSquares: 6 } }] }));
          const [copy] = await world.get("enemy").actor.createEmbeddedDocuments("Item", [item.toObject()]);
          assert.deepEqual(ItemTriggerAssignments.read(copy).assignments.map(a => [a.triggerId, a.parameters.rangeSquares]), [[TRIGGER_ID.ENEMY_HITS_YOU, 6]]);
          const worldItem = await Item.create({ ...item.toObject(), name: `[Integration test ${world.sceneDocuments.runId}] World copy` });
          try {
            assert.deepEqual(ItemTriggerAssignments.read(worldItem).assignments.map(a => a.triggerId), [TRIGGER_ID.ENEMY_HITS_YOU]);
          } finally {
            await worldItem.delete();
          }
        });

        it("moves assignments from an actor flag onto the powers once, preserving actor options", async function () {
          const item = await powerOnActor(powerData("Legacy Power"));
          const actor = world.get("hero").actor;
          await actor.setFlag(MODULE, FLAG, {
            opportunityAttack: { enabled: false },
            actorLevelTriggers: { [TRIGGER_ID.MARKED_ENEMY_HITS_ALLY]: { enabled: true } },
            assignments: [{ id: "old", itemId: item.id, triggerId: TRIGGER_ID.YOU_MISS, parameters: {} }],
          });
          assert.lengthOf(ActorTriggerConfiguration.eligibleAssignmentsFor(actor, { id: TRIGGER_ID.YOU_MISS }), 1, "the legacy assignment still applies before migration");
          assert.equal(await ActorTriggerConfiguration.migrateLegacyAssignments(actor), 1);
          assert.deepEqual(ItemTriggerAssignments.read(item).assignments.map(a => a.triggerId), [TRIGGER_ID.YOU_MISS]);
          assert.deepEqual(actor.getFlag(MODULE, FLAG).assignments, [], "the actor flag's list is emptied, not merged");
          assert.isFalse(actor.getFlag(MODULE, FLAG).opportunityAttack.enabled);
          assert.isTrue(actor.getFlag(MODULE, FLAG).actorLevelTriggers[TRIGGER_ID.MARKED_ENEMY_HITS_ALLY].enabled);
          assert.equal(await ActorTriggerConfiguration.migrateLegacyAssignments(actor), 0, "a second run has nothing to move");
        });

        it("adds the Triggers control to a power's sheet for a user who owns it", async function () {
          const item = await powerOnActor(powerData("Sheet Power"));
          const controls = [];
          Hooks.callAll("getHeaderControlsApplicationV2", item.sheet, controls);
          const legacy = [];
          Hooks.callAll("getItemSheetHeaderButtons", item.sheet, legacy);
          assert.isTrue([...controls, ...legacy].some(control => /trigger/i.test(control.label ?? "")), "one of the two sheet generations must offer the control");
        });
      });

      describe("Suggesting triggers from a power's trigger text", function () {
        async function openDialog(item) {
          PowerTriggerDialog.show(item);
          return waitForFact(() => [...foundry.applications.instances.values()].find(app => app.title?.includes(item.name) && app.element?.querySelector(".trigger-prompts-config")),
            "the trigger dialog");
        }
        const change = (control, checked) => {
          control.checked = checked;
          control.dispatchEvent(new Event("change", { bubbles: true }));
        };

        it("starts off, then shows and ticks suggestions only on request, and stores nothing until Save", async function () {
          this.timeout(30000);
          await world.encounter([hero([powerData("Parry", { trigger: "An enemy within 4 squares of you hits you with a melee attack" })]), enemy()], { start: false });
          const item = world.get("hero").actor.items.find(candidate => candidate.name === "Parry");
          const app = await openDialog(item);
          try {
            const form = app.element.querySelector("form");
            const toggle = form.querySelector("[name='suggestFromText']");
            const panel = form.querySelector(".trigger-prompts-suggestions__panel");
            const ticked = () => [...form.querySelectorAll("input[name$='.enabled']")].filter(input => input.checked).map(input => input.name.replace(".enabled", ""));
            assert.isFalse(toggle.checked, "suggestions are off when the dialog opens");
            assert.isTrue(panel.hidden);
            assert.deepEqual(ticked(), []);

            change(toggle, true);
            assert.isFalse(panel.hidden);
            assert.deepEqual(ticked(), [TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK], "the more specific melee trigger replaces 'enemy hits you'");
            assert.include(panel.textContent, "matched");
            assert.include(panel.textContent, "Not checked");
            assert.isUndefined(item.getFlag(MODULE, FLAG), "nothing is stored by ticking the box");

            change(toggle, false);
            assert.isTrue(panel.hidden);
            assert.deepEqual(ticked(), [], "unticking restores the rows");

            change(toggle, true);
            app.element.querySelector("button[data-action='save']").click();
            await waitForFact(() => item.getFlag(MODULE, FLAG)?.assignments?.length, "the saved assignment");
            const [saved] = item.getFlag(MODULE, FLAG).assignments;
            assert.equal(saved.triggerId, TRIGGER_ID.YOU_ARE_HIT_BY_MELEE_ATTACK);
            assert.equal(saved.source, "text");
          } finally {
            await app.close();
          }
        });

        it("copies a distance from the text into the range field", async function () {
          this.timeout(30000);
          await world.encounter([hero([powerData("Armor", { trigger: "An enemy within 5 squares of you hits you" })]), enemy()], { start: false });
          const item = world.get("hero").actor.items.find(candidate => candidate.name === "Armor");
          const app = await openDialog(item);
          try {
            const form = app.element.querySelector("form");
            change(form.querySelector("[name='suggestFromText']"), true);
            assert.isTrue(form.elements[`${TRIGGER_ID.ENEMY_HITS_YOU}.enabled`].checked);
            assert.equal(form.elements[`${TRIGGER_ID.ENEMY_HITS_YOU}.rangeSquares`].value, "5");
          } finally {
            await app.close();
          }
        });

        it("says so when nothing in the text is recognised", async function () {
          this.timeout(30000);
          await world.encounter([hero([powerData("Initiative", { trigger: "You roll initiative" })]), enemy()], { start: false });
          const item = world.get("hero").actor.items.find(candidate => candidate.name === "Initiative");
          const app = await openDialog(item);
          try {
            const form = app.element.querySelector("form");
            change(form.querySelector("[name='suggestFromText']"), true);
            assert.include(form.querySelector(".trigger-prompts-suggestions__panel").textContent, "No known trigger matches");
            assert.deepEqual([...form.querySelectorAll("input[name$='.enabled']")].filter(input => input.checked), []);
          } finally {
            await app.close();
          }
        });
      });
    });
  }, { displayName: "BANTER: Trigger prompts", preSelected: false });
  return key;
}
