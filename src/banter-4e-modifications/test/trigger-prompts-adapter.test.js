import test from "node:test";
import assert from "node:assert/strict";
import { TriggerPrompts } from "../scripts/modules/trigger-prompts/trigger-prompts.js";
import { COMBAT_EVENT_TYPE, MOVEMENT_TYPE } from "../scripts/modules/trigger-prompts/combat-events.js";
import { TRIGGER_ID } from "../scripts/modules/trigger-prompts/constants.js";

/** Installs a client for `userId` and collects every event the adapter reports. */
function setUp({ userId = "player", combat, extra = {} } = {}) {
  const socket = { executeAsUser() { assert.fail("evaluation must not use the socket"); }, executeAsGM() { assert.fail("evaluation must not need a GM"); } };
  globalThis.canvas = { scene: { id: "scene" }, grid: { size: 100 } };
  globalThis.ui = { notifications: { error() {} } };
  globalThis.game = { user: { id: userId, isGM: false }, users: [], combat, settings: { settings: new Map() }, ...extra };
  const triggerPrompts = new TriggerPrompts(socket);
  globalThis.game.TriggerPrompts = triggerPrompts;
  const events = [];
  triggerPrompts.events.subscribe(event => { if (event.type !== COMBAT_EVENT_TYPE.ATTACK_TARGETED) { events.push(event); } });
  return { triggerPrompts, events };
}

const attackMessage = (overrides = {}) => ({
  flavor: "Bite attack",
  speaker: { actor: "wolf", token: "wolf-token" },
  rolls: [{ total: 23, dice: [{ faces: 20, results: [{ active: true, result: 15 }] }] }],
  ...overrides,
});

test("a completed attack is reported as one event per target, without the socket", async () => {
  const { events } = setUp();

  TriggerPrompts.onDnd4eRollAttack(
    { name: "Bite", rangeType: "weapon" },
    { targets: [{ id: "hero-token", actor: { id: "hero" } }, { id: "ally-token", actor: { id: "ally" } }], targDefValArray: [22, 30], targDefArray: ["ac", "ref"], targetMissed: [] },
    { actor: "wolf", token: "wolf-token" },
  );
  TriggerPrompts.onPreCreateRollMessage(attackMessage());
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(events.map(event => [event.type, event.target.tokenId, event.outcome]), [
    [COMBAT_EVENT_TYPE.ATTACK_RESOLVED, "hero-token", "hit"],
    [COMBAT_EVENT_TYPE.ATTACK_RESOLVED, "ally-token", "miss"],
  ]);
  assert.equal(events[0].isMelee, true);
  assert.equal(events[0].natural, 15);
  assert.equal(events[0].attackId, events[1].attackId);
});

test("two attacks in flight at once are each matched to their own message", async () => {
  const { events } = setUp();
  const attack = (name, token) => TriggerPrompts.onDnd4eRollAttack(
    { name },
    { targets: [{ id: "target", actor: { id: "t" } }], targDefValArray: [10], targDefArray: ["ac"], targetMissed: [] },
    { actor: `${token}-actor`, token },
  );

  attack("Bite", "wolf-token");
  attack("Claw", "bear-token");
  TriggerPrompts.onPreCreateRollMessage(attackMessage({ flavor: "Claw attack", speaker: { actor: "bear-actor", token: "bear-token" } }));
  TriggerPrompts.onPreCreateRollMessage(attackMessage({ flavor: "Bite attack" }));
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(events.map(event => event.attacker.tokenId), ["bear-token", "wolf-token"]);
});

test("a failed non-death saving throw is reported after the dice animation", async () => {
  const waitedMessageIds = [];
  const { events } = setUp({ extra: { dice3d: { waitFor3DAnimationByMessageID: async id => waitedMessageIds.push(id) } } });

  await TriggerPrompts.onCreateRollMessage({
    id: "save-message",
    author: { id: "player" },
    flavor: "Saving Throw vs. <strong>-5 defenses (power) ◆ Save Ends</strong> (DC 28)",
    speaker: { scene: "scene", actor: "hero", token: "hero-token" },
    rolls: [{ total: 9, dice: [{ faces: 20, options: { target: 10 } }] }],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, COMBAT_EVENT_TYPE.SAVE_RESOLVED);
  assert.deepEqual(events[0].subject, { sceneId: "scene", tokenId: "hero-token", actorId: "hero" });
  assert.equal(events[0].outcome, "fail");
  assert.deepEqual(waitedMessageIds, ["save-message"]);
});

test("a failed rolling saving throw without a roll flag is reported", async () => {
  const { events } = setUp();

  await TriggerPrompts.onCreateRollMessage({
    id: "save-message",
    author: { id: "player" },
    flavor: "Rolling Saving Throw (DC 28)",
    speaker: { scene: "scene", actor: "hero", token: "hero-token" },
    rolls: [{ total: 22, dice: [{ faces: 20, options: { target: 28 } }] }],
  });

  assert.equal(events.length, 1);
});

test("successful saves are reported, death saves and other users' messages are excluded", async () => {
  const { events } = setUp();
  const save = overrides => ({
    id: "save", author: { id: "player" }, flavor: "Saving Throw (DC 10)", speaker: { scene: "scene", actor: "hero", token: "hero-token" },
    rolls: [{ total: 9, dice: [{ faces: 20, options: { target: 10 } }] }], ...overrides,
  });

  await TriggerPrompts.onCreateRollMessage(save({ rolls: [{ total: 12, dice: [{ faces: 20, options: { target: 10 } }] }] }));
  await TriggerPrompts.onCreateRollMessage(save({ flavor: "Death Saving Throw (DC 10)" }));
  await TriggerPrompts.onCreateRollMessage(save({ author: { id: "someone-else" } }));

  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "success");
});

/** A committed move shaped like Foundry v14's TokenMovementOperation. */
const movement = (origin, waypoints, overrides = {}) => ({ id: "move-1", method: "dragging", origin, destination: waypoints.at(-1), passed: { waypoints }, pending: { waypoints: [] }, ...overrides });
const runner = { id: "runner", parent: { id: "scene" } };

test("a move by this client's user is reported with its full path, whoever the user is", async () => {
  const { events } = setUp();

  await TriggerPrompts.onMoveToken(runner, movement({ x: 100, y: 200, elevation: 0 }, [{ x: 300, y: 200 }, { x: 300, y: 500 }]), {}, { id: "player" });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, COMBAT_EVENT_TYPE.MOVEMENT_COMMITTED);
  assert.deepEqual(events[0].path, [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 500 }]);
  assert.deepEqual(events[0].mover, { sceneId: "scene", tokenId: "runner" });
  assert.equal(events[0].movementType, MOVEMENT_TYPE.WALK);
});

test("a move requested by another user is left to that user's client", async () => {
  const { events } = setUp({ userId: "gm" });

  await TriggerPrompts.onMoveToken(runner, movement({ x: 0, y: 0 }, [{ x: 300, y: 0 }]), {}, { id: "player" });

  assert.deepEqual(events, []);
});

test("a move that went nowhere, or only repeated positions, is not a movement event", async () => {
  const { events } = setUp();

  await TriggerPrompts.onMoveToken(runner, movement({ x: 100, y: 100 }, [{ x: 100, y: 100 }]), {}, { id: "player" });
  await TriggerPrompts.onMoveToken(runner, movement({ x: 100, y: 100 }, []), {}, { id: "player" });

  assert.deepEqual(events, []);
});

test("consecutive duplicate waypoints are dropped from the path", async () => {
  const { events } = setUp();

  await TriggerPrompts.onMoveToken(runner, movement({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }]), {}, { id: "player" });

  assert.deepEqual(events[0].path, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }]);
});

test("undoing a move is not a new move", async () => {
  const { events } = setUp();

  await TriggerPrompts.onMoveToken(runner, movement({ x: 0, y: 0 }, [{ x: 300, y: 0 }], { method: "undo" }), {}, { id: "player" });

  assert.deepEqual(events, []);
});

test("movement methods without a Shift action retain walking behavior", async () => {
  const { events } = setUp();

  for (const method of ["dragging", "keyboard", "api", "hud"]) {
    await TriggerPrompts.onMoveToken(runner, movement({ x: 0, y: 0 }, [{ x: 300, y: 0 }], { method }), {}, { id: "player" });
  }

  assert.deepEqual(events.map(event => event.movementType), Array(4).fill(MOVEMENT_TYPE.WALK));
});

test("native waypoint actions exclude Shift segments while retaining the full mixed path", async () => {
  const { events } = setUp();
  await TriggerPrompts.onMoveToken(runner, movement({ x: 0, y: 0 }, [{ x: 100, y: 0, action: "shift" }]), {}, { id: "player" });
  assert.equal(events[0].movementType, MOVEMENT_TYPE.SHIFT);
  assert.deepEqual(events[0].opportunityPaths, []);
  await TriggerPrompts.onMoveToken(runner, movement({ x: 0, y: 0 }, [
    { x: 100, y: 0, action: "shift" }, { x: 200, y: 0, action: "walk" }, { x: 300, y: 0, action: "shift" },
  ]), {}, { id: "player" });
  assert.equal(events[1].movementType, MOVEMENT_TYPE.WALK);
  assert.equal(events[1].path.length, 4);
  assert.deepEqual(events[1].opportunityPaths, [[{ x: 100, y: 0 }, { x: 200, y: 0 }]]);
  await TriggerPrompts.onMoveToken({ ...runner, movementAction: "shift" }, movement({ x: 0, y: 0 }, [{ x: 100, y: 0 }]), {}, { id: "player" });
  assert.equal(events[2].movementType, MOVEMENT_TYPE.SHIFT);
});

const combatWith = (...combatants) => ({ started: true, combatants });

test("an HP change made by this client reports one event per token of that actor", async () => {
  const actor = { uuid: "Actor.hero", system: { attributes: { hp: { value: 8, max: 30 } }, details: { bloodied: 15 } } };
  const { events } = setUp({ combat: combatWith(
    { sceneId: "scene", tokenId: "hero-a", actor },
    { sceneId: "scene", tokenId: "hero-b", actor },
    { sceneId: "scene", tokenId: "other", actor: { uuid: "Actor.other" } },
  ) });

  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 20 } } }, "player");

  assert.deepEqual(events.map(event => [event.type, event.subject.tokenId, event.becameBloodied]), [
    [COMBAT_EVENT_TYPE.HP_CHANGED, "hero-a", true],
    [COMBAT_EVENT_TYPE.HP_CHANGED, "hero-b", true],
  ]);
  assert.equal(events[0].bloodiedThreshold, 15);
});

test("the bloodied threshold falls back to half of maximum HP", async () => {
  const actor = { uuid: "Actor.hero", system: { attributes: { hp: { value: 10, max: 30 } }, details: {} } };
  const { events } = setUp({ combat: combatWith({ sceneId: "scene", tokenId: "hero", actor }) });

  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 20 } } }, "player");

  assert.equal(events[0].bloodiedThreshold, 15);
  assert.equal(events[0].becameBloodied, true);
});

test("a lethal HP update carries the matching receipt's attacker and manual changes do not guess", async () => {
  const actor = { uuid: "Actor.enemy", system: { attributes: { hp: { value: -2, max: 30 } }, details: {} } };
  const { events } = setUp({ combat: combatWith({ sceneId: "scene", tokenId: "enemy", actor }), extra: {
    messages: new Map([["damage", { flags: { "dnd4e-health-display": {
      damageApplication: { sceneId: "scene" }, attackResults: { casterId: "hero" },
      damageApplications: { enemy: { state: "applying", health: { before: 8, after: -2 } } },
    } } }]]),
  } });
  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 8 } } }, "player");
  assert.equal(events[0].reducedToZero, true);
  assert.deepEqual(events[0].attacker, { sceneId: "scene", tokenId: "hero" });
  game.messages.clear();
  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 8 } } }, "player");
  assert.equal(events[1].reducedToZero, true);
  assert.equal(events[1].attacker, null);
});

test("HP updates from other users, outside combat, or without a change are not reported", async () => {
  const actor = { uuid: "Actor.hero", system: { attributes: { hp: { value: 8, max: 30 } }, details: { bloodied: 15 } } };
  const started = combatWith({ sceneId: "scene", tokenId: "hero", actor });
  const { events } = setUp({ combat: started });

  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 20 } } }, "gm");
  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 8 } } }, "player");
  await TriggerPrompts.onUpdateActor(actor, {}, {}, "player");
  globalThis.game.combat = { started: false, combatants: started.combatants };
  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 20 } } }, "player");

  assert.deepEqual(events, []);
});

test("a Player Defense outcome is reported as the same attack event", async () => {
  const { triggerPrompts, events } = setUp();

  await triggerPrompts.handleActiveDefenseOutcome({
    attackerTokenId: "wolf-token", sceneId: "scene", targetTokenId: "hero-token", targetSceneId: "scene", defenseType: "AC", attackRange: "weapon",
  }, "miss");

  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "miss");
  assert.equal(events[0].target.tokenId, "hero-token");
});

test("Player Defense discards only the capture of the attack it replaces", async () => {
  const { triggerPrompts, events } = setUp();
  const attack = (name, token) => TriggerPrompts.onDnd4eRollAttack(
    { name },
    { targets: [{ id: "target", actor: { id: "t" } }], targDefValArray: [10], targDefArray: ["ac"], targetMissed: [] },
    { actor: `${token}-actor`, token },
  );

  attack("Bite", "wolf-token");
  attack("Claw", "bear-token");
  triggerPrompts.clearPendingAttackContext(attackMessage({ flavor: "Bite attack" }));
  TriggerPrompts.onPreCreateRollMessage(attackMessage({ flavor: "Bite attack" }));
  TriggerPrompts.onPreCreateRollMessage(attackMessage({ flavor: "Claw attack", speaker: { actor: "bear-token-actor", token: "bear-token" } }));
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(events.map(event => event.attacker.tokenId), ["bear-token"]);
});

test("a player's own attack produces a prompt on the player's client with no GM connected", async () => {
  const reaction = { id: "retaliate", type: "power", name: "Retaliate", system: {}, flags: { "banter-4e-modifications": { "trigger-prompts": { version: 1, assignments: [{ triggerId: TRIGGER_ID.ENEMY_MISSES_YOU, parameters: {} }] } } } };
  const hero = { id: "hero", uuid: "Actor.hero", items: new Map([[reaction.id, reaction]]), getFlag: () => ({ assignments: [] }), testUserPermission: user => user.id === "player" };
  const heroToken = { id: "hero-token", name: "Rogal", actor: hero, disposition: 1, x: 100, y: 0, width: 1, height: 1, parent: { id: "scene" } };
  const wolfToken = { id: "wolf-token", name: "Wolf", actor: { id: "wolf", uuid: "Actor.wolf", items: new Map() }, disposition: -1, x: 0, y: 0, width: 1, height: 1, parent: { id: "scene" } };
  const tokens = [wolfToken, heroToken];
  const { triggerPrompts } = setUp({
    userId: "player",
    combat: combatWith(...tokens.map(token => ({ sceneId: "scene", tokenId: token.id, actor: token.actor }))),
    extra: {
      users: [{ id: "gm", active: false, isGM: true }, { id: "player", active: true, isGM: false }],
      scenes: new Map([["scene", { grid: { size: 100 }, tokens: new Map(tokens.map(token => [token.id, token])) }]]),
    },
  });
  const cards = [];
  triggerPrompts.promptChat.createPromptCard = async card => cards.push(card);

  TriggerPrompts.onDnd4eRollAttack(
    { name: "Bite" },
    { targets: [{ id: heroToken.id, actor: hero }], targDefValArray: [25], targDefArray: ["ac"], targetMissed: [] },
    { actor: "wolf", token: wolfToken.id },
  );
  TriggerPrompts.onPreCreateRollMessage(attackMessage({ rolls: [{ total: 12, dice: [{ faces: 20, results: [{ active: true, result: 4 }] }] }] }));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(cards.length, 1);
  assert.equal(cards[0].trigger.id, TRIGGER_ID.ENEMY_MISSES_YOU);
  assert.deepEqual(cards[0].recipientIds, ["player"]);
});

test("socket entry points hand claims and dismissals to this client's prompt chat", async () => {
  const { triggerPrompts } = setUp();
  triggerPrompts.promptChat.claimPrompt = async (...args) => ({ claimed: args });
  triggerPrompts.promptChat.dismissPrompt = async id => id === "prompt";

  assert.deepEqual(await TriggerPrompts.claimPromptFromSocket("prompt", "item"), { claimed: ["prompt", "item"] });
  assert.equal(await TriggerPrompts.dismissPromptFromSocket("prompt"), true);
});


test("Target Automation waits for confirmation and delivers each target once on the confirming client", async () => {
  const { events } = setUp();
  const message = { id: "automated", flags: { "dnd4e-health-display": { attackResults: {
    sessionId: "session", sceneId: "scene", casterId: "enemy", targetIds: ["hero"], pending: true,
    triggerMetadata: { attackRange: "range", defenseType: "ref", isOpportunity: true },
  } } }, rolls: [{ options: { multirollData: { targetID: "hero", hitstate: "hit" } } }] };
  await TriggerPrompts.onAutomationMessage(message, { "flags.dnd4e-health-display.attackResults.pending": false }, {}, "player");
  assert.equal(events.length, 0);
  message.flags["dnd4e-health-display"].attackResults.pending = false;
  await TriggerPrompts.onAutomationMessage(message, { "flags.dnd4e-health-display.attackResults.pending": false }, {}, "other");
  assert.equal(events.length, 0);
  await TriggerPrompts.onAutomationMessage(message, { "flags.dnd4e-health-display.attackResults.pending": false }, {}, "player");
  await TriggerPrompts.onAutomationMessage(message, { "flags.dnd4e-health-display.attackResults.pending": false }, {}, "player");
  assert.equal(events.length, 1);
  assert.equal(events[0].isOpportunity, true);
  assert.equal(events[0].attackType, "ranged");
});

test("targeted events preserve the complete roster and effective native opportunity mode", async () => {
  const { triggerPrompts } = setUp();
  const targeted = [];
  triggerPrompts.events.subscribe(event => { if (event.type === COMBAT_EVENT_TYPE.ATTACK_TARGETED) { targeted.push(event); } });
  TriggerPrompts.onDnd4eRollAttack({ name: "Strike", rangeType: "weapon", isOpp: true }, { targets: [{ id: "hero" }, { id: "ally" }] }, { token: "enemy" });
  TriggerPrompts.onPreCreateRollMessage(attackMessage({ flavor: "Strike", speaker: { token: "enemy" } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(targeted.length, 2);
  assert.deepEqual(targeted[0].targetIds, ["hero", "ally"]);
  assert.equal(targeted[0].isOpportunity, true);
});

test("damage to temporary HP alone reports positive damage without a bloodied transition", async () => {
  const actor = { uuid: "Actor.hero", system: { attributes: { hp: { value: 40, max: 40 }, temphp: { value: 5 } } } };
  const { events } = setUp({ combat: { started: true, combatants: [{ actor, sceneId: "scene", tokenId: "hero" }] } });
  // Only observe the hook adapter, independently of live document resolution.
  game.TriggerPrompts.dispatcher.handle = async () => {};
  await TriggerPrompts.onUpdateActor(actor, {}, { dnd4e: { hp: { hp: 40, temp: 10 } } }, "player");
  assert.equal(events.length, 1);
  assert.equal(events[0].damageTaken, 5);
  assert.equal(events[0].becameBloodied, false);
});


test("unrelated updates to confirmed automation messages do not replay results after a handler reload", async () => {
  const { events } = setUp();
  const message = { id: "old", flags: { "dnd4e-health-display": { attackResults: { sessionId: "old-session", pending: false, sceneId: "scene", casterId: "enemy", targetIds: ["hero"] } } }, rolls: [{ options: { multirollData: { targetID: "hero", hitstate: "hit" } } }] };
  await TriggerPrompts.onAutomationMessage(message, { content: "Updated" }, {}, "player");
  assert.equal(events.length, 0);
  await TriggerPrompts.onAutomationMessage(message, { flags: { "dnd4e-health-display": { attackResults: { pending: false } } } }, {}, "player");
  assert.equal(events.length, 1);
});
