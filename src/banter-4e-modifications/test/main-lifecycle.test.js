import test from "node:test";
import assert from "node:assert/strict";
import { AttackBuffs } from "../scripts/modules/attack-buffs/attack-buffs.js";

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
  // Foundry restores chat history before ready. There is no live roll/actor
  // context here: only the message data loaded from storage after a refresh.
  for (const hook of ["renderChatMessageHTML", "renderChatMessage"]) {
    const render = handlers.on.get(hook)?.find(callback => callback === AttackBuffs.renderBadges);
    assert.ok(render, `${hook} must restore saved badges before ready`);
    for (const savedMessage of [
      { rolls: [{ total: 20, options: { banterAttackBuffs: [{ name: "Bless", value: 2, decisive: true }] } }] },
      { rolls: [{ total: 20 }], flags: { "banter-4e-modifications": { skillCheck: {
        dc: 20, badges: [{ name: "Proficiency", value: 5, loss: 5 }],
      } } } },
    ]) {
      globalThis.document = { createElement: () => ({ children: [], append(child) { this.children.push(child); }, setAttribute() {} }) };
      const result = {
        children: [],
        querySelector(selector) { return selector === ".dice-total" ? {} : this.children.find(child => child.className === "banter-attack-buffs"); },
        append(child) { this.children.push(child); },
      };
      const root = { querySelectorAll: () => [{ querySelector: () => result }] };
      render(JSON.parse(JSON.stringify(savedMessage)), hook === "renderChatMessage" ? [root] : root);
      assert.equal(result.children.length, 1, "saved message should regain its badge row");
      assert.match(result.children[0].children[0].children[0].textContent, /Bless|Proficiency/);
    }
  }
  for (const callback of handlers.on.get("i18nInit") ?? []) {
    callback();
  }

  assert.deepEqual(settings.map(([scope, key]) => `${scope}.${key}`).sort(), [
    "banter-4e-modifications.enable-active-defense",
    "banter-4e-modifications.enable-debug-logging",
    "banter-4e-modifications.enable-compact-chat-rolls",
    "banter-4e-modifications.enable-opportunity-attack-chat-actions",
    "banter-4e-modifications.enable-trigger-prompts",
    "banter-4e-modifications.enable-targeting-warning",
  ].sort());
  const compactSetting = settings.find(([, key]) => key === 'enable-compact-chat-rolls')[2];
  assert.equal(compactSetting.scope, 'client');
  assert.equal(compactSetting.default, true);
  assert.equal(handlers.once.get("socketlib.ready")?.length, 1);
  assert.equal(handlers.on.get("dnd4e.rollAttack")?.length, 2);
  assert.equal(handlers.on.get("preCreateChatMessage")?.length, 2);
  assert.equal(handlers.on.get("renderChatMessageHTML")?.length, 5);
  assert.equal(handlers.on.get("renderChatMessage")?.length, 3);
  assert.equal(handlers.on.get("renderActorDirectory")?.length, 1);
  assert.equal(handlers.on.get("updateActor")?.length, 2);
  assert.equal(handlers.on.get("createActiveEffect")?.length ?? 0, 0);
  assert.equal(handlers.on.get("deleteCombat")?.length ?? 0, 0);
});


test("disabled Player Defense registers no interception or player-popup hooks", async () => {
  const handlers = new Map();
  globalThis.Hooks = { on(name, callback) {
    const list = handlers.get(name) ?? [];
    list.push(callback);
    handlers.set(name, list);
  }, once() {} };
  globalThis.game = { settings: { register() {}, get: () => false } };
  await import(`../scripts/main.js?disabled-defense=${Date.now()}`);
  for (const callback of handlers.get("i18nInit")) {
    callback();
  }
  assert.equal(handlers.has("dnd4e.rollAttack"), false);
  assert.equal(handlers.has("preCreateChatMessage"), false);
  assert.equal(handlers.get("renderChatMessageHTML").length, 2);
});
