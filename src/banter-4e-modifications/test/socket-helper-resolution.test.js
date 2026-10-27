import test from "node:test";
import assert from "node:assert/strict";
import { SocketHelper } from "../scripts/modules/player-defense/socket-helper.js";

test("SocketHelper waits for every defender, then rolls each hit damage group only once", async () => {
  const damageCalls = [];
  const targets = [
    { id: "hero-0", actorId: "hero", tokenId: "hero-token", sceneId: "scene", defenseStat: "AC", resolved: false },
    { id: "hero-1", actorId: "hero", tokenId: "hero-token-2", sceneId: "scene", defenseStat: "AC", resolved: false },
  ];
  const defense = { attackerId: "wolf", itemId: "bite", itemName: "Bite", hasDamage: true, hasMissDamage: false, damageRolled: { normal: false, critical: false, miss: false }, targets };
  const message = {
    id: "defense", content: targets.map(target => `<span data-player-defense-result="${target.id}"><em>Awaiting defense...</em></span>`).join(""), flags: { playerDefense: defense },
    async update(update) { this.content = update.content; this.flags = update.flags; },
  };
  const item = { id: "bite", name: "Bite", rollDamage: async options => damageCalls.push(options) };
  globalThis.game = {
    messages: new Map([[message.id, message]]), actors: new Map([["wolf", { id: "wolf", items: new Map([[item.id, item]]) }]]), settings: { settings: new Map(), get: () => false },
    TriggerPrompts: { handleActiveDefenseOutcome: async () => {} }, SocketHelper: new SocketHelper(),
  };

  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "hero-0", "normal", "normal"), true);
  assert.deepEqual(damageCalls, []);
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "hero-1", "critical", "critical"), true);
  assert.deepEqual(damageCalls, [{ fastForward: true }, undefined]);
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "hero-1", "critical", "again"), false);
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "missing", "normal", "ignored"), false);
});


test("managed defense responses persist GM-calculated verdicts without applying effects, triggers, or damage", async () => {
  const targets = ["first", "second"].map((id, index) => ({ id, tokenId: id, rollDC: 25, resolved: false }));
  const defense = { automationManaged: true, attackName: "Blast", targets, hasDamage: true, autoApplyEffects: true };
  const context = { pending: true, targetIds: ["first", "second"] };
  const message = {
    id: "managed", rolls: [], content: targets.map(target => `<section data-player-defense-target="${target.id}">Waiting</section>`).join(""),
    flags: { playerDefense: defense, "dnd4e-health-display": { attackResults: context } },
    async update(data) {
      this.content = data.content;
      this.flags.playerDefense.targets = data["flags.playerDefense.targets"];
      if (data.rolls) {
        this.rolls = data.rolls;
      }
    },
  };
  globalThis.game = { messages: new Map([[message.id, message]]), SocketHelper: new SocketHelper(),
    settings: { settings: new Map(), get: () => false },
    TriggerPrompts: { handleActiveDefenseOutcome() { assert.fail("automation owns triggers"); } },
  };
  globalThis.Roll = { fromJSON: json => JSON.parse(json) };
  const serialized = JSON.stringify({ total: 40, options: {} });
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "first", "normal", "ignored", { total: 40, natural: 1, roll: serialized }), true);
  assert.equal(message.rolls.length, 1);
  assert.equal(message.rolls[0].options.banterDefenseTarget, "first");
  assert.equal(targets[0].outcome, "critical", "the GM derives the verdict from structured values");
  assert.match(message.content, /CRIT HIT/);
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "first", "normal", "again", { total: 40, natural: 1 }), false);
  context.targetIds = ["first"];
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "second", "normal", "late", { total: 20, natural: 10 }), false);
  assert.equal(targets[1].resolved, false);
  context.targetIds.push("second");
  assert.equal(await SocketHelper.resolveDefenseTarget(message.id, "second", "miss", "ignored", { total: 23, natural: 20 }), true);
  assert.equal(targets[1].outcome, "miss");
});
