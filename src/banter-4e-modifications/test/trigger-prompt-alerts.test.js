import test from "node:test";
import assert from "node:assert/strict";
import { TriggerPromptAlerts } from "../scripts/modules/trigger-prompts/trigger-prompt-alerts.js";

test("multiple choices show only the hovered or focused option; a single choice keeps whole-prompt hover", async () => {
  const originalDocument = globalThis.document;
  const originalDetails = TriggerPromptAlerts.powerDetails;
  const node = () => ({
    dataset: {}, style: {}, children: [], listeners: {}, isConnected: true,
    setAttribute() {}, remove() {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    append(child) { this.children.push(child); },
  });
  const stack = node();
  const tooltip = node();
  const buttons = ["first", "second"].map(id => Object.assign(node(), { dataset: { itemId: id } }));
  let alert;
  globalThis.document = { getElementById: () => stack, createElement: () => {
    alert = node();
    alert.querySelector = selector => selector === "[role=tooltip]" ? tooltip : node();
    alert.querySelectorAll = () => buttons;
    return alert;
  } };
  globalThis.foundry = { utils: { escapeHTML: value => value } };
  const items = new Map(buttons.map(button => [button.dataset.itemId, { id: button.dataset.itemId, name: button.dataset.itemId }]));
  globalThis.game = { user: { id: "player" }, actors: new Map([["actor", { name: "Actor", items }]]) };
  const shown = [];
  TriggerPromptAlerts.powerDetails = async item => { shown.push(item.id); return item.name; };
  const alerts = new TriggerPromptAlerts(() => {});
  const prompt = { actorId: "actor", recipientIds: ["player"], expiresAt: Date.now() + 10000 };
  try {
    alerts.show({ id: "multi", flags: { triggerPrompts: { ...prompt, choices: buttons.map(button => ({ itemId: button.dataset.itemId })) } } });
    assert.equal(alert.listeners.mouseenter, undefined);
    assert.deepEqual(shown, []);
    await buttons[1].listeners.mouseenter();
    assert.deepEqual(shown, ["second"]);
    assert.equal(tooltip.hidden, false);
    alert.listeners.mouseover({ target: { closest: () => null } });
    assert.equal(tooltip.hidden, true);
    await buttons[0].listeners.focus();
    assert.deepEqual(shown, ["second", "first"]);
    alerts.remove("multi");
    alerts.show({ id: "single", flags: { triggerPrompts: { ...prompt, itemId: "first" } } });
    await alert.listeners.mouseenter();
    assert.deepEqual(shown, ["second", "first", "first"]);
  } finally {
    alerts.remove("multi");
    alerts.remove("single");
    TriggerPromptAlerts.powerDetails = originalDetails;
    globalThis.document = originalDocument;
  }
});

test("automatic alerts render disabled checkmarked use buttons while optional choices stay actionable", () => {
  const originalDocument = globalThis.document;
  const node = () => ({
    dataset: {}, style: {}, children: [],
    setAttribute() {}, addEventListener() {}, remove() {},
    append(child) { this.children.push(child); },
    querySelector() { return node(); }, querySelectorAll() { return []; },
  });
  const stack = node();
  globalThis.document = { getElementById: () => stack, createElement: node };
  globalThis.foundry = { utils: { escapeHTML: value => value.replaceAll("<", "&lt;") } };
  const item = { id: "resilience", name: "Orc <Resilience>" };
  globalThis.game = { user: { id: "player" }, actors: new Map([["actor", { name: "Orc", items: new Map([[item.id, item]]) }]]) };
  let bindings = 0;
  const alerts = new TriggerPromptAlerts(() => bindings++);
  try {
    for (const automatic of [true, false]) {
      const id = String(automatic);
      alerts.show({ id, flags: { triggerPrompts: {
        automatic, actorId: "actor", itemId: item.id, recipientIds: ["player"], expiresAt: Date.now() + 6000,
      } } });
      const html = stack.children.at(-1).innerHTML;
      if (automatic) {
        assert.match(html, /<button type="button" disabled data-item-id="resilience"/);
        assert.match(html, /aria-label="Orc &lt;Resilience>: Already used"/);
        assert.match(html, /fa-check" aria-hidden="true"><\/i> Orc &lt;Resilience>/);
        assert.doesNotMatch(html, /data-trigger-prompt-action="use"/);
        assert.match(html, /data-dismiss-automatic/);
      } else {
        assert.match(html, /data-trigger-prompt-action="use"/);
        assert.doesNotMatch(html, /disabled|fa-check/);
      }
      alerts.remove(id);
    }
    assert.equal(bindings, 1);
  } finally {
    alerts.remove("true");
    alerts.remove("false");
    globalThis.document = originalDocument;
  }
});

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

test("active Info Displays uses the HUD power renderer and its rules layout", async () => {
  globalThis.game = { modules: new Map([["dnd4e-health-display", { active: true }]]), i18n: { localize: key => key } };
  globalThis.CONFIG = { DND4E: {} };
  globalThis.foundry = {
    utils: { escapeHTML: value => value },
    applications: { ux: { TextEditor: { implementation: { enrichHTML: async html => html } } } },
  };
  const actor = { getRollData: () => ({}) };
  const item = { name: "Riposte", type: "power", system: {
    autoGenChatPowerCard: true, trigger: "An enemy misses.",
    rangeType: "melee", rangePower: 1, hit: { detail: "Deal damage." },
    effect: { detail: "Shift 1." }, postEffect: true,
  }, roll() { assert.fail("preview must not roll"); } };
  const html = await TriggerPromptAlerts.powerDetails(item, actor);
  const { generatePowerTooltip } = await import("../../dnd4e-health-display/scripts/actor-display/actor-display-tooltips.js");
  assert.equal(html, `${TriggerPromptAlerts.powerHeader(item)}<div class="dnd4e-info-tooltip">${await generatePowerTooltip(actor, item)}</div>`);
  assert.ok(html.indexOf('class="hit"') < html.indexOf('class="effect"'));
  globalThis.dnd4e = { compatibility: { tah: { TokenBarHooks: { generateItemTooltip: async () => '<div class="item-card">Authored rules</div>' } } } };
  item.system.autoGenChatPowerCard = false;
  assert.match(await TriggerPromptAlerts.powerDetails(item, actor), /item-card.*Authored rules/);
});


test("trigger tooltip headers share chat classes, range icons and readable usage badges", () => {
  for (const [useType, label] of [["atwill", "At-Will"], ["encounter", "Encounter"], ["daily", "Daily"], ["unknown", "Power"]]) {
    const html = TriggerPromptAlerts.powerHeader({ name: "Reactive Surge", system: { useType, rangeType: "personal" } });
    assert.match(html, /banter-power__header/);
    assert.match(html, /fa-user/);
    assert.ok(html.includes(`banter-power__usage">${label}</div>`));
    assert.ok(html.includes(`banter-power--${useType === "unknown" ? "other" : useType}`));
  }
  assert.match(TriggerPromptAlerts.powerHeader({ name: "Feat", type: "feat" }), /banter-power__usage">Feat/);
});
