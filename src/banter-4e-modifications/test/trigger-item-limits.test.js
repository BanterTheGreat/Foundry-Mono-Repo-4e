import test from "node:test";
import assert from "node:assert/strict";
import { TriggerItemLimits } from "../scripts/modules/trigger-prompts/trigger-item-limits.js";
import { TRIGGER_PROMPT_TIMEOUT_MS, TRIGGER_SOCKET_ACTION } from "../scripts/modules/trigger-prompts/constants.js";

const MODULE = "banter-4e-modifications";
function setup(limit = "turn") {
  let sequence = 0;
  const gm = { id: "gm", active: true, isGM: true };
  const users = new Map([[gm.id, gm]]);
  users.activeGM = gm;
  const actor = {
    flags: { [MODULE]: {} }, testUserPermission: () => true,
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) { this.flags[scope][key] = { ...this.flags[scope][key], ...value }; },
  };
  const item = {
    uuid: "Actor.hero.Item.feat", actor, isOwner: true,
    flags: { [MODULE]: { "trigger-prompts": { limit } } },
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) {
      await new Promise(resolve => setImmediate(resolve));
      this.flags[scope][key] = { ...this.flags[scope][key], ...value };
    },
  };
  actor.items = new Map([["feat", item]]);
  globalThis.foundry = { utils: { randomID: () => `ticket-${++sequence}` } };
  globalThis.fromUuidSync = uuid => uuid === item.uuid ? item : null;
  globalThis.game = { users, user: gm, combat: { id: "combat", started: true, round: 1, turn: 0, combatant: { id: "enemy" } } };
  const limits = new TriggerItemLimits({});
  return { limits, item, actor };
}

test("opportunity prompts persist one offer per enemy token and share one claimed attack per turn", async () => {
  const { limits, item } = setup("none");
  const enemy = { sourceKey: "scene:enemy" };
  const offers = await Promise.all([limits.request(item, "opportunityOffer", enemy), limits.request(item, "opportunityOffer", enemy)]);
  assert.ok(offers[0]);
  assert.equal(offers[1], null);
  const reloaded = new TriggerItemLimits({});
  assert.equal(await reloaded.request(item, "opportunityOffer", enemy), null, "Ignore, expiry or reload cannot repeat the same enemy");
  const otherEnemy = await limits.request(item, "opportunityOffer", { sourceKey: "scene:other" });
  assert.ok(otherEnemy, "different enemies may still offer until an attack is used");
  const otherPower = { ...item, uuid: "Actor.hero.Item.other" };
  globalThis.fromUuidSync = uuid => uuid === otherPower.uuid ? otherPower : item;
  const claims = await Promise.all([
    limits.request(item, "opportunityClaim", offers[0]),
    limits.request(otherPower, "opportunityClaim", otherEnemy),
  ]);
  assert.deepEqual(claims, [true, null]);
  assert.equal(await limits.request(item, "opportunityOffer", { sourceKey: "scene:third" }), null);
  game.combat.turn += 1;
  assert.equal(await limits.request(item, "opportunityOffer", enemy), null, "initiative reordering does not refresh usage");
  game.combat.combatant = { id: "next" };
  assert.ok(await limits.request(item, "opportunityOffer", enemy));
  assert.equal(await limits.request(item, "opportunityClaim", offers[0]), null, "old-turn prompts cannot be used");
  game.combat.round += 1;
  assert.ok(await limits.request(item, "opportunityOffer", enemy));
});

test("disabling once per turn permits other enemies but never repeats an enemy's prompt", async () => {
  const { limits, item, actor } = setup("none");
  actor.flags[MODULE]["trigger-prompts"] = { opportunityAttack: { oncePerTurn: false } };
  const first = await limits.request(item, "opportunityOffer", { sourceKey: "scene:one" });
  assert.equal(await limits.request(item, "opportunityClaim", first), true);
  assert.equal(await limits.request(item, "opportunityOffer", { sourceKey: "scene:one" }), null);
  const second = await limits.request(item, "opportunityOffer", { sourceKey: "scene:two" });
  assert.equal(await limits.request(item, "opportunityClaim", second), true);
});

test("an unavailable item allowance does not spend the actor's opportunity attack", async () => {
  const { limits, item, actor } = setup("turn");
  const opportunity = await limits.request(item, "opportunityOffer", { sourceKey: "scene:enemy" });
  const itemTicket = await limits.request(item, "offer");
  await limits.request(item, "release", itemTicket);
  assert.equal(await limits.request(item, "opportunityClaim", { ...opportunity, itemTicket }), null);
  assert.equal(actor.getFlag(MODULE, "opportunity-prompt-usage").used, false);
});

test("one pending offer and one claim win across two trigger rows or simultaneous recipients", async () => {
  const { limits, item } = setup();
  const [first, second] = await Promise.all([limits.request(item, "offer"), limits.request(item, "offer")]);
  assert.ok(first.id);
  assert.equal(second, null);
  const claims = await Promise.all([limits.request(item, "claim", first), limits.request(item, "claim", first)]);
  assert.deepEqual(claims, [true, false]);
  assert.equal(await new TriggerItemLimits({}).request(item, "offer"), null, "reload does not reset the allowance");
  game.combat.turn += 1;
  assert.equal(await limits.request(item, "offer"), null, "reordering the same acting creature does not refresh it");
  game.combat.combatant = { id: "hero" };
  assert.ok((await limits.request(item, "offer")).id, "another creature's turn refreshes it");
});

test("Ignore and expiry release turn/day reservations without spending a use", async () => {
  for (const limit of ["turn", "day"]) {
    const { limits, item } = setup(limit);
    const first = await limits.request(item, "offer");
    assert.equal(await limits.request(item, "release", first), true);
    const second = await limits.request(item, "offer");
    item.flags[MODULE]["trigger-prompt-usage"].pending.expiresAt = Date.now() - 1;
    assert.equal(await limits.request(item, "claim", second), false);
    assert.ok((await limits.request(item, "offer")).id, "expired offers can be replaced");
  }
});

test("old turn tickets and forged tickets cannot spend a new turn's allowance", async () => {
  const { limits, item } = setup();
  const first = await limits.request(item, "offer");
  assert.equal(await limits.request(item, "claim", { ...first, id: "forged" }), false);
  game.combat.turn += 1;
  game.combat.combatant = { id: "hero" };
  assert.equal(await limits.request(item, "claim", first), false);
  assert.equal(await limits.request(item, "claim", { ...first, scope: TriggerItemLimits.scope("turn") }), false, "changing a stale ticket's scope cannot revive it");
  const next = await limits.request(item, "offer");
  assert.equal(await limits.request(item, "release", first), false, "stale cleanup cannot release a newer offer");
  assert.equal(await limits.request(item, "claim", next), true);
});

test("first time per encounter records the first opportunity even if ignored", async () => {
  const { limits, item } = setup("firstEncounter");
  const first = await limits.request(item, "offer");
  await limits.request(item, "release", first);
  game.combat.turn += 1;
  assert.equal(await limits.request(item, "offer"), null);
  game.combat.id = "next-encounter";
  const next = await limits.request(item, "offer");
  assert.equal(await limits.request(item, "claim", next), true);
});

test("daily allowance survives new turns and encounters and resets only on Extended Rest", async () => {
  const { limits, item, actor } = setup("day");
  let completed = 0;
  class NativeActor {
    async longRest(event, options) { completed += 1; assert.equal(options.envi, true); return "rested"; }
    async shortRest() {}
  }
  globalThis.CONFIG = { Actor: { documentClass: NativeActor } };
  game.TriggerPrompts = { limits };
  TriggerItemLimits.registerRest();
  TriggerItemLimits.registerRest();
  Object.setPrototypeOf(actor, NativeActor.prototype);
  const ticket = await limits.request(item, "offer");
  assert.equal(await limits.request(item, "claim", ticket), true);
  game.combat.id = "next";
  game.combat.turn += 1;
  await actor.shortRest();
  assert.equal(await limits.request(item, "offer"), null);
  assert.equal(await actor.longRest(null, { envi: true }), "rested");
  assert.equal(completed, 1);
  const pending = await limits.request(item, "offer");
  await actor.longRest(null, { envi: true });
  assert.equal(await limits.request(item, "claim", pending), false, "pre-rest prompts cannot consume the refreshed allowance");
  assert.ok((await limits.request(item, "offer")).id);
});

test("failed Extended Rest does not refresh daily usage", async () => {
  const { limits, item, actor } = setup("day");
  class NativeActor { async longRest() { throw new Error("rest failed"); } }
  globalThis.CONFIG = { Actor: { documentClass: NativeActor } };
  game.TriggerPrompts = { limits };
  TriggerItemLimits.registerRest();
  Object.setPrototypeOf(actor, NativeActor.prototype);
  await limits.request(item, "claim", await limits.request(item, "offer"));
  await assert.rejects(actor.longRest(), /rest failed/);
  assert.equal(await limits.request(item, "offer"), null);
});

test("a non-authority client routes item operations to the same GM, or stable owner without a GM", async () => {
  const { item } = setup();
  game.user = { id: "other" };
  const calls = [];
  const limits = new TriggerItemLimits({ executeAsUser: async (...args) => { calls.push(args); return true; } });
  await limits.request(item, "offer");
  assert.equal(calls[0][0], TRIGGER_SOCKET_ACTION.ITEM_LIMIT);
  assert.equal(calls[0][1], "gm");
  game.users.activeGM = null;
  game.users.clear();
  game.users.set("z", { id: "z", active: true });
  game.users.set("a", { id: "a", active: true });
  await limits.request(item, "offer");
  assert.equal(calls[1][1], "a");
});

test("unrestricted items remain backwards compatible and get no usage flag", async () => {
  const { limits, item } = setup("none");
  assert.deepEqual(await limits.request(item, "offer"), { unrestricted: true });
  assert.equal(item.getFlag(MODULE, "trigger-prompt-usage"), undefined);
  assert.equal(TRIGGER_PROMPT_TIMEOUT_MS, 25000);
});


test("event-bound allowances survive a temporarily missing viewed combat and reject a deleted encounter", async () => {
  const { limits, item } = setup();
  const combat = game.combat;
  game.combats = new Map([[combat.id, combat]]);
  game.combat = null;
  const ticket = await limits.request(item, "offer", null, combat.id);
  assert.equal(ticket.combatId, combat.id);
  assert.equal(await limits.request(item, "claim", ticket), true);
  combat.combatant = { id: "next" };
  const next = await limits.request(item, "offer", null, combat.id);
  game.combats.delete(combat.id);
  assert.equal(await limits.request(item, "claim", next), null);
});
