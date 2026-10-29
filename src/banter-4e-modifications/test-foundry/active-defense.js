import { createDefenseScenario } from "./active-defense-fixture.js";
import { SocketHelper } from "../scripts/modules/player-defense/socket-helper.js";

/** Register tests against real hooks, serialized Roll objects, and persisted chat documents. */
export function registerActiveDefenseTests(quench) {
  const key = "banter-4e-modifications.active-defense";
  quench.registerBatch(key, ({ describe, it, assert, afterEach }) => {
    describe("Active Defense in Foundry", function () {
      this.timeout(30000);
      let scenario;
      afterEach(async function () {
        await scenario?.fixtures.cleanup();
        scenario = null;
      });

      it("intercepts PC targets, reverses selected dice, and retains native NPC rolls", async function () {
        scenario = await createDefenseScenario({ formulas: ["2d20kh1 + 6", "2d20kl1 + 8", "1d20 + 4"], mixed: true });
        const defense = scenario.message.flags.playerDefense;
        assert.deepEqual(defense.targets.map(target => target.defenseDice), ["2d20kl1", "2d20kh1"]);
        assert.deepEqual(defense.targets.map(target => target.rollDC), [18, 20]);
        assert.deepEqual(defense.targets.map(target => target.defenseMod), [12, 12]);
        assert.deepEqual(scenario.payload.targetHit.map(token => token.id), [scenario.tokens[2].id]);
        assert.lengthOf(scenario.message.rolls, 1);
        assert.equal(scenario.message.rolls[0].options.multirollData.targetID, scenario.tokens[2].id);
        assert.include(scenario.message.content, "WAITING");
        assert.isTrue(scenario.message.flags["dnd4e-health-display"].attackResults.pending);
      });

      for (const [name, formula, options, outcome] of [
        ["natural 1 overrides a high defense total", "1d20 + 40", { minimize: true }, "critical"],
        ["natural 20 overrides a low defense total", "1d20 - 40", { maximize: true }, "miss"],
        ["meeting the defense DC evades the attack", "10 + 8", {}, "miss"],
        ["a total below the defense DC is hit", "10 + 7", {}, "normal"],
      ]) {
        it(name, async function () {
          scenario = await createDefenseScenario();
          const message = scenario.message;
          const target = message.flags.playerDefense.targets[0];
          const roll = await new Roll(formula).evaluate(options);
          const natural = roll.terms[0].total;
          // Send a deliberately incorrect proposed verdict; managed resolution must derive it.
          const accepted = await SocketHelper.resolveDefenseTarget(message.id, target.id,
            outcome === "miss" ? "normal" : "miss", "<section>Caller supplied content</section>", {
              total: roll.total, natural, rollHtml: await roll.render(), roll: JSON.stringify(roll.toJSON()),
            });
          assert.isTrue(accepted);
          const stored = game.messages.get(message.id).flags.playerDefense.targets[0];
          assert.isTrue(stored.resolved);
          assert.equal(stored.outcome, outcome);
          assert.equal(stored.total, roll.total);
          assert.equal(stored.natural, natural);
          assert.lengthOf(message.rolls, 1);
          assert.equal(message.rolls[0].options.banterDefenseTarget, target.tokenId);
          assert.notInclude(message.content, "Caller supplied content");
          assert.equal(scenario.actors[0].system.attributes.hp.value, 40, "resolution must not apply damage");
          assert.isTrue(message.flags["dnd4e-health-display"].attackResults.pending, "review stays pending");
          assert.isFalse(await SocketHelper.resolveDefenseTarget(message.id, target.id, outcome, "duplicate", { total: roll.total, natural }));
          assert.lengthOf(message.rolls, 1, "duplicate responses must not append another roll");
          if ([1, 20].includes(natural)) {
            await assert.isRejected(game.PlayerDefense.adjustDefenseTarget(message, target.tokenId, 10), /cannot be adjusted/);
          }
        });
      }

      it("claims one dialog attempt even when two requests arrive together", async function () {
        scenario = await createDefenseScenario();
        const message = scenario.message;
        const target = foundry.utils.deepClone(message.flags.playerDefense.targets[0]);
        target.assignedUserId = null;
        target.dialogAttempted = false;
        await message.update({ "flags.playerDefense.targets": [target] });
        const attempts = await Promise.all([SocketHelper.attemptDefenseDialog(message.id, target.id),
          SocketHelper.attemptDefenseDialog(message.id, target.id)]);
        assert.deepEqual(attempts, [true, false]);
        assert.isTrue(message.flags.playerDefense.targets[0].dialogAttempted);
      });

      it("rejects removed targets and permits ordinary GM adjustments without rerolling", async function () {
        scenario = await createDefenseScenario({ formulas: ["1d20 + 6", "1d20 + 6"] });
        const message = scenario.message;
        const [first, removed] = message.flags.playerDefense.targets;
        await message.update({ "flags.dnd4e-health-display.attackResults.targetIds": [first.tokenId] });
        assert.isFalse(await SocketHelper.resolveDefenseTarget(message.id, removed.id, "normal", "removed", { total: 10, natural: 10 }));
        const roll = await new Roll("10 + 7").evaluate();
        // A fixed structured response isolates GM adjustment from random dice selection.
        await SocketHelper.resolveDefenseTarget(message.id, first.id, "normal", "ignored", { total: 17, natural: 10,
          rollHtml: await roll.render(), roll: JSON.stringify(roll.toJSON()) });
        await game.PlayerDefense.adjustDefenseTarget(message, first.tokenId, 1);
        assert.equal(message.flags.playerDefense.targets[0].outcome, "miss");
        assert.equal(message.flags.playerDefense.targets[0].total, 18);
        await game.PlayerDefense.adjustDefenseTarget(message, first.tokenId, 0);
        assert.equal(message.flags.playerDefense.targets[0].total, 17);
        assert.equal(message.flags.playerDefense.targets[0].outcome, "normal");
        assert.isFalse(message.flags.playerDefense.targets[1].resolved);
        assert.lengthOf(message.rolls, 1, "adjustments must not roll any new dice");
      });
    });
  }, { displayName: "BANTER: Active Defense live hooks and GM resolution", preSelected: false });
  return key;
}
