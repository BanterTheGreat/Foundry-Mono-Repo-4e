import test from "node:test";
import assert from "node:assert/strict";

test("warns non-GM users before an untargeted attack roll", async () => {
  const notifications = [];
  class Item4e {
    async rollAttack() {
      return "rolled";
    }
  }

  globalThis.CONFIG = { Item: { documentClass: Item4e } };
  let enabled = true;
  globalThis.game = { settings: { get: () => enabled }, user: { isGM: false, targets: new Set() } };
  globalThis.ui = { notifications: { warn: (message) => notifications.push(message) } };

  const { TargetingWarning } = await import(`../scripts/modules/targeting-warning/targeting-warning.js?test=${Date.now()}`);
  TargetingWarning.install();

  assert.equal(await new Item4e().rollAttack(), "rolled");
  assert.deepEqual(notifications, ["Choose a target before rolling an attack."]);

  enabled = false;
  assert.equal(await new Item4e().rollAttack(), "rolled");
  assert.equal(notifications.length, 1);
});

test("does not warn GMs or players with targets", async () => {
  const notifications = [];
  class Item4e {
    async rollAttack() {
      return "rolled";
    }
  }

  globalThis.CONFIG = { Item: { documentClass: Item4e } };
  globalThis.game = { settings: { get: () => true }, user: { isGM: true, targets: new Set() } };
  globalThis.ui = { notifications: { warn: (message) => notifications.push(message) } };

  const { TargetingWarning } = await import(`../scripts/modules/targeting-warning/targeting-warning.js?test=${Date.now()}`);
  TargetingWarning.install();
  await new Item4e().rollAttack();

  globalThis.game.user = { isGM: false, targets: new Set([{}]) };
  await new Item4e().rollAttack();

  assert.deepEqual(notifications, []);
});
