import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { TriggerPromptChat } from "../scripts/modules/trigger-prompts/trigger-prompt-chat.js";
import { TRIGGER_PROMPT_ACTION, TRIGGER_PROMPT_FLAG, TRIGGER_PROMPT_TIMEOUT_MS, TRIGGER_PROMPT_UI, TRIGGER_SOCKET_ACTION } from "../scripts/modules/trigger-prompts/constants.js";

const NOW = 1_000_000;
const USE = `[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.USE}']`;
const DISMISS = `[data-trigger-prompt-action='${TRIGGER_PROMPT_ACTION.DISMISS}']`;

/** A rendered chat card: use buttons, a dismiss button, and a class list. */
function createCard(itemIds = ["reaction"]) {
  const listeners = new Map();
  const makeButton = (action, itemId) => ({
    action, dataset: itemId ? { itemId } : {}, removed: false, textContent: "",
    addEventListener(event, callback) { listeners.set(`${action}:${itemId ?? ""}`, callback); },
    remove() { this.removed = true; },
  });
  const buttons = [...itemIds.map(itemId => makeButton(TRIGGER_PROMPT_ACTION.USE, itemId)), makeButton(TRIGGER_PROMPT_ACTION.DISMISS)];
  const classes = new Set();
  return {
    buttons, classes, listeners,
    classList: { add: name => classes.add(name) },
    querySelectorAll: selector => selector === "[data-trigger-prompt-action]" ? buttons : buttons.filter(button => selector === (button.action === TRIGGER_PROMPT_ACTION.USE ? USE : DISMISS)),
    querySelector: selector => buttons.find(button => selector === DISMISS && button.action === TRIGGER_PROMPT_ACTION.DISMISS) ?? null,
    click: (action, itemId) => listeners.get(`${action}:${itemId ?? ""}`)({ preventDefault() {}, currentTarget: { dataset: itemId ? { itemId } : {} } }),
  };
}

/** A prompt message whose flag holds the given prompt state; update and delete are recorded. */
function createMessage(id, prompt, author = { id: "gm", active: true }) {
  const message = {
    id, author, deleted: false,
    flags: { [TRIGGER_PROMPT_FLAG]: { choices: [{ itemId: "reaction" }], recipientIds: ["player"], used: false, expiresAt: NOW + TRIGGER_PROMPT_TIMEOUT_MS, ...prompt } },
    async update(changes) {
      // A real update only changes the document after the server round trip.
      await new Promise(resolve => setImmediate(resolve));
      for (const [path, value] of Object.entries(changes)) {
        const [, flagName, field] = path.split(".");
        this.flags[flagName][field] = value;
      }
    },
    async delete() { this.deleted = true; },
  };
  return message;
}

function setUp({ user = { id: "player", isGM: false }, users = [], messages = [], socket = {} } = {}) {
  mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: NOW });
  globalThis.game = { user, users, messages: new Map(messages.map(message => [message.id, message])), settings: { settings: new Map() }, actors: new Map() };
  globalThis.ui = { notifications: { warn() {} } };
  const chat = new TriggerPromptChat(socket);
  // Floating DOM is covered separately; these tests exercise shared claim/chat behavior.
  chat.alerts = { show() {}, remove() {} };
  return chat;
}

test.afterEach(() => mock.timers.reset());

test("opportunity prompts store one actor ticket for all choices and require it on claim", async () => {
  const chat = setUp();
  const created = [];
  const operations = [];
  const opportunityTicket = { scope: "combat:1:enemy", sourceKey: "scene:enemy", combatId: "combat" };
  const item = { id: "strike", name: "Strike" };
  const actor = { id: "hero", items: new Map([[item.id, item]]) };
  game.actors.set(actor.id, actor);
  globalThis.foundry = { utils: { escapeHTML: String } };
  globalThis.ChatMessage = { create: async data => { created.push(data); return { id: "offer" }; } };
  chat.limits.request = async (power, operation, ticket) => {
    operations.push({ operation, ticket });
    if (operation === "offer") {
      return { unrestricted: true };
    }
    return operation === "opportunityOffer" ? opportunityTicket : true;
  };
  await chat.createPromptCard({ trigger: { id: "opportunity-attack", label: "Opportunity attack" }, actor,
    assignments: [{ id: "choice", item, itemId: item.id }], context: { detail: "Enemy moved", ...opportunityTicket }, recipientIds: ["player"] });
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].flags.triggerPrompts.opportunityTicket, opportunityTicket);
  const message = createMessage("offer", { ...created[0].flags.triggerPrompts });
  game.messages.set(message.id, message);
  assert.ok(await chat.claimPrompt(message.id, item.id));
  assert.deepEqual(operations.map(entry => entry.operation), ["offer", "opportunityOffer", "opportunityClaim"]);
  assert.equal(operations.at(-1).ticket.sourceKey, "scene:enemy");
  assert.equal(await chat.claimPrompt(message.id, item.id), null);
});

test("selecting a prompted power enables DnD4e use consumption", async () => {
  const usePowerCalls = [];
  const item = { id: "reaction", type: "power", roll: async () => {} };
  const actor = { items: new Map([[item.id, item]]), usePower: async (...args) => usePowerCalls.push(args) };
  const socket = {
    executeAsUser: async (action, userId) => {
      assert.equal(action, TRIGGER_SOCKET_ACTION.CLAIM_PROMPT);
      assert.equal(userId, "gm");
      return { actorId: "hero", itemId: item.id };
    },
  };
  const promptChat = setUp({ socket });
  globalThis.game.actors.set("hero", actor);
  const card = createCard();

  promptChat.bindPromptCard(createMessage("prompt", {}), card);
  await card.click(TRIGGER_PROMPT_ACTION.USE, "reaction");

  assert.deepEqual(usePowerCalls, [[item, { configureDialog: true }]]);
});

test("selecting a prompted feat only posts it to chat, without rolling or using a power", async () => {
  let posted = 0;
  const item = { id: "reaction", type: "feature", toChat: async () => { posted += 1; }, roll: () => assert.fail("must not roll") };
  const promptChat = setUp({ socket: { executeAsUser: async () => ({ actorId: "hero", itemId: item.id }) } });
  game.actors.set("hero", { items: new Map([[item.id, item]]), usePower: () => assert.fail("must not usePower") });
  game.modules = new Map([["dnd4e-health-display", { powerActivation: { useAbility: () => assert.fail("must not automate") } }]]);
  const card = createCard();
  promptChat.bindPromptCard(createMessage("prompt", {}), card);
  await card.click(TRIGGER_PROMPT_ACTION.USE, item.id);
  assert.equal(posted, 1);
});

test("a recipient who is the prompt's author claims it locally without the socket", async () => {
  const promptChat = setUp({ user: { id: "gm", isGM: true }, socket: { executeAsUser() { assert.fail("no socket hop expected"); } } });
  const message = createMessage("prompt", { recipientIds: ["gm"] }, { id: "gm", active: true });
  globalThis.game.messages.set(message.id, message);
  const item = { id: "reaction", type: "power", roll: async () => {} };
  globalThis.game.actors.set("hero", { items: new Map([[item.id, item]]), usePower: async () => {} });
  message.flags[TRIGGER_PROMPT_FLAG].actorId = "hero";
  const card = createCard();

  promptChat.bindPromptCard(message, card);
  await card.click(TRIGGER_PROMPT_ACTION.USE, "reaction");

  assert.equal(message.flags[TRIGGER_PROMPT_FLAG].used, true);
});

for (const handled of [true, false]) {
  test(`prompted powers try Target Automation and ${handled ? "skip" : "use"} native fallback`, async () => {
    const calls = [];
    const other = { id: "other" };
    const controlled = { id: "controlled", controlled: true };
    const item = { id: "reaction", type: "power", roll: async () => {} };
    const actor = {
      items: new Map([[item.id, item]]),
      getActiveTokens: () => [other, controlled],
      usePower: async (...args) => calls.push(["native", ...args]),
    };
    const promptChat = setUp({ socket: { executeAsUser: async () => ({ actorId: "hero", itemId: item.id }) } });
    game.actors.set("hero", actor);
    game.modules = new Map([["dnd4e-health-display", { powerActivation: {
      useAbility: async (...args) => { calls.push(["automation", ...args]); return handled; },
    } }]]);
    const card = createCard();
    promptChat.bindPromptCard(createMessage("prompt", {}), card);
    await card.click(TRIGGER_PROMPT_ACTION.USE, item.id);
    assert.deepEqual(calls, handled
      ? [["automation", item, controlled]]
      : [["automation", item, controlled], ["native", item, { configureDialog: true }]]);
  });
}

test("prompted synthetic actors pass their own token to Target Automation", async () => {
  const token = { id: "synthetic" };
  const item = { id: "reaction", type: "power", roll: async () => {} };
  const actor = { token: { object: token }, items: new Map([[item.id, item]]), usePower: async () => assert.fail("handled") };
  const promptChat = setUp({ socket: { executeAsUser: async () => ({ actorId: "hero", itemId: item.id }) } });
  game.actors.set("hero", actor);
  game.modules = new Map([["dnd4e-health-display", { powerActivation: {
    useAbility: async (power, source) => { assert.equal(power, item); assert.equal(source, token); return true; },
  } }]]);
  const card = createCard();
  promptChat.bindPromptCard(createMessage("prompt", {}), card);
  await card.click(TRIGGER_PROMPT_ACTION.USE, item.id);
});

test("a claim goes to a connected GM when the prompt's author has left", async () => {
  const calls = [];
  const promptChat = setUp({
    users: [{ id: "gm", active: true, isGM: true }],
    socket: { executeAsUser: async (...args) => { calls.push(args); return null; } },
  });
  const card = createCard();

  promptChat.bindPromptCard(createMessage("prompt", {}, { id: "left", active: false }), card);
  await card.click(TRIGGER_PROMPT_ACTION.USE, "reaction");

  assert.deepEqual(calls, [[TRIGGER_SOCKET_ACTION.CLAIM_PROMPT, "gm", "prompt", "reaction"]]);
});

test("a dismissal is routed to the author", async () => {
  const calls = [];
  const promptChat = setUp({ socket: { executeAsUser: async (...args) => { calls.push(args); return true; } } });
  const card = createCard();
  promptChat.bindPromptCard(createMessage("prompt", {}), card);

  await card.click(TRIGGER_PROMPT_ACTION.DISMISS);

  assert.deepEqual(calls, [[TRIGGER_SOCKET_ACTION.DISMISS_PROMPT, "gm", "prompt"]]);
});

test("a claim with nobody connected to keep the prompt does nothing", async () => {
  const promptChat = setUp({ socket: { executeAsUser() { assert.fail("nobody to ask"); } } });
  const card = createCard();
  promptChat.bindPromptCard(createMessage("orphan", {}, { id: "left", active: false }), card);

  await card.click(TRIGGER_PROMPT_ACTION.USE, "reaction");
});

test("a client that did not receive a private prompt hides the card and binds nothing", () => {
  const promptChat = setUp({ user: { id: "other-player", isGM: false } });
  const card = createCard();

  promptChat.bindPromptCard(createMessage("prompt", {}), card);

  assert.ok(card.classes.has(TRIGGER_PROMPT_UI.PROMPT_HIDDEN_CLASS));
  assert.equal(card.listeners.size, 0);
});

test("a message that is not a prompt is left alone", () => {
  const promptChat = setUp();
  const card = createCard();

  promptChat.bindPromptCard({ id: "plain", flags: {} }, card);

  assert.equal(card.classes.size, 0);
  assert.equal(card.listeners.size, 0);
});

test("a recipient's trigger message is hidden in chat while its floating alert is shown", () => {
  const promptChat = setUp();
  const shown = [];
  promptChat.alerts.show = message => shown.push(message.id);
  const card = createCard();
  promptChat.bindPromptCard(createMessage("private-record", {}), card);
  assert.ok(card.classes.has(TRIGGER_PROMPT_UI.PROMPT_HIDDEN_CLASS));
  assert.deepEqual(shown, ["private-record"]);
});

test("a used prompt has its controls removed", () => {
  const promptChat = setUp();
  const card = createCard();

  promptChat.bindPromptCard(createMessage("prompt", { used: true }), card);

  assert.ok(card.buttons.every(button => button.removed));
});

test("a prompt past its stored deadline loses its controls when rendered, with no timer involved", () => {
  const promptChat = setUp();
  const card = createCard();

  promptChat.bindPromptCard(createMessage("prompt", { expiresAt: NOW - 1 }), card);

  assert.ok(card.buttons.every(button => button.removed));
  assert.equal(card.listeners.size, 0);
});

test("the Ignore button counts down and the controls go when the time runs out", () => {
  const promptChat = setUp();
  const card = createCard();
  const dismiss = card.buttons.at(-1);

  promptChat.bindPromptCard(createMessage("prompt", {}), card);
  assert.equal(dismiss.textContent, "Ignore (25)");
  mock.timers.tick(4000);
  assert.equal(dismiss.textContent, "Ignore (21)");
  assert.ok(card.buttons.every(button => !button.removed));
  mock.timers.tick(6000);
  assert.ok(card.buttons.every(button => !button.removed), "the prompt remains usable after 10 seconds");
  mock.timers.tick(10000);
  assert.ok(card.buttons.every(button => !button.removed), "the prompt remains usable after 20 seconds");
  mock.timers.tick(5000);

  assert.ok(card.buttons.every(button => button.removed));
});

test("a claim marks the prompt used exactly once", async () => {
  const promptChat = setUp();
  const message = createMessage("prompt", {});
  globalThis.game.messages.set(message.id, message);

  const first = await promptChat.claimPrompt("prompt", "reaction");
  const second = await promptChat.claimPrompt("prompt", "reaction");

  assert.equal(first.itemId, "reaction");
  assert.equal(second, null);
  assert.equal(message.flags[TRIGGER_PROMPT_FLAG].used, true);
});

test("a floating alert cannot claim after its deadline even if browser cleanup was delayed", async () => {
  const promptChat = setUp({ socket: { executeAsUser() { assert.fail("expired controls must not claim"); } } });
  const card = createCard();
  promptChat.bindPromptCard(createMessage("prompt", {}), card, false);
  mock.timers.tick(TRIGGER_PROMPT_TIMEOUT_MS);
  await card.click(TRIGGER_PROMPT_ACTION.USE, "reaction");
});

test("two recipients answering at once produce one winner", async () => {
  const promptChat = setUp();
  const message = createMessage("prompt", { choices: [{ itemId: "a" }, { itemId: "b" }] });
  globalThis.game.messages.set(message.id, message);

  const results = await Promise.all([promptChat.claimPrompt("prompt", "a"), promptChat.claimPrompt("prompt", "b")]);

  assert.deepEqual(results.map(result => result?.itemId ?? null), ["a", null]);
});

test("a claim for an item the prompt never offered is refused", async () => {
  const promptChat = setUp();
  const message = createMessage("prompt", {});
  globalThis.game.messages.set(message.id, message);

  assert.equal(await promptChat.claimPrompt("prompt", "something-else"), null);
  assert.equal(message.flags[TRIGGER_PROMPT_FLAG].used, false);
  assert.equal(await promptChat.claimPrompt("missing", "reaction"), null);
});

test("a claim is honored just after the deadline but refused once the grace has passed", async () => {
  const promptChat = setUp();
  const message = createMessage("prompt", { expiresAt: NOW - 500 });
  const late = createMessage("late", { expiresAt: NOW - 5000 });
  globalThis.game.messages.set(message.id, message);
  globalThis.game.messages.set(late.id, late);

  assert.notEqual(await promptChat.claimPrompt("prompt", "reaction"), null);
  assert.equal(await promptChat.claimPrompt("late", "reaction"), null);
});

test("dismissing deletes an unclaimed prompt but never a claimed one", async () => {
  const promptChat = setUp();
  const open = createMessage("open", {});
  const claimed = createMessage("claimed", { used: true });
  globalThis.game.messages.set(open.id, open);
  globalThis.game.messages.set(claimed.id, claimed);

  assert.equal(await promptChat.dismissPrompt("open"), true);
  assert.equal(await promptChat.dismissPrompt("claimed"), false);
  assert.equal(open.deleted, true);
  assert.equal(claimed.deleted, false);
});

test("expiry deletes only an unclaimed prompt past its deadline", async () => {
  const promptChat = setUp();
  const expired = createMessage("expired", { expiresAt: NOW - 5000 });
  const fresh = createMessage("fresh", {});
  const claimed = createMessage("claimed", { used: true, expiresAt: NOW - 5000 });
  for (const message of [expired, fresh, claimed]) {
    globalThis.game.messages.set(message.id, message);
  }

  assert.equal(await promptChat.expirePrompt("expired"), true);
  assert.equal(await promptChat.expirePrompt("fresh"), false);
  assert.equal(await promptChat.expirePrompt("claimed"), false);
  assert.deepEqual([expired.deleted, fresh.deleted, claimed.deleted], [true, false, false]);
});

test("a client sweeps its own expired prompts, and a GM also sweeps those whose author left", async () => {
  const promptChat = setUp({ user: { id: "gm", isGM: true } });
  const own = createMessage("own", { expiresAt: NOW - 5000 }, { id: "gm", active: true });
  const abandoned = createMessage("abandoned", { expiresAt: NOW - 5000 }, { id: "left", active: false });
  const present = createMessage("present", { expiresAt: NOW - 5000 }, { id: "player", active: true });
  const live = createMessage("live", {}, { id: "gm", active: true });
  for (const message of [own, abandoned, present, live]) {
    globalThis.game.messages.set(message.id, message);
  }

  await promptChat.sweepExpiredPrompts();

  assert.deepEqual([own.deleted, abandoned.deleted, present.deleted, live.deleted], [true, true, false, false]);
});

test("a player does not sweep prompts authored by someone else", async () => {
  const promptChat = setUp({ user: { id: "player", isGM: false } });
  const abandoned = createMessage("abandoned", { expiresAt: NOW - 5000 }, { id: "left", active: false });
  globalThis.game.messages.set(abandoned.id, abandoned);

  await promptChat.sweepExpiredPrompts();

  assert.equal(abandoned.deleted, false);
});

test("creating a prompt stores a deadline, the recipients, and the actor, and schedules cleanup on the author", async () => {
  const promptChat = setUp({ user: { id: "gm", isGM: true } });
  const created = [];
  globalThis.foundry = { utils: { escapeHTML: text => String(text).replace(/</g, "&lt;") } };
  globalThis.ChatMessage = { create: async data => { created.push(data); return { id: "new-prompt" }; } };
  globalThis.game.messages.set("new-prompt", createMessage("new-prompt", { expiresAt: NOW + TRIGGER_PROMPT_TIMEOUT_MS }, { id: "gm", active: true }));

  await promptChat.createPromptCard({
    trigger: { id: "enemy-hits-you", label: "Enemy hits you" },
    actor: { id: "hero", uuid: "Actor.hero" },
    assignments: [{ id: "a", item: { id: "reaction", name: "Riposte <b>" } }],
    context: { detail: "Badger hit Rogal." },
    recipientIds: ["player", "gm"],
  });

  assert.deepEqual(created[0].whisper, ["player", "gm"]);
  const flag = created[0].flags[TRIGGER_PROMPT_FLAG];
  assert.equal(flag.expiresAt, NOW + TRIGGER_PROMPT_TIMEOUT_MS);
  assert.equal(flag.actorUuid, "Actor.hero");
  assert.equal(flag.label, "Enemy hits you");
  assert.equal(flag.detail, "Badger hit Rogal.");
  assert.deepEqual(flag.choices, [{ assignmentId: "a", itemId: "reaction" }]);
  assert.match(created[0].content, /Riposte &lt;b>/);
  // The author's cleanup timer is housekeeping: it deletes the prompt only after the deadline.
  mock.timers.tick(TRIGGER_PROMPT_TIMEOUT_MS + 2000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(globalThis.game.messages.get("new-prompt").deleted, true);
});

test("a limited prompt's visible deadline cannot outlast its item reservation", async () => {
  const promptChat = setUp();
  const created = [];
  globalThis.foundry = { utils: { escapeHTML: text => String(text) } };
  globalThis.ChatMessage = { create: async data => { created.push(data); return { id: "limited" }; } };
  promptChat.limits.request = async () => ({ id: "ticket", limit: "turn", scope: "turn", expiresAt: NOW + 18000 });
  await promptChat.createPromptCard({
    trigger: { id: "enemy-hits-you", label: "Enemy hits you" }, actor: { id: "hero" },
    assignments: [{ id: "a", item: { id: "feat", name: "Limited feat" } }],
    context: { detail: "Hit" }, recipientIds: ["player"],
  });
  assert.equal(created[0].flags[TRIGGER_PROMPT_FLAG].expiresAt, NOW + 18000);
  assert.equal(created[0].flags[TRIGGER_PROMPT_FLAG].choices[0].limitTicket.id, "ticket");
});

// Automatic benefits share detection and allowances, but never require activation.
test("automatic benefits post publicly, spend on trigger and leave optional choices private", async () => {
  const chat = setUp({ users: [{ id: 'gm', isGM: true }, { id: 'player', isGM: false, active: true }] });
  const { ItemTriggerAssignments } = await import('../scripts/modules/trigger-prompts/item-trigger-assignments.js');
  const { TriggerPromptAlerts } = await import('../scripts/modules/trigger-prompts/trigger-prompt-alerts.js');
  const automatic = { id: 'mandatory', name: 'Mandatory benefit', flags: {} };
  await ItemTriggerAssignments.write({ ...automatic, setFlag: async (module, key, value) => { automatic.flags[module] = { [key]: value }; } }, [], 'turn', true);
  const optional = { id: 'optional', name: 'Optional response' };
  const messages = [], operations = [];
  globalThis.foundry = { utils: { escapeHTML: text => text.replaceAll('<', '&lt;') } };
  globalThis.ChatMessage = { create: async data => { messages.push(data); return { id: String(messages.length) }; } };
  mock.method(TriggerPromptAlerts, 'powerDetails', async () => '<p>Gain the benefit.</p>');
  chat.limits.request = async (item, operation) => {
    operations.push([item.id, operation]);
    return operation === 'offer' ? { id: item.id, expiresAt: NOW + 20000 } : true;
  };
  await chat.createPromptCard({ trigger: { id: 'test', label: 'Enemy drops' }, actor: { id: 'hero', name: 'Hero <test>', testUserPermission: user => user.id === 'player' }, assignments: [{ item: automatic }, { item: automatic }, { item: optional }], context: { detail: 'Enemy dropped.' }, recipientIds: ['player', 'gm'] });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0].whisper, []);
  assert.match(messages[0].content, /Hero &lt;test>.*Enemy dropped/);
  assert.match(messages[0].content, /Gain the benefit/);
  assert.equal(messages[0].flags[TRIGGER_PROMPT_FLAG].automatic, true);
  assert.doesNotMatch(messages[0].content, /data-trigger-prompt-action/);
  assert.deepEqual(messages[1].whisper, ['player']);
  assert.deepEqual(messages[1].flags[TRIGGER_PROMPT_FLAG].choices.map(c => c.itemId), ['optional']);
  assert.deepEqual(operations, [['mandatory', 'offer'], ['mandatory', 'claim'], ['optional', 'offer']]);
  mock.restoreAll();
});

test("automatic announcements remain visible and cannot be claimed, dismissed or expired", async () => {
  const message = createMessage('automatic', { automatic: true, expiresAt: NOW - 10000 });
  const chat = setUp({ messages: [message] });
  const card = createCard();
  chat.bindPromptCard(message, card);
  assert.equal(card.classes.has(TRIGGER_PROMPT_UI.PROMPT_HIDDEN_CLASS), false);
  assert.equal(card.listeners.size, 0);
  assert.equal(await chat.claimPrompt(message.id, 'reaction'), null);
  assert.equal(await chat.dismissPrompt(message.id), false);
  assert.equal(await chat.expirePrompt(message.id), false);
  await chat.sweepExpiredPrompts();
  assert.equal(message.deleted, false);
});

test("an exhausted automatic benefit creates neither a public post nor a prompt", async () => {
  const chat = setUp();
  chat.limits.request = async () => null;
  globalThis.ChatMessage = { create: () => assert.fail('must not post') };
  await chat.createPromptCard({ trigger: {}, actor: {}, assignments: [{ item: { id: 'spent' } }], context: {}, recipientIds: ['player'] });
});

for (const type of ['feat', 'feature']) {
  test(`automatic ${type} announcements use the native item card rendering contract`, async () => {
    const chat = setUp();
    const messages = [], renders = [];
    const item = {
      id: 'feat', name: 'Orc Resilience', type, labels: { feat: 'Feat' },
      flags: { 'banter-4e-modifications': { 'trigger-prompts': { automatic: true } } },
      getChatData: async () => ({ description: { value: 'Gain 5 temporary HP.' } }),
      roll: () => assert.fail('must not activate the item again'),
      toChat: () => assert.fail('must not post a second message'),
    };
    const actor = { id: 'hero', name: 'Hero', token: { uuid: 'Scene.test.Token.hero' } };
    globalThis.foundry = {
      utils: { escapeHTML: text => text },
      applications: { handlebars: { renderTemplate: async (template, data) => {
        renders.push({ template, data });
        return '<div class="dnd4e chat-card ability-usage--"><img src="feat.webp">Native feat rules</div>';
      } } },
    };
    globalThis.ChatMessage = { create: async data => { messages.push(data); return { id: 'native' }; } };
    chat.limits.request = async () => ({ unrestricted: true });
    await chat.createPromptCard({ trigger: { id: 'bloodied', label: 'Bloodied' }, actor,
      assignments: [{ item }], context: { detail: 'Hero became bloodied.' }, recipientIds: ['player'] });
    assert.equal(renders.length, 1);
    assert.equal(renders[0].template, 'systems/dnd4e/templates/chat/item-card.hbs');
    assert.equal(renders[0].data.item, item);
    assert.equal(renders[0].data.actor, actor);
    assert.equal(renders[0].data.tokenId, actor.token.uuid);
    assert.equal(renders[0].data.isRoll, false);
    assert.equal(renders[0].data.isPower, false);
    assert.deepEqual(renders[0].data.system, await item.getChatData());
    assert.equal(messages.length, 1);
    assert.match(messages[0].content, /Hero became bloodied.*dnd4e chat-card ability-usage--other/);
    assert.match(messages[0].content, /feat.webp.*Native feat rules/);
    assert.deepEqual(messages[0].whisper, []);
    assert.equal(messages[0].flags.core.canPopout, true);
    assert.equal(messages[0].flags[TRIGGER_PROMPT_FLAG].automatic, true);
  });
}

for (const online of [true, false]) {
  test(`player response prompts route to the player when online and fall back to GMs when offline (online=${online})`, async () => {
    const chat = setUp({ users: [{ id: "gm", isGM: true, active: true }, { id: "player", isGM: false, active: online }] });
    const created = [];
    globalThis.foundry = { utils: { escapeHTML: String } };
    globalThis.ChatMessage = { create: async data => { created.push(data); return { id: "new" }; } };
    chat.limits.request = async () => ({ unrestricted: true });
    await chat.createPromptCard({
      trigger: { id: "test", label: "Test" },
      actor: { id: "hero", testUserPermission: user => user.id === "player" },
      assignments: [{ item: { id: "reaction", name: "Reaction" } }],
      context: { detail: "Hit" }, recipientIds: online ? ["gm", "player"] : ["gm"],
    });
    assert.equal(created.length, 1);
    const expectedRecipients = online ? ["player"] : ["gm"];
    assert.deepEqual(created[0].whisper, expectedRecipients);
    assert.deepEqual(created[0].flags[TRIGGER_PROMPT_FLAG].recipientIds, expectedRecipients);
  });
}
