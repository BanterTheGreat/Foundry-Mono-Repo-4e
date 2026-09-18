import test from "node:test";
import assert from "node:assert/strict";
import { TriggerPromptChat } from "../scripts/modules/trigger-prompts/trigger-prompt-chat.js";
import { TRIGGER_PROMPT_ACTION, TRIGGER_PROMPT_FLAG, TRIGGER_SOCKET_ACTION } from "../scripts/modules/trigger-prompts/constants.js";

test("selecting a prompted power enables DnD4e use consumption", async () => {
  const handlers = new Map();
  const usePowerCalls = [];
  const item = { id: "reaction", type: "power", roll: async () => {} };
  const actor = { items: new Map([[item.id, item]]), usePower: async (...args) => usePowerCalls.push(args) };
  const socket = {
    executeAsGM: async action => {
      assert.equal(action, TRIGGER_SOCKET_ACTION.CLAIM_PROMPT);
      return { actorId: "hero", itemId: item.id };
    },
  };
  const html = {
    querySelectorAll(selector) {
      return [{ addEventListener(event, callback) { handlers.set(selector, callback); } }];
    },
    querySelector() { return null; },
  };
  globalThis.game = { user: { id: "player" }, actors: new Map([["hero", actor]]) };
  const promptChat = new TriggerPromptChat(socket);
  const message = { id: "prompt", flags: { [TRIGGER_PROMPT_FLAG]: { recipientIds: ["player"], used: false, expiresAt: null } } };

  promptChat.bindPromptCard(message, html);
  await handlers.get(`[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.USE}']`)({ preventDefault() {}, currentTarget: { dataset: { itemId: item.id } } });

  assert.deepEqual(usePowerCalls, [[item, { configureDialog: true }]]);
});

test("a client that did not receive a private prompt cannot bind its power controls", () => {
  let findCalls = 0;
  globalThis.game = { user: { id: "other-player" } };
  const promptChat = new TriggerPromptChat({});
  const message = { flags: { [TRIGGER_PROMPT_FLAG]: { recipientIds: ["player"], used: false, expiresAt: null } } };

  promptChat.bindPromptCard(message, { querySelectorAll() { findCalls += 1; } });

  assert.equal(findCalls, 0);
});
