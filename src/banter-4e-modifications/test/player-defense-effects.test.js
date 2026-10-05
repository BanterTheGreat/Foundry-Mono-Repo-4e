import test from "node:test";
import assert from "node:assert/strict";
import { PlayerDefense } from "../scripts/modules/player-defense/player-defense.js";
import { SocketHelper } from "../scripts/modules/player-defense/socket-helper.js";

/**
 * Replays the DnD4e 0.9.3 boundary: rollAttack hook, automatic effects,
 * replacement chat message, then GM-authoritative defense resolution.
 */
function createAttack({ originalHit = false, autoApply = true, mixed = false, twoPlayers = false } = {}) {
  const calls = [];
  const attacker = { id: "enemy", name: "Enemy", type: "NPC", items: new Map() };
  const hero = { id: "hero", name: "Hero", type: "Player Character", effects: [] };
  const other = { id: "other", name: "Other", type: twoPlayers ? "Player Character" : "NPC", effects: [] };
  const tokens = [hero, ...(mixed || twoPlayers ? [other] : [])].map(actor => ({ id: `${actor.id}-token`, actor, document: { parent: { id: "scene" } } }));
  const item = { id: "blind", name: "Blinding attack", effects: [{ name: "Blinded", system: { powerEffectType: "hit" } }], system: { attack: { def: "ac" }, hit: {}, miss: {} } };
  attacker.items.set(item.id, item);
  const actors = new Map([attacker, hero, other].map(actor => [actor.id, actor]));
  actors.find = predicate => [...actors.values()].find(predicate);
  globalThis.canvas = { scene: { id: "scene" }, tokens: { get: id => tokens.find(token => token.id === id) } };
  globalThis.game = {
    actors, users: [{ id: "gm", active: true, isGM: true }],
    settings: { settings: new Map(), get: (scope, key) => key === "autoApplyEffects" && autoApply },
    PlayerDefense: new PlayerDefense(), SocketHelper: new SocketHelper(),
  };
  globalThis.dnd4e = { utils: {
    async applyEffectsToTokens(effects, targets, condition) {
      calls.push({ condition, targets: targets.map(token => token.id) });
      for (const effect of effects.filter(effect => effect.system.powerEffectType === condition)) {
        targets.forEach(token => token.actor.effects.push(effect.name));
      }
    },
    async endEffectsOnTokens(targets, condition) {
      calls.push({ condition, targets: targets.map(token => token.id) });
    },
  } };
  let message;
  globalThis.ChatMessage = { create: data => {
    message = { ...data, id: "defense", async update(update) { Object.assign(this, update); } };
  } };
  const target = { targets: tokens, targDefValArray: tokens.map(() => 20), targetHit: originalHit ? [...tokens] : [], targetMissed: originalHit ? [] : [...tokens] };
  PlayerDefense.OnRollAttack(item, target, { actor: attacker.id });
  // The system reads these arrays immediately after the synchronous hook.
  for (const [condition, targets] of [["hit", target.targetHit], ["miss", target.targetMissed]]) {
    if (!targets.length) {
      continue;
    }
    if (autoApply) {
      dnd4e.utils.applyEffectsToTokens(item.effects, targets, condition);
      dnd4e.utils.applyEffectsToTokens(item.effects, targets, "hitOrMiss");
      dnd4e.utils.applyEffectsToTokens(item.effects, [attacker], condition === "hit" ? "selfHit" : "selfMiss");
    }
    dnd4e.utils.endEffectsOnTokens(targets, condition === "hit" ? "attackedhit" : "attackedmiss");
    dnd4e.utils.endEffectsOnTokens(targets, "attacked");
  }
  PlayerDefense.OnPowerChatMessage({ flavor: item.name, rolls: [{ formula: "1d20 + 8" }] });
  game.messages = new Map([[message.id, message]]);
  return { calls, tokens, hero, attacker, item, message, resolve: (index, outcome) => SocketHelper.resolveDefenseTarget(message.id, message.flags.playerDefense.targets[index].id, outcome, outcome) };
}

for (const originalHit of [false, true]) {
  for (const outcome of ["normal", "critical", "miss"]) {
    test(`effects follow ${outcome} defense outcome when original attack ${originalHit ? "hits" : "misses"}`, async () => {
      const attack = createAttack({ originalHit });
      assert.deepEqual(attack.calls, [], "original NPC roll must not apply or expire player effects");
      await attack.resolve(0, outcome);
      const condition = outcome === "miss" ? "miss" : "hit";
      assert.deepEqual(attack.calls.map(call => call.condition), [condition, "hitOrMiss", condition === "hit" ? "selfHit" : "selfMiss", condition === "hit" ? "attackedhit" : "attackedmiss", "attacked"]);
      assert.deepEqual(attack.calls[0].targets, ["hero-token"]);
      assert.deepEqual(attack.hero.effects, outcome === "miss" ? [] : ["Blinded"]);
      assert.equal(await attack.resolve(0, outcome), false);
      assert.equal(attack.calls.length, 5, "duplicate socket requests must not duplicate effects");
    });
  }
}

test("automatic effects setting is respected while attacked effects still expire", async () => {
  const attack = createAttack({ autoApply: false });
  assert.deepEqual(attack.calls, []);
  await attack.resolve(0, "normal");
  assert.deepEqual(attack.calls.map(call => call.condition), ["attackedhit", "attacked"]);
});

test("mixed targets retain NPC effects and apply attacker self effects only once", async () => {
  const attack = createAttack({ originalHit: true, mixed: true });
  assert.deepEqual(attack.calls[0], { condition: "hit", targets: ["other-token"] });
  await attack.resolve(0, "normal");
  assert.equal(attack.calls.filter(call => call.condition === "selfHit").length, 1);
  assert.deepEqual(attack.calls.filter(call => call.condition === "hit").map(call => call.targets), [["other-token"], ["hero-token"]]);
});

test("multiple players each receive effects but attacker self effects apply once per outcome", async () => {
  const attack = createAttack({ twoPlayers: true });
  await attack.resolve(0, "normal");
  await attack.resolve(1, "critical");
  assert.equal(attack.calls.filter(call => call.condition === "hit").length, 2);
  assert.equal(attack.calls.filter(call => call.condition === "selfHit").length, 1);
});

test("split defense outcomes apply hit and miss self effects once each", async () => {
  const attack = createAttack({ twoPlayers: true });
  await attack.resolve(0, "normal");
  await attack.resolve(1, "miss");
  assert.equal(attack.calls.filter(call => call.condition === "selfHit").length, 1);
  assert.equal(attack.calls.filter(call => call.condition === "selfMiss").length, 1);
});

test("effect application uses scene token actors for unlinked tokens outside the viewed scene", async () => {
  const attack = createAttack();
  const syntheticAttacker = { ...attack.attacker, id: "synthetic-enemy" };
  const sourceToken = { id: "enemy-token", actor: syntheticAttacker };
  const targetToken = { id: "hero-token", actor: { ...attack.hero, id: "synthetic-hero" } };
  game.scenes = new Map([["scene", { tokens: new Map([[sourceToken.id, sourceToken], [targetToken.id, targetToken]]) }]]);
  canvas.scene.id = "different-scene";
  attack.message.flags.playerDefense.attackerTokenId = sourceToken.id;
  dnd4e.utils.applyEffectsToTokens = async (effects, targets, condition, source) => {
    attack.calls.push({ condition, actor: targets[0].actor?.id, source: source.id });
  };
  await attack.resolve(0, "normal");
  assert.deepEqual(attack.calls[0], { condition: "hit", actor: "synthetic-hero", source: "synthetic-enemy" });
});
