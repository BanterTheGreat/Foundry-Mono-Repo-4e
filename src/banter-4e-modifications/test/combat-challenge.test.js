import test from "node:test";
import assert from "node:assert/strict";
import { CombatChallenge } from "../scripts/modules/trigger-prompts/combat-challenge.js";

/** Minimal documents exercising native effect writes and permission boundaries. */
function world({ enabled = true, disposition = -1, started = true, permitted = true } = {}) {
  const effects = new Map();
  let writes = 0;
  const actor = { uuid: "Actor.fighter", getFlag: () => ({ classFeatures: { combatChallenge: enabled } }), testUserPermission: () => permitted };
  const victim = { uuid: "Actor.enemy", effects,
    async deleteEmbeddedDocuments(type, ids) { ids.forEach(id => effects.delete(id)); },
    async createEmbeddedDocuments(type, data) { writes += 1; const effect = { ...data[0], id: `mark-${writes}` }; effects.set(effect.id, effect); },
  };
  const tokens = new Map([["fighter", { id: "fighter", actor }], ["enemy", { id: "enemy", disposition, actor: victim }]]);
  const scene = { id: "scene", tokens };
  globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
  globalThis.CONFIG = { ActiveEffect: { documentClass: { getEffectStart: combat => ({ combat: combat.id }) } } };
  globalThis.game = { user: { id: "gm", isGM: true }, users: new Map([["gm", { id: "gm", active: true }]]),
    scenes: new Map([[scene.id, scene]]), combats: [{ id: `combat-${Math.random()}`, started, scene, combatants: [{ tokenId: "fighter" }] }] };
  const event = { id: "evt", attackId: "attack", type: "attack-resolved", outcome: "miss",
    attacker: { sceneId: "scene", tokenId: "fighter" }, target: { sceneId: "scene", tokenId: "enemy" } };
  return { actor, victim, tokens, event, writes: () => writes };
}

test("hits and misses mark hostile and neutral targets with native source and next-turn expiry", async () => {
  for (const disposition of [-1, 0]) {
    for (const outcome of ["hit", "miss"]) {
      const setup = world({ disposition });
      await CombatChallenge.handle({ ...setup.event, outcome });
      const mark = [...setup.victim.effects.values()][0];
      assert.deepEqual(mark.statuses, ["mark"]);
      assert.equal(mark.origin, setup.actor.uuid);
      assert.equal(mark.system.durationType, "endOfUserTurn");
      assert.deepEqual(mark.system.changes, [{ key: "system.marker", type: "override", value: setup.actor.uuid, priority: null }]);
    }
  }
});

test("off, friendly, self, unowned and non-combat attacks do not mark", async () => {
  for (const options of [{ enabled: false }, { disposition: 1 }, { started: false }, { permitted: false }]) {
    const setup = world(options);
    await CombatChallenge.handle(setup.event);
    assert.equal(setup.writes(), 0);
  }
  const setup = world();
  await CombatChallenge.handle({ ...setup.event, target: setup.event.attacker });
  await CombatChallenge.handle({ ...setup.event, type: "attack-targeted" });
  assert.equal(setup.writes(), 0);
});

test("repeated notifications are idempotent; new attacks replace marks and reset their start", async () => {
  const setup = world();
  setup.victim.effects.set("old", { id: "old", statuses: new Set(["mark_2"]) });
  setup.victim.effects.set("other", { id: "other", statuses: new Set(["prone"]) });
  await Promise.all([CombatChallenge.handle(setup.event), CombatChallenge.handle(setup.event)]);
  assert.equal(setup.writes(), 1);
  assert.equal(setup.victim.effects.size, 2);
  assert.ok(setup.victim.effects.has("other"));
  await CombatChallenge.handle({ ...setup.event, attackId: "second" });
  assert.equal(setup.writes(), 2);
  assert.equal(setup.victim.effects.size, 2);
  assert.ok(setup.victim.effects.has("mark-2"));
});

test("players route marks through the GM and cannot call the mutation themselves", async () => {
  const setup = world();
  game.user.isGM = false;
  game.users.activeGM = { id: "other-gm" };
  const calls = [];
  await CombatChallenge.handle(setup.event, { executeAsGM: async (...args) => calls.push(args) });
  assert.equal(calls[0][0], "applyCombatChallenge");
  assert.deepEqual(calls[0][1].target, setup.event.target);
  assert.equal(setup.writes(), 0);
  await assert.rejects(() => CombatChallenge.apply(calls[0][1]), /Only a GM/);
});

test("missing GM produces a warning, not a failed player-side document mutation", async () => {
  const setup = world();
  game.user.isGM = false;
  const warnings = [];
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  await CombatChallenge.handle(setup.event);
  assert.equal(warnings.length, 1);
  assert.equal(setup.writes(), 0);
});

test("native targets without known defenses still mark; automation waits and ignores removed targets", async () => {
  const setup = world();
  await CombatChallenge.handleCapture({ attackId: 'native', sceneId: 'scene', attackerTokenId: 'fighter',
    targets: [{ sceneId: 'scene', tokenId: 'enemy' }] });
  assert.equal(setup.writes(), 1);
  const message = { id: 'automated', rolls: [{ options: { multirollData: { targetID: 'enemy', critstate: 'immune' } } }],
    flags: { 'dnd4e-health-display': { attackResults: { sessionId: 'session', pending: true,
      sceneId: 'scene', casterId: 'fighter', targetIds: ['enemy'] } } } };
  await CombatChallenge.handleAutomation(message);
  assert.equal(setup.writes(), 1);
  message.flags['dnd4e-health-display'].attackResults.pending = false;
  message.flags['dnd4e-health-display'].attackResults.targetIds = [];
  await CombatChallenge.handleAutomation(message);
  assert.equal(setup.writes(), 1);
  message.flags['dnd4e-health-display'].attackResults.targetIds = ['enemy'];
  await CombatChallenge.handleAutomation(message);
  assert.equal(setup.writes(), 2);
});
