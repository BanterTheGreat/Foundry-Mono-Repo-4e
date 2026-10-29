import { assertTestWorld, TestDocuments } from "../../foundry-test-harness/scripts/fixtures.js";

/**
 * Build real documents and feed the system's rollAttack hook, followed by native chat creation.
 * This tests the interception seam, without opening the native NPC attack dialog.
 * The browser scenario leaves dialog attempts enabled for the assigned player.
 */
export async function createDefenseScenario({ ownerId, dialogs = false, formulas = ["1d20 + 6"], mixed = false } = {}) {
  assertTestWorld();
  if (!game.settings.get("banter-4e-modifications", "enable-active-defense") || !game.PlayerDefense || !game.SocketHelper) {
    throw new Error("Enable Active Defense and reload the test world before running its tests.");
  }
  if (ownerId && !game.users.get(ownerId)?.active) {
    throw new Error("The assigned test player must be logged in first.");
  }
  const fixtures = new TestDocuments();
  const previousAttack = game.PlayerDefense.lastAttack;
  let hook;
  try {
    // Seed the power with the actor, avoiding unrelated item-grant changelog messages.
    const attacker = await fixtures.createActor({ items: [{
      name: `[Integration test ${fixtures.runId}] Strike`, type: "power",
      system: { attack: { isAttack: true, def: "ac" }, hit: { detail: "The target is struck." },
        miss: { detail: "The target avoids the strike." } },
    }] });
    const attackerToken = await fixtures.createToken(attacker, 100);
    const item = attacker.items.contents[0];
    const actors = [];
    const tokens = [];
    for (let i = 0; i < formulas.length; i++) {
      const actor = await fixtures.createActor({ type: mixed && i === formulas.length - 1 ? "NPC" : "Player Character", ownerId });
      actors.push(actor);
      tokens.push(await fixtures.createToken(actor, 200 + i * 100));
    }
    const rollTargets = tokens.map(token => token.object);
    if (rollTargets.some(token => !token)) {
      throw new Error("The test tokens are not available on the canvas.");
    }
    const rolls = [];
    for (let i = 0; i < tokens.length; i++) {
      const roll = await fixedAttackRoll(formulas[i]);
      roll.options.multirollData = { targetID: tokens[i].id, hitstate: "hit", critstate: "normal" };
      rolls.push(roll);
    }
    const payload = { targets: rollTargets, targDefValArray: tokens.map(() => 22),
      targetHit: [...rollTargets], targetMissed: [] };

    // Only suppress dialogs on our own Quench fixtures; browser workflows use real assignment.
    if (!dialogs) {
      hook = Hooks.on("preCreateChatMessage", message => {
        if (message.flags?.["foundry-test-harness"]?.runId === fixtures.runId && message.flags.playerDefense) {
          message.updateSource({ "flags.playerDefense.targets": message.flags.playerDefense.targets.map(target =>
            ({ ...target, dialogAttempted: true })) });
        }
      });
    }
    Hooks.callAll("dnd4e.rollAttack", item, payload, { actor: attacker.id, token: attackerToken.id });
    const message = await fixtures.createMessage({
      flavor: item.name, speaker: { actor: attacker.id, token: attackerToken.id, scene: canvas.scene.id }, rolls,
      flags: { "dnd4e-health-display": { attackResults: {
        sessionId: fixtures.runId, effectsManaged: true, pending: true, sceneId: canvas.scene.id,
        sourceTokenId: attackerToken.id, itemUuid: item.uuid, targetIds: tokens.map(token => token.id),
      } } },
    });
    if (!message.flags.playerDefense?.automationManaged) {
      throw new Error("The registered Active Defense hooks did not intercept the NPC attack.");
    }
    return { fixtures, attacker, item, actors, tokens, message, payload };
  } catch (error) {
    await fixtures.cleanup();
    throw error;
  } finally {
    if (hook !== undefined) {
      Hooks.off("preCreateChatMessage", hook);
    }
    game.PlayerDefense.lastAttack = previousAttack;
  }
}

/** Seed evaluated native attack dice at 10 through Foundry's serialization boundary. */
async function fixedAttackRoll(formula) {
  const source = (await new Roll(formula).evaluate({ minimize: true })).toJSON();
  let adjustment = 0;
  for (const term of source.terms) {
    if (term.faces !== 20 || !term.results) {
      continue;
    }
    for (const result of term.results) {
      if (result.active) {
        adjustment += 10 - result.result;
      }
      result.result = 10;
    }
  }
  source.total += adjustment;
  return Roll.fromJSON(JSON.stringify(source));
}
