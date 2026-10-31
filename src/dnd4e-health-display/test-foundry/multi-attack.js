import { useAbility } from "../scripts/power-activation/power-activation.js";
import { applyTargetDamage, damageApplicationTargets } from "../scripts/power-activation/damage-application-data.js";
import { TargetAutomationFixture, basePower, waitForFact } from "./target-automation-fixture.js";

const MODULE = "dnd4e-health-display";

/** The one native attack dialog a user sees; later attackers' dialogs hide themselves. */
const visibleDialog = () => [...document.querySelectorAll("form.application.roll-dialogue")]
  .find(form => form.style.display !== "none");

/** Submit the visible native dialog through the form itself, as its Roll button does. */
async function submitFirstDialog(edit) {
  const form = await waitForFact(visibleDialog, "the visible native attack dialog");
  edit?.(form);
  form.requestSubmit();
}

/** Start the production attack and answer its one dialog; resolves when every attacker has rolled. */
async function runAttack(session, edit) {
  const running = session.attack();
  await submitFirstDialog(edit);
  await running;
}

/**
 * Three unlinked minions of one NPC type standing around the fixture's creatures.
 * minion1 (1200,1000) and minion2 (1200,1100) are adjacent to `slowed`; minion3 (1200,900) is not.
 * All three are adjacent to `enemy` (1100,1000).
 */
class MultiAttackFixture extends TargetAutomationFixture {
  minions = [];
  dialogs = [];

  /**
   * @param {{count?: number, range?: string}} options Targets per attacker and the melee range formula.
   */
  constructor({ count = 1, range = "1" } = {}) {
    super();
    this.count = count;
    this.range = range;
  }

  /** Build the base scene, then one NPC with a Melee power and three unlinked tokens of it. */
  async setup() {
    // Foundry refuses to switch scenes while the previous view is still loading its assets.
    await waitForFact(() => canvas.ready, "the previous scene to finish loading", 30000);
    // Mocha reports an uncaught async error as "done() called multiple times" and hides its stack.
    // Log the real error with its stack as soon as it happens.
    this.errorListener = event => console.error("MULTI-ATTACK uncaught error:", event.error?.stack ?? event.message);
    this.rejectionListener = event => console.error("MULTI-ATTACK unhandled rejection:", event.reason?.stack ?? event.reason);
    window.addEventListener("error", this.errorListener);
    window.addEventListener("unhandledrejection", this.rejectionListener);
    await super.setup();
    try {
      this.originalDice = CONFIG.Dice.randomUniform;
      // Foundry maps faces with ceil((1 - randomUniform) * faces): every d20 shows 11.
      CONFIG.Dice.randomUniform = () => 0.45;
      const power = foundry.utils.mergeObject(foundry.utils.deepClone(basePower), {
        name: "Minion claw",
        flags: { [MODULE]: { targetAutomation: { enabled: true, targetCount: this.count } } },
        system: { rangeType: "melee", rangePower: this.range, attack: { isAttack: true, formula: "100", def: "ac" },
          hit: { isDamage: true, formula: "7", critFormula: "14" } },
      }, { inplace: false });
      this.actors.minion = await this.documents.createActor({ items: [power] });
      this.itemId = this.actors.minion.itemTypes.power[0].id;
      for (const [index, [x, y]] of [[1200, 1000], [1200, 1100], [1200, 900]].entries()) {
        const source = await this.actors.minion.getTokenDocument({ name: `minion${index + 1}`, x, y, disposition: -1,
          actorLink: false, flags: { "foundry-test-harness": { runId: this.documents.runId } } });
        const [token] = await this.scene.createEmbeddedDocuments("Token", [source.toObject()]);
        this.documents.documents.push(token);
        this.minions.push(token.object);
      }
      // Scope every card and roll the minions make to this fixture, as the base fixture does for its actors.
      this.minionPreCreate = Hooks.on("preCreateChatMessage", (message, data, options) => {
        if (message.speaker.actor === this.actors.minion.id) {
          message.updateSource({ "flags.foundry-test-harness.runId": this.documents.runId });
          options.notify = false;
        }
      });
      // Record every native dialog (visible or hidden) in the order it opened.
      this.dialogHook = Hooks.on("renderApplicationV2", app => {
        if (app.rollConfig?.options?.powerActivationSession && !this.dialogs.some(entry => entry.app === app)) {
          // Keep the node: a closed application no longer exposes its element.
          this.dialogs.push({ app, element: app.element });
        }
      });
      return this;
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /** @param {Token} token A minion. @returns {Item} That minion's own copy of the power. */
  itemOf(token) {
    return token.actor.items.get(this.itemId);
  }

  /** Start the production group activation from all three minions, with the given creatures targeted. */
  async open({ targets = [] } = {}) {
    await this.cancel();
    this.item = this.itemOf(this.minions[0]);
    for (const token of [...game.user.targets]) {
      token.setTarget(false, { releaseOthers: false });
    }
    for (const key of targets) {
      this.tokens[key].setTarget(true, { releaseOthers: false });
    }
    this.minions.forEach((token, index) => token.control({ releaseOthers: index === 0 }));
    await useAbility(this.item, this.minions[0], this.minions);
    this.activation = await waitForFact(() => [...foundry.applications.instances.values()]
      .find(app => app.session?.item.uuid === this.item.uuid)?.session, "the group Select Targets panel");
    await this.select(targets);
    return this.activation;
  }

  /**
   * Choose exactly these creatures. Entering a session auto-selects a short list of reachable
   * creatures, so tests set their own selection the way a user removing or adding targets would.
   */
  async select(targets) {
    this.activation.targets = targets.map(key => this.tokens[key]);
    this.activation.attackCounts.clear();
    this.activation.syncTargets();
    this.activation.refresh();
    await this.activation.panel.render({ force: true });
  }

  /** Close review popups, restore dice and hooks, then delete only fixture documents. */
  async cleanup() {
    for (const [hook, id] of [["preCreateChatMessage", this.minionPreCreate], ["renderApplicationV2", this.dialogHook]]) {
      if (id !== undefined) {
        Hooks.off(hook, id);
      }
    }
    if (this.originalDice) {
      CONFIG.Dice.randomUniform = this.originalDice;
    }
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.message?.flags?.[MODULE]?.damageApplication?.sceneId === this.scene?.id) {
        await app.close();
      }
    }
    try {
      return await super.cleanup();
    } finally {
      await waitForFact(() => canvas.ready, "the restored scene to finish loading", 30000).catch(() => {});
      // Keep listening briefly: errors from this teardown arrive asynchronously.
      await new Promise(resolve => setTimeout(resolve, 500));
      window.removeEventListener("error", this.errorListener);
      window.removeEventListener("unhandledrejection", this.rejectionListener);
    }
  }
}

/** Register live canvas, native-dialog, damage and application cases for multi-creature attacks. */
export function registerMultiAttackTests(quench) {
  const key = "dnd4e-health-display.multi-attack";
  quench.registerBatch(key, ({ describe, it, assert, beforeEach, afterEach }) => {
    describe("Several creatures attacking together with Melee 1", function () {
      this.timeout(60000);
      let fixture;
      beforeEach(async function () {
        fixture = await new MultiAttackFixture().setup();
      });
      afterEach(async function () {
        await fixture?.cleanup();
      });

      it("shows one group HUD for the selected minions and hides it for a mixed selection", async function () {
        const previous = game.settings.get(MODULE, "showHorizontalActorDisplay");
        await game.settings.set(MODULE, "showHorizontalActorDisplay", true);
        try {
          fixture.minions.forEach((token, index) => token.control({ releaseOthers: index === 0 }));
          const hud = await waitForFact(() => ui.Dnd4eActorDisplay?.isGroup && ui.Dnd4eActorDisplay, "the group HUD");
          await hud.render({ force: true });
          const portrait = ui.Dnd4eActorPortrait;
          await portrait.render({ force: true });
          assert.include(portrait.element.textContent, "3 creatures selected");
          assert.lengthOf(portrait.element.querySelectorAll(".dnd4e-horizontal-actor-display__group-bars .dnd4e-horizontal-actor-display__health-bar"), 3);
          assert.notInclude(portrait.element.textContent, "Temp HP");
          assert.notExists(portrait.element.querySelector("[data-resource-path]"), "no editable HP or temporary HP in a group");
          assert.deepEqual([...hud.element.querySelectorAll(".dnd4e-actor-display__categories button")].map(button => button.textContent.trim()), ["Sheet"]);
          assert.exists(hud.element.querySelector('[data-action="power"]'), "a Melee power offers Use Power to a group");
          fixture.tokens.enemy.control({ releaseOthers: false });
          await waitForFact(() => !ui.Dnd4eActorDisplay, "the HUD hiding for a mixed selection");
        } finally {
          canvas.tokens.releaseAll();
          await game.settings.set(MODULE, "showHorizontalActorDisplay", previous);
        }
      });

      it("opens one shared session with a slot per creature and the attackers input per target", async function () {
        const session = await fixture.open({ targets: ["enemy"] });
        assert.isTrue(session.isGroup);
        assert.lengthOf(session.attackers, 3);
        assert.equal(session.slots, 3);
        assert.deepEqual([...session.demands()], [[fixture.tokens.enemy.id, 3]], "three minions default onto the one target");
        assert.lengthOf(session.problems(), 0);
        const input = session.panel.element.querySelector("[data-attackers]");
        assert.exists(input, "each target row has an attackers input");
        assert.equal(input.value, "3");
        assert.notExists(session.panel.element.querySelector("[data-origin-selector]"), "a group attacks from its own squares");
      });

      it("treats the attackers input as the count and flags targets only some creatures can reach", async function () {
        const session = await fixture.open({ targets: ["enemy", "slowed"] });
        const slowed = fixture.tokens.slowed;
        const enemy = fixture.tokens.enemy;
        // Only minion1 and minion2 are adjacent to the slowed creature.
        session.setAttackerCount(slowed.id, 3);
        session.setAttackerCount(enemy.id, 1);
        assert.match(session.groupTargetWarnings(slowed).join(" "), /outside range for 1 of its 3 assigned attackers/);
        session.setAttackerCount(slowed.id, 2);
        assert.lengthOf(session.problems(), 0);
        for (let run = 0; run < 10; run++) {
          const picked = session.pickAttackers();
          assert.isTrue(picked.ok);
          assert.deepEqual(picked.assignments.get(fixture.minions[2].id), [enemy.id], "the minion that cannot reach slowed must attack enemy");
          assert.equal([...picked.assignments.values()].filter(ids => ids.includes(slowed.id)).length, 2);
        }
        await session.panel.render({ force: true });
        const typed = session.panel.element.querySelector(`[data-attackers][data-token-id="${slowed.id}"]`);
        assert.equal(typed.value, "2");
      });

      it("rolls one native attack per minion from one dialog, each spending its own use", async function () {
        const session = await fixture.open({ targets: ["enemy"] });
        await runAttack(session);
        await waitForFact(() => session.attackMessages.length === 3, "three attack messages");
        assert.lengthOf(fixture.dialogs, 3, "one native dialog per attacker");
        assert.notEqual(fixture.dialogs[0].element.style.display, "none", "the first dialog is the visible one");
        assert.equal(fixture.dialogs[1].element.style.display, "none");
        assert.equal(fixture.dialogs[2].element.style.display, "none");
        const contexts = session.attackMessages.map(message => message.flags[MODULE].attackResults);
        assert.sameMembers(contexts.map(context => context.casterId), fixture.minions.map(token => token.id));
        for (const context of contexts) {
          assert.deepEqual(context.targetIds, [fixture.tokens.enemy.id], "all three attack the same creature");
          assert.equal(context.groupSize, 3);
        }
        for (const message of session.attackMessages) {
          assert.equal(message.rolls.length, 1);
          assert.equal(message.rolls[0].options.multirollData.targetID, fixture.tokens.enemy.id);
        }
        assert.deepEqual(fixture.minions.map(token => fixture.itemOf(token).system.uses.value), [1, 1, 1]);
        assert.match(session.state, /^(reviewingResults|reviewingDamage|complete)$/);
        const keys = (await session.panel._prepareContext()).results.map(row => row.key);
        assert.sameMembers(keys, fixture.minions.map(token => `${token.id}:${fixture.tokens.enemy.id}`));
      });

      it("shares the manual edits made in the visible dialog with every minion's roll", async function () {
        const session = await fixture.open({ targets: ["enemy"] });
        await runAttack(session, form => {
          const bonus = form.elements.namedItem("bonus");
          assert.exists(bonus, "the native dialog has a situational bonus field");
          bonus.value = "+3";
        });
        await waitForFact(() => session.attackMessages.length === 3, "three attack messages");
        for (const message of session.attackMessages) {
          // The native roll wraps each term in parentheses, e.g. (1d20)+(100)+(3), and adds its own automatic terms.
          assert.include(message.rolls[0].formula.replace(/\s/g, ""), "+(3)", "every attacker added the bonus typed once");
        }
      });

      it("cancelling the one visible dialog rolls nothing and spends nothing", async function () {
        const session = await fixture.open({ targets: ["enemy"] });
        const running = session.attack();
        await waitForFact(visibleDialog, "the visible native attack dialog");
        await fixture.dialogs[0].app.close();
        await running;
        assert.equal(session.state, "targeting");
        assert.lengthOf(fixture.dialogs, 1, "the later attackers' dialogs never opened");
        assert.lengthOf(session.attackMessages, 0);
        assert.deepEqual(fixture.minions.map(token => fixture.itemOf(token).system.uses.value), [2, 2, 2]);
      });

      it("rolls damage per minion, lists each hit and applies them to the target one by one", async function () {
        const session = await fixture.open({ targets: ["enemy"] });
        await runAttack(session);
        await waitForFact(() => session.attackMessages.length === 3, "three attack messages");
        await waitForFact(() => session.state === "reviewingResults" || session.state === "reviewingDamage", "result review");
        if (session.state === "reviewingResults") {
          await session.confirmResults();
        }
        await waitForFact(() => session.state === "reviewingDamage", "damage review");
        const owners = session.damageMessages.map(message => message.flags[MODULE].damageReview.attackerId);
        assert.sameMembers(owners, fixture.minions.map(token => token.id), "each minion rolled its own damage");
        const display = await session.panel._prepareContext();
        assert.deepEqual(display.results.map(row => row.damageTotal), [7, 7, 7]);
        assert.lengthOf(display.damageCards, 3, "one damage card per attacker");

        await session.confirmDamage();
        const message = session.attackMessages[0];
        await waitForFact(() => damageApplicationTargets(message).length === 3, "three confirmed hits");
        const enemy = fixture.tokens.enemy;
        const keys = damageApplicationTargets(message).map(entry => entry.key);
        assert.sameMembers(keys, fixture.minions.map(token => `${token.id}:${enemy.id}`));
        const hp = enemy.actor.system.attributes.hp.value;
        const temp = Number(enemy.actor.system.attributes.temphp.value);
        for (const entry of keys) {
          await applyTargetDamage(message, entry);
        }
        // Each hit is mitigated and applied by itself: temporary HP absorbs the first 5 points, then HP drops.
        assert.equal(Number(enemy.actor.system.attributes.temphp.value), 0);
        assert.equal(enemy.actor.system.attributes.hp.value, hp - (21 - temp));
        for (const entry of keys) {
          assert.equal(message.flags[MODULE].damageApplications[entry].state, "applied");
        }
        await applyTargetDamage(message, keys[0]);
        assert.equal(enemy.actor.system.attributes.hp.value, hp - (21 - temp), "an applied hit is never applied twice");
      });
    });

    describe("Several creatures attacking together with Melee 5 and three targets each", function () {
      this.timeout(60000);
      let fixture;
      beforeEach(async function () {
        fixture = await new MultiAttackFixture({ count: 3, range: "5" }).setup();
      });
      afterEach(async function () {
        await fixture?.cleanup();
      });

      it("gives nine attacks, three on each of three creatures, each minion hitting three different ones", async function () {
        const session = await fixture.open({ targets: ["enemy", "slowed", "ally"] });
        assert.equal(session.slots, 9);
        const demands = [...session.demands().values()];
        assert.deepEqual(demands, [3, 3, 3]);
        assert.lengthOf(session.problems(), 0);
        await runAttack(session);
        await waitForFact(() => session.attackMessages.length === 3, "three attack messages");
        const targetIds = [fixture.tokens.enemy.id, fixture.tokens.slowed.id, fixture.tokens.ally.id];
        for (const message of session.attackMessages) {
          assert.sameMembers(message.flags[MODULE].attackResults.targetIds, targetIds, "every minion attacks all three creatures");
          assert.lengthOf(message.rolls, 3, "one native roll per creature the minion attacks");
        }
        const rows = (await session.panel._prepareContext()).results;
        assert.lengthOf(rows, 9);
        assert.lengthOf(new Set(rows.map(row => row.key)), 9, "all nine attacks are separate rows");
      });
    });
  }, { displayName: "INFO DISPLAYS: Multi-creature attacks", preSelected: false });
  return key;
}
