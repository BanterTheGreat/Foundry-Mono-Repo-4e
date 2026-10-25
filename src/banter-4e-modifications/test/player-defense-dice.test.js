import test from "node:test";
import assert from "node:assert/strict";
import { PlayerDefense } from "../scripts/modules/player-defense/player-defense.js";

for (const [attackDice, defenseDice] of [
  ["1d20", "1d20"],
  ["2d20kh1", "2d20kl1"],
  ["2d20kl1", "2d20kh1"],
  ["3d20kh1", "3d20kl1"],
  ["3d20kl1", "3d20kh1"],
  ["2d20kh", "2d20kl1"],
  ["2d20k", "2d20kl1"],
  ["2d20dl1", "2d20kl1"],
  ["3d20dl2", "3d20kl1"],
  ["3d20dh2", "3d20kh1"],
]) {
  test(`NPC ${attackDice} becomes player ${defenseDice} without changing the DC`, async () => {
    const attacker = { id: "enemy", name: "Enemy", type: "NPC" };
    const hero = { id: "hero", name: "Hero", type: "Player Character", effects: [] };
    const actors = new Map([[attacker.id, attacker], [hero.id, hero]]);
    actors.find = predicate => [...actors.values()].find(predicate);
    const token = { id: "hero-token", actor: hero };
    const item = { id: "bite", name: "Bite", system: { attack: { def: "ac" }, hit: {}, miss: {} } };
    let message;
    let dialog;
    let rolledFormula;
    let outcome;
    let natural = 1;
    let defenseBonus = 30;
    globalThis.canvas = { scene: { id: "scene" } };
    globalThis.ChatMessage = { create: data => { message = { id: "defense", ...data }; } };
    globalThis.game = {
      actors, users: [{ id: "gm", active: true, isGM: true }], user: { id: "gm", isGM: true },
      settings: { settings: new Map(), get: () => false }, PlayerDefense: new PlayerDefense(),
    };
    globalThis.foundry = { applications: { api: { DialogV2: class {
      constructor(options) { dialog = options; }
      render() {}
    } } } };
    globalThis.Roll = class {
      constructor(formula) { rolledFormula = formula; }
      propagateFlavor() {}
      async evaluate() {
        // A selected natural 1 must still cause a critical hit, even at a high defense bonus.
        return { terms: [{ total: natural }], total: natural + defenseBonus, render: async () => "roll" };
      }
    };
    const socket = { async executeAsGM(action, ...args) {
      if (action === "attemptDefenseDialog") {
        return true;
      }
      outcome = args[2];
    } };
    PlayerDefense.OnRollAttack(item, { targets: [token], targDefValArray: [40] }, { actor: attacker.id });
    assert.equal(PlayerDefense.OnPowerChatMessage({ flavor: "Bite", rolls: [{ formula: `${attackDice} + 10 - 2` }] }), false);
    const target = message.flags.playerDefense.targets[0];
    assert.equal(target.attackModifier, 8);
    assert.equal(target.rollDC, 20);
    if (attackDice === "1d20") {
      // Defense messages created before dice selection was stored remain usable.
      delete target.defenseDice;
    }
    PlayerDefense.onRenderDefenseMessage(message, socket);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(dialog.content.includes(`Roll ${defenseDice} + 30 to defend`));
    await dialog.buttons[0].callback();
    assert.equal(rolledFormula, `${defenseDice} + 30`);
    assert.equal(outcome, "critical");
    natural = 20;
    defenseBonus = 7;
    target.defenseMod = 7;
    target.rollDC = 28;
    await dialog.buttons[0].callback();
    assert.equal(outcome, "miss", "a natural 20 must avoid the attack even when 20 + 7 is below DC 28");
  });
}
