import test from "node:test";
import assert from "node:assert/strict";
import { TriggerPromptAlerts } from "../scripts/modules/trigger-prompts/trigger-prompt-alerts.js";

test("power tooltips enrich actual rules without invoking power rolls, macros or use consumption", async () => {
  const calls = [];
  globalThis.foundry = {
    utils: { escapeHTML: value => value.replaceAll("<", "&lt;") },
    applications: { ux: { TextEditor: { implementation: { enrichHTML: async (html, options) => { calls.push(options); return html; } } } } },
  };
  const actor = { getRollData: () => ({ level: 5 }) };
  const item = { name: "Riposte <test>", system: { trigger: "An enemy misses you.", hit: { detail: "<p>Deal damage.</p>" } },
    roll() { assert.fail("hover must not roll"); } };
  const html = await TriggerPromptAlerts.powerDetails(item, actor);
  assert.match(html, /Riposte &lt;test>/);
  assert.match(html, /An enemy misses you/);
  assert.match(html, /<p>Deal damage.<\/p>/);
  assert.equal(calls[0].secrets, false);
  assert.equal(calls[0].relativeTo, item);
  assert.deepEqual(calls[0].rollData, { level: 5 });
});

test("non-recipients, used prompts and expired prompts never create an alert DOM", () => {
  globalThis.game = { user: { id: "player" } };
  const alerts = new TriggerPromptAlerts(() => assert.fail("no controls should bind"));
  const prompt = { recipientIds: ["player"], expiresAt: Date.now() + 10000 };
  alerts.show({ id: "plain", flags: {} });
  for (const extra of [{ recipientIds: [] }, { used: true }, { expiresAt: Date.now() - 1 }]) {
    alerts.show({ id: "prompt", flags: { triggerPrompts: { ...prompt, ...extra } } });
  }
});
