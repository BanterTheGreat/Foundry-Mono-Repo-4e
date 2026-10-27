import test from "node:test";
import assert from "node:assert/strict";
import { SocketHelper } from "../scripts/modules/player-defense/socket-helper.js";
import { PlayerDefense } from "../scripts/modules/player-defense/player-defense.js";

test("Player Defense replaces a captured NPC attack with a defense card", () => {
  const createdMessages = [];
  const attacker = { id: "badger", name: "Badger", type: "NPC" };
  const defender = { id: "rogal", name: "Rogal", type: "Player Character", effects: [] };
  const targetToken = { id: "rogal-token", actor: defender, document: { parent: { id: "scene" } } };
  let clearedCaptures = 0;

  globalThis.canvas = { scene: { id: "scene" } };
  globalThis.ChatMessage = { create: data => createdMessages.push(data) };
  globalThis.game = {
    actors: [attacker],
    combat: { combatants: [{ actorId: attacker.id, tokenId: "badger-token", sceneId: "scene" }] },
    users: [{ id: "gm", active: true, isGM: true }],
    settings: { settings: new Map(), get: () => false },
    TriggerPrompts: { clearPendingAttackContext: () => { clearedCaptures += 1; } },
    PlayerDefense: new PlayerDefense(),
  };

  const item = { id: "bite", name: "Bite", rangeType: "weapon", system: { attack: { def: "ac" }, hit: {}, miss: {} }, hasDamage: false };
  PlayerDefense.OnRollAttack(item, { targets: [targetToken], targDefValArray: [26] }, { actor: attacker.id, token: "badger-token" });
  const intercepted = PlayerDefense.OnPowerChatMessage({ flavor: "Attack: Bite", rolls: [{ formula: "1d20 + 16" }] });

  assert.equal(intercepted, false);
  assert.equal(clearedCaptures, 1);
  assert.equal(createdMessages.length, 1);
  assert.equal(createdMessages[0].flags.playerDefense.attackName, "Bite");
  assert.equal(createdMessages[0].flags.playerDefense.targets[0].defenseMod, 16);
  assert.equal(createdMessages[0].flags.playerDefense.targets[0].rollDC, 28);
  assert.equal(createdMessages[0].flags.playerDefense.targets[0].attackModifier, 16);
  assert.equal(createdMessages[0].flags.playerDefense.targets[0].baseDefense, 10);
  assert.equal(createdMessages[0].flags.playerDefense.targets[0].reversedRollOffset, 2);
  assert.equal(createdMessages[0].flags.playerDefense.attackRange, "weapon");
  assert.match(createdMessages[0].content, /Rogal defends/);
  assert.match(createdMessages[0].content, /<small>DC<\/small><strong>28/);
});


test("automated NPC attacks keep their session, per-target DCs, native NPC rolls, and player popups", async () => {
  const attacker = { id: "enemy", name: "Enemy", type: "NPC" };
  const heroes = ["first", "second"].map(id => ({ id, name: id, type: "Player Character", testUserPermission: () => true }));
  const npc = { id: "ally", name: "Ally", type: "NPC" };
  const tokens = [...heroes, npc].map(actor => ({ id: `${actor.id}-token`, actor }));
  const actors = new Map([attacker, ...heroes, npc].map(actor => [actor.id, actor]));
  actors.find = predicate => [...actors.values()].find(predicate);
  const item = { id: "power", name: "Blast", system: { attack: { def: "ref" }, hit: {}, miss: {} } };
  globalThis.canvas = { scene: { id: "scene" } };
  const dialogs = [];
  globalThis.foundry = { applications: { api: { DialogV2: class {
    constructor(options) { dialogs.push(options); }
    render() {}
  } } } };
  globalThis.game = {
    actors, user: { id: "player" }, users: [{ id: "player", active: true, isGM: false }],
    settings: { settings: new Map(), get: () => false }, PlayerDefense: new PlayerDefense(),
  };
  globalThis.ChatMessage = { create() { assert.fail("must keep the existing automation message"); } };
  const payload = { targets: tokens, targDefValArray: [24, 27, 20], targetHit: tokens.slice(), targetMissed: [] };
  PlayerDefense.OnRollAttack(item, payload, { actor: attacker.id });
  assert.deepEqual(payload.targetHit, [tokens[2]]);
  const context = { sessionId: "session", effectsManaged: true, pending: true, targetIds: tokens.map(token => token.id) };
  const message = {
    id: "attack", flavor: "Blast", flags: { "dnd4e-health-display": { attackResults: context } },
    rolls: tokens.map((token, index) => ({ formula: `${index === 1 ? "2d20kh1" : "1d20"} + ${10 + index}`, options: { multirollData: { targetID: token.id } } })),
    updateSource(data) { Object.assign(this, data); },
  };
  assert.equal(PlayerDefense.OnPowerChatMessage(message), true);
  assert.equal(message.flags["dnd4e-health-display"].attackResults, context);
  assert.equal(message.flags.playerDefense.automationManaged, true);
  assert.deepEqual(message.flags.playerDefense.targets.map(target => target.rollDC), [22, 23]);
  assert.deepEqual(message.flags.playerDefense.targets.map(target => target.defenseMod), [14, 17]);
  assert.equal(message.flags.playerDefense.targets[1].defenseDice, "2d20kl1");
  assert.deepEqual(message.rolls.map(roll => roll.options.multirollData.targetID), ["ally-token"]);
  const responses = [];
  PlayerDefense.onRenderDefenseMessage(message, { executeAsGM: async (action, ...args) => {
    if (action === "resolveDefenseTarget") {
      responses.push(args);
    }
    return true;
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dialogs.length, 2);
  assert.match(dialogs[0].content, /DC 22/);
  game.dice3d = { showForRoll() { assert.fail("Managed defense must animate through the updated chat message"); } };
  globalThis.Roll = class {
    constructor() { this.options = {}; this.terms = [{ total: 12 }]; this.total = 26; }
    propagateFlavor() {}
    async evaluate() { return this; }
    async render() { return "defense dice"; }
    toJSON() { return { total: this.total, options: this.options }; }
  };
  await dialogs[0].buttons[0].callback();
  assert.equal(JSON.parse(responses[0][4].roll).options.banterDefenseTarget, "first-token");
});

test("player attackers and NPC-only targets never enter Player Defense", () => {
  for (const [attackerType, targetType] of [["Player Character", "NPC"], ["NPC", "NPC"]]) {
    const attacker = { id: "attacker", type: attackerType };
    globalThis.game = {
      actors: [attacker], PlayerDefense: new PlayerDefense(), settings: { settings: new Map(), get: () => false },
    };
    game.PlayerDefense.lastAttack = null;
    PlayerDefense.OnRollAttack({ id: "power" }, { targets: [{ actor: { type: targetType } }], targDefValArray: [20] }, { actor: "attacker" });
    assert.equal(game.PlayerDefense.lastAttack, null);
  }
});


test("managed defense modifiers change the total without rerolling or overriding natural results", async () => {
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.ui = { notifications: { error() {} } };
  globalThis.game = { user: { isGM: true }, settings: { settings: new Map(), get: () => false } };
  const targets = [{ id: "hero", tokenId: "hero", actorName: "Hero", resolved: true,
    total: 23, natural: 15, rollDC: 24, outcome: "normal", rollHtml: "<div>Original dice</div>" }];
  const message = { id: "adjustable", rolls: [], flags: { playerDefense: { attackName: "Blast", targets },
    "dnd4e-health-display": { attackResults: { pending: true, targetIds: ["hero"] } } },
    async update(data) { this.content = data.content; this.flags.playerDefense.targets = data["flags.playerDefense.targets"]; },
  };
  game.messages = new Map([[message.id, message]]);
  game.SocketHelper = new SocketHelper();
  const defense = new PlayerDefense();
  await defense.adjustDefenseTarget(message, "hero", 2);
  assert.equal(message.flags.playerDefense.targets[0].outcome, "miss");
  assert.equal(message.flags.playerDefense.targets[0].total, 25);
  assert.match(message.content, /Original dice/);
  assert.match(message.content, /<strong>24<\/strong>/);
  await defense.adjustDefenseTarget(message, "hero", 0);
  assert.equal(message.flags.playerDefense.targets[0].outcome, "normal");
  assert.equal(message.flags.playerDefense.targets[0].total, 23);
  message.flags.playerDefense.targets[0].natural = 20;
  await assert.rejects(defense.adjustDefenseTarget(message, "hero", 10), /cannot be adjusted/);
});
