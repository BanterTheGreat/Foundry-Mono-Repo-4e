import test from "node:test";
import assert from "node:assert/strict";
import { PlayerDefense } from "../scripts/modules/player-defense/player-defense.js";
import { createGroupedDefenseDialogPayload } from "../scripts/modules/player-defense/player-defense-workflow.js";

const HEALTH = "dnd4e-health-display";

/** One attack message of a multi-attack, with a pending defense for the hero unless `heroless`. */
function attackMessage(index, { groupSize = 3, heroless = false, sessionId = "session" } = {}) {
  const target = { id: `hero-${index}`, actorId: "hero", tokenId: "hero-token", actorName: "Hero", attackerName: `Goblin ${index + 1}`,
    defenseStat: "AC", defenseMod: 10 + index, defenseDice: "1d20", rollDC: 20 + index, attackModifier: 8 + index, baseDefense: 10,
    reversedRollOffset: 2, hitText: "", missText: "", assignedUserId: "player", dialogAttempted: false, resolved: false };
  return { id: `attack-${index}`, content: "", rolls: [],
    flags: { [HEALTH]: { attackResults: { sessionId, groupSize, casterId: `goblin-${index}`, targetIds: heroless ? ["ally"] : ["hero-token"] } },
      ...(heroless ? {} : { playerDefense: { attackName: "Claw", automationManaged: true, targets: [target] } }) } };
}

/** Install the Foundry globals the defense dialog needs and record what it does. */
function install(messages) {
  const dialogs = [];
  const calls = [];
  const rolls = [];
  globalThis.game = { user: { id: "player" }, messages: { contents: messages }, actors: new Map([["hero", { id: "hero", testUserPermission: () => true }]]),
    settings: { settings: new Map(), get: () => false }, PlayerDefense: new PlayerDefense() };
  globalThis.foundry = { applications: { api: { DialogV2: class {
    constructor(options) { dialogs.push(options); }
    render() {}
  } } } };
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; this.options = {}; rolls.push(this); }
    propagateFlavor() {}
    async evaluate() { this.terms = [{ total: 12 }]; this.total = 22; return this; }
    async render() { return "dice"; }
    toJSON() { return { formula: this.formula }; }
  };
  const socket = { async executeAsGM(action, messageId, targetId, ...rest) {
    calls.push([action, messageId, targetId, ...rest]);
    if (action === "attemptDefenseDialog") {
      const target = messages.find(message => message.id === messageId).flags.playerDefense.targets.find(entry => entry.id === targetId);
      if (target.dialogAttempted) {
        return false;
      }
      target.dialogAttempted = true;
    }
    return true;
  } };
  return { dialogs, calls, rolls, socket };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("a multi-attack waits for every attack, then shows the defender one dialog listing all of them", async () => {
  const messages = [attackMessage(0), attackMessage(1)];
  const { dialogs, calls, socket } = install(messages);
  for (const message of messages) {
    PlayerDefense.onRenderDefenseMessage(message, socket);
  }
  await settle();
  assert.equal(dialogs.length, 0, "two of three attacks exist, so the defender must keep waiting");
  assert.equal(calls.length, 0);

  const last = attackMessage(2);
  messages.push(last);
  PlayerDefense.onRenderDefenseMessage(last, socket);
  await settle();
  assert.equal(dialogs.length, 1, "one dialog covers every attack on this defender");
  const text = dialogs[0].content;
  for (const name of ["Goblin 1", "Goblin 2", "Goblin 3"]) {
    assert.ok(text.includes(name), name);
  }
  for (const dc of ["DC 20", "DC 21", "DC 22"]) {
    assert.ok(text.includes(dc), dc);
  }
  assert.match(dialogs[0].buttons[0].label, /3 rolls/);
  assert.deepEqual(calls.filter(call => call[0] === "attemptDefenseDialog").map(call => call[1]), ["attack-0", "attack-1", "attack-2"]);
});

test("re-rendering a completed group never opens the dialog twice", async () => {
  const messages = [attackMessage(0, { groupSize: 2 }), attackMessage(1, { groupSize: 2 })];
  const { dialogs, socket } = install(messages);
  for (const message of messages) {
    PlayerDefense.onRenderDefenseMessage(message, socket);
  }
  await settle();
  for (const message of [...messages, ...messages]) {
    PlayerDefense.onRenderDefenseMessage(message, socket);
  }
  await settle();
  assert.equal(dialogs.length, 1);
  PlayerDefense.onRenderDefenseMessage(messages[0], socket);
  await settle();
  assert.equal(dialogs.length, 1, "attempt flags persist, so later renders stay quiet");
});

test("an attack with no player-character targets can still complete the group", async () => {
  const messages = [attackMessage(0, { groupSize: 2 })];
  const { dialogs, socket } = install(messages);
  PlayerDefense.onRenderDefenseMessage(messages[0], socket);
  await settle();
  assert.equal(dialogs.length, 0);
  const npcOnly = attackMessage(1, { groupSize: 2, heroless: true });
  messages.push(npcOnly);
  PlayerDefense.onRenderDefenseMessage(npcOnly, socket);
  await settle();
  assert.equal(dialogs.length, 1);
  assert.ok(dialogs[0].content.includes("Goblin 1"));
});

test("Defend rolls every attack separately and resolves each message's own defense", async () => {
  const messages = [attackMessage(0, { groupSize: 2 }), attackMessage(1, { groupSize: 2 })];
  const { dialogs, calls, rolls, socket } = install(messages);
  for (const message of messages) {
    PlayerDefense.onRenderDefenseMessage(message, socket);
  }
  await settle();
  assert.equal(dialogs.length, 1);
  await dialogs[0].buttons[0].callback();
  assert.equal(rolls.length, 2, "two attacks mean two different defense rolls");
  assert.notEqual(rolls[0], rolls[1]);
  assert.deepEqual(rolls.map(roll => roll.formula), ["1d20 + 10", "1d20 + 11"], "each roll uses its own attack's defense bonus");
  const resolved = calls.filter(call => call[0] === "resolveDefenseTarget");
  assert.deepEqual(resolved.map(call => [call[1], call[2]]).sort(), [["attack-0", "hero-0"], ["attack-1", "hero-1"]]);
  assert.deepEqual(rolls.map(roll => roll.options.banterDefenseTarget), ["hero-token", "hero-token"]);
});

test("a defender only gets a dialog for attacks assigned to their client", async () => {
  const messages = [attackMessage(0, { groupSize: 2 }), attackMessage(1, { groupSize: 2 })];
  messages[1].flags.playerDefense.targets[0].assignedUserId = "someone-else";
  const { dialogs, socket } = install(messages);
  for (const message of messages) {
    PlayerDefense.onRenderDefenseMessage(message, socket);
  }
  await settle();
  assert.equal(dialogs.length, 1);
  assert.ok(dialogs[0].content.includes("Goblin 1"));
  assert.equal(dialogs[0].content.includes("Goblin 2"), false);
});

test("separate multi-attacks keep their dialogs apart", async () => {
  const first = [attackMessage(0, { groupSize: 1, sessionId: "one" })];
  first[0].flags[HEALTH].attackResults.groupSize = 2;
  const other = attackMessage(1, { groupSize: 2, sessionId: "two" });
  const messages = [first[0], other];
  const { dialogs, socket } = install(messages);
  for (const message of messages) {
    PlayerDefense.onRenderDefenseMessage(message, socket);
  }
  await settle();
  assert.equal(dialogs.length, 0, "each session still waits for its own second attack");
});

test("grouped dialog text escapes names and lists each attack's own check", () => {
  const payload = createGroupedDefenseDialogPayload([
    { attackName: "Claw", attackerName: "<b>Goblin</b>", defenseStat: "ac", defenseMod: 4, defenseDice: "2d20kl1", rollDC: 19, hitText: "The target is slowed." },
    { attackName: "Claw", attackerName: "Orc", defenseStat: "ac", defenseMod: -1, rollDC: 25 },
  ]);
  assert.equal(payload.content.includes("<b>Goblin</b>"), false);
  assert.ok(payload.content.includes("&lt;b&gt;Goblin&lt;/b&gt;"));
  assert.ok(payload.content.includes("Roll 2d20kl1 +4"));
  assert.ok(payload.content.includes("Roll 1d20 -1"));
  assert.ok(payload.content.includes("Your character is slowed."));
  assert.equal(payload.title, "Claw - 2 attacks");
});

test("a minion's own token, not the first combatant sharing its actor, is recorded as the attacker", () => {
  const attacker = { id: "goblin", name: "Goblin", type: "NPC" };
  const actors = [attacker];
  const hero = { id: "hero", type: "Player Character", effects: [] };
  globalThis.canvas = { scene: { id: "scene" } };
  globalThis.game = { actors, PlayerDefense: new PlayerDefense(), settings: { settings: new Map(), get: () => false },
    combat: { combatants: [{ actorId: "goblin", tokenId: "goblin-one", sceneId: "scene" }, { actorId: "goblin", tokenId: "goblin-two", sceneId: "scene" }] } };
  PlayerDefense.OnRollAttack({ id: "claw", name: "Claw" }, { targets: [{ id: "hero-token", actor: hero }], targDefValArray: [20] }, { actor: "goblin", token: "goblin-two" });
  assert.equal(game.PlayerDefense.lastAttack.attackerTokenId, "goblin-two");
  PlayerDefense.OnRollAttack({ id: "claw", name: "Claw" }, { targets: [{ id: "hero-token", actor: hero }], targDefValArray: [20] }, { actor: "goblin" });
  assert.equal(game.PlayerDefense.lastAttack.attackerTokenId, "goblin-one", "without a speaker token the previous lookup still applies");
});
