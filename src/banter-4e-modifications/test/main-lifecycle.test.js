import test from "node:test";
import assert from "node:assert/strict";

test("module entry point registers settings, sockets, and enabled feature hooks", async () => {
  const handlers = { on: new Map(), once: new Map() };
  const addHandler = (kind, name, callback) => {
    const callbacks = handlers[kind].get(name) ?? [];
    callbacks.push(callback);
    handlers[kind].set(name, callbacks);
  };
  const settings = [];
  globalThis.Hooks = { on: (name, callback) => addHandler("on", name, callback), once: (name, callback) => addHandler("once", name, callback) };
  globalThis.game = {
    settings: { register: (...args) => settings.push(args), get: () => true },
    users: [],
  };

  await import(`../scripts/main.js?lifecycle-test=${Date.now()}`);
  for (const callback of handlers.on.get("i18nInit") ?? []) {
    callback();
  }

  assert.deepEqual(settings.map(([scope, key]) => `${scope}.${key}`).sort(), [
    "banter-4e-modifications.enable-active-defense",
    "banter-4e-modifications.enable-debug-logging",
    "banter-4e-modifications.enable-opportunity-attack-chat-actions",
    "banter-4e-modifications.enable-trigger-prompts",
  ]);
  assert.equal(handlers.once.get("socketlib.ready")?.length, 1);
  assert.equal(handlers.on.get("dnd4e.rollAttack")?.length, 2);
  assert.equal(handlers.on.get("preCreateChatMessage")?.length, 2);
  assert.equal(handlers.on.get("renderChatMessageHTML")?.length, 3);
  assert.equal(handlers.on.get("renderChatMessage")?.length, 1);
  assert.equal(handlers.on.get("createActiveEffect")?.length ?? 0, 0);
  assert.equal(handlers.on.get("deleteCombat")?.length ?? 0, 0);
});
