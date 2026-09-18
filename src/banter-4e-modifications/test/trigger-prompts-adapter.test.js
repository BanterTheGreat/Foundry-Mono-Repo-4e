import test from "node:test";
import assert from "node:assert/strict";
import { TriggerPrompts } from "../scripts/modules/trigger-prompts/trigger-prompts.js";
import { TRIGGER_SOCKET_ACTION } from "../scripts/modules/trigger-prompts/constants.js";

test("TriggerPrompts forwards a completed captured attack to the GM socket", async () => {
  const calls = [];
  const socket = { executeAsGM: (...args) => { calls.push(args); return Promise.resolve(); } };
  globalThis.canvas = { scene: { id: "scene" } };
  globalThis.game = { TriggerPrompts: new TriggerPrompts(socket) };

  TriggerPrompts.onDnd4eRollAttack(
    { name: "Bite" },
    { targets: [{ id: "hero-token", actor: { id: "hero" } }], targDefValArray: [22], targDefArray: ["ac"], targetMissed: [] },
    { actor: "wolf", token: "wolf-token" },
  );
  TriggerPrompts.onPreCreateRollMessage({ flavor: "Bite attack", rolls: [{ total: 23, dice: [{ faces: 20, results: [{ active: true, result: 15 }] }] }] }, socket);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], TRIGGER_SOCKET_ACTION.EVALUATE_ATTACK);
  assert.equal(calls[0][1].targets[0].defense, 22);
  assert.equal(calls[0][1].natural, 15);
});

test("TriggerPrompts forwards a failed non-death saving throw to the GM socket", async () => {
  const calls = [];
  const waitedMessageIds = [];
  const socket = { executeAsGM: (...args) => { calls.push(args); return Promise.resolve(); } };
  globalThis.game = { user: { id: "player" }, TriggerPrompts: new TriggerPrompts(socket), dice3d: { waitFor3DAnimationByMessageID: async id => waitedMessageIds.push(id) } };

  await TriggerPrompts.onCreateRollMessage({
    id: "save-message",
    author: { id: "player" },
    flavor: "Saving Throw vs. <strong>-5 defenses (power) ◆ Save Ends</strong> (DC 28)",
    speaker: { scene: "scene", actor: "hero", token: "hero-token" },
    rolls: [{ total: 9, dice: [{ faces: 20, options: { target: 10 } }] }],
  }, socket);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], TRIGGER_SOCKET_ACTION.EVALUATE_SAVING_THROW);
  assert.equal(calls[0][1].actor.actorId, "hero");
  assert.deepEqual(waitedMessageIds, ["save-message"]);
});

test("TriggerPrompts forwards a failed rolling saving throw without a roll flag", async () => {
  const calls = [];
  const socket = { executeAsGM: (...args) => { calls.push(args); return Promise.resolve(); } };
  globalThis.game = { user: { id: "player" }, TriggerPrompts: new TriggerPrompts(socket) };

  await TriggerPrompts.onCreateRollMessage({
    id: "save-message",
    author: { id: "player" },
    flavor: "Rolling Saving Throw (DC 28)",
    speaker: { scene: "scene", actor: "hero", token: "hero-token" },
    rolls: [{ total: 22, dice: [{ faces: 20, options: { target: 28 } }] }],
  }, socket);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], TRIGGER_SOCKET_ACTION.EVALUATE_SAVING_THROW);
});

test("TriggerPrompts ignores a failed death saving throw without a roll flag", async () => {
  const calls = [];
  const socket = { executeAsGM: (...args) => { calls.push(args); return Promise.resolve(); } };
  globalThis.game = { user: { id: "player" }, TriggerPrompts: new TriggerPrompts(socket) };

  await TriggerPrompts.onCreateRollMessage({
    id: "save-message",
    author: { id: "player" },
    flavor: "Death Saving Throw (DC 10)",
    speaker: { scene: "scene", actor: "hero", token: "hero-token" },
    rolls: [{ total: 9, dice: [{ faces: 20, options: { target: 10 } }] }],
  }, socket);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 0);
});
