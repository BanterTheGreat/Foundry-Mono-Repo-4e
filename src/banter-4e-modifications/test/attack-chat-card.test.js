import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatRolls } from '../scripts/modules/chat-rolls/chat-rolls.js';
import { AttackChatCard } from '../scripts/modules/chat-rolls/attack-chat-card.js';

const message = { speaker: { alias: 'Aric' }, rolls: [
  { options: { banterAttackSource: { itemUuid: 'Actor.aric.Item.power', itemName: 'Sweeping Strike' },
    multirollData: { targetID: 'one', target: 'Enforcer', def: 'ac' } } },
  { options: { multirollData: { targetID: 'two', target: 'Lookout', def: 'ac' } } },
  { options: { multirollData: { targetID: 'three', target: 'Captain', def: 'ac' } } },
] };

test('multi-target presentation counts stored targets and never exposes defense values', () => {
  assert.deepEqual(AttackChatCard.describe(message), {
    speaker: 'Aric', power: 'Sweeping Strike', targets: 3, defense: 'AC',
  });
  const duplicate = { ...message, rolls: [...message.rolls, message.rolls[0]] };
  assert.equal(AttackChatCard.describe(duplicate).targets, 3);
});

test('one click rolls the original power once for all foes and permits later rolls', async () => {
  const calls = [];
  const event = { shiftKey: false };
  globalThis.game = { user: { isGM: false } };
  globalThis.fromUuid = async uuid => {
    assert.equal(uuid, 'Actor.aric.Item.power');
    return { actor: { isOwner: true }, rollDamage: async options => { calls.push(options); } };
  };
  await AttackChatCard.rollDamage(message, event);
  assert.deepEqual(calls, [{ event }]);
  await AttackChatCard.rollDamage(message, event);
  assert.equal(calls.length, 2);
});

test('deleted powers and lost ownership prevent damage rolls', async () => {
  const warnings = [];
  globalThis.ui = { notifications: { warn: text => warnings.push(text) } };
  globalThis.fromUuid = async () => null;
  await AttackChatCard.rollDamage(message, {});
  globalThis.fromUuid = async () => ({ actor: { isOwner: false }, rollDamage() { assert.fail('Unauthorized roll'); } });
  await AttackChatCard.rollDamage(message, {});
  assert.equal(warnings.length, 2);
});

test('older messages resolve item IDs through the original speaker actor', async () => {
  const item = {};
  globalThis.ChatMessage = { getSpeakerActor: speaker => {
    assert.equal(speaker.actor, 'original');
    return { items: new Map([['power', item]]) };
  } };
  assert.equal(await AttackChatCard.findItem({ speaker: { actor: 'original' }, rolls: [{}],
    flags: { dnd4e: { roll: { itemId: 'power' } } } }), item);
});

test('multi-target cards receive only one shared action and retain every disclosure', () => {
  function element(tag, className, textContent) {
    return { tag, className, textContent, children: [], handlers: {},
      append(...nodes) { this.children.push(...nodes); },
      addEventListener(name, handler) { this.handlers[name] = handler; } };
  }
  let group;
  const cards = message.rolls.map(() => {
    const sentence = {};
    return { before(node) { group = node; }, querySelector(selector) {
      return selector === '.banter-roll__sentence' ? sentence : null;
    } };
  });
  const root = { querySelectorAll: () => cards, querySelector: () => null };
  AttackChatCard.render(message, root, element);
  assert.deepEqual(group.children.slice(1, 4), cards);
  const header = group.children[0];
  assert.deepEqual(header.children[0].children.map(node => node.textContent), ['⌖  ATTACK', 'Sweeping Strike']);
  assert.equal(header.children.length, 1);
  assert.deepEqual(group.children.at(-1).children.map(node => node.textContent), ['3 targets · vs. AC', 'Roll Damage']);
  assert.deepEqual(cards.map(card => card.querySelector('.banter-roll__sentence').textContent),
    ['vs. Enforcer', 'vs. Lookout', 'vs. Captain']);
});


test('one attack card counts both attack and defense rows under the same power', () => {
  const mixed = { ...message, flags: { playerDefense: { attackName: 'Handaxe', targets: [
    { tokenId: 'hero', actorName: 'Hero', defenseStat: 'AC', resolved: true, total: 26, outcome: 'miss' },
  ] } }, rolls: [message.rolls[0]] };
  assert.equal(AttackChatCard.describe(mixed).targets, 2);
  assert.equal(AttackChatCard.describe(mixed).power, 'Handaxe');
});


/** Minimal document boundary for exercising the real shared card and row renderers. */
class Element {
  constructor(tag, className = '', text = '') {
    Object.assign(this, { tag, className, textContent: text, children: [], handlers: {}, dataset: {}, style: {} });
    this.classList = { contains: name => this.className.split(' ').includes(name),
      add: name => { this.className += ` ${name}`; } };
  }
  remove() {
    if (this.parent) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
    }
    this.parent = null;
  }
  append(...nodes) {
    for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node); }
  }
  prepend(...nodes) {
    for (const node of nodes.reverse()) { node.remove(); node.parent = this; this.children.unshift(node); }
  }
  before(node) {
    node.remove();
    this.parent.children.splice(this.parent.children.indexOf(this), 0, node);
    node.parent = this.parent;
  }
  replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); }
  addEventListener(name, callback) { this.handlers[name] = callback; }
  setAttribute() {}
  matches(selector) { return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tag === selector; }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
  querySelectorAll(selector) {
    const parts = selector.split(' ');
    const matches = node => {
      if (!node.matches(parts.at(-1))) {
        return false;
      }
      let parent = node.parent;
      for (const part of parts.slice(0, -1).reverse()) {
        while (parent && !parent.matches(part)) parent = parent.parent;
        if (!parent) {
          return false;
        }
        parent = parent.parent;
      }
      return true;
    };
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  get nextElementSibling() { return this.parent?.children[this.parent.children.indexOf(this) + 1]; }
}

test('mixed attack and defense use real shared rows, one header/footer, and stable rendering on updates', () => {
  globalThis.document = { createElement: tag => new Element(tag) };
  const root = new Element('li', 'message');
  const content = new Element('div', 'message-content');
  root.append(content);
  content.append(new Element('div', 'dice-roll', 'Native attack calculation'));
  const chat = { id: 'mixed', isContentVisible: true, speaker: { alias: 'Orc' },
    rolls: [{ total: 19, options: { multirollData: { targetID: 'npc', target: 'Another Orc', def: 'ac', hitstate: 'hit' } } }],
    flags: { 'dnd4e-health-display': { attackResults: { pending: true, targetIds: ['hero', 'npc'] } },
      playerDefense: { attackName: 'Handaxe', targets: [{ id: 'hero-0', tokenId: 'hero', actorName: 'Hero', defenseStat: 'AC',
        resolved: true, total: 26, natural: 16, rollDC: 21, outcome: 'miss', rollHtml: '<div>Defense dice</div>' }] } },
  };
  AttackChatCard.renderWithDefenses(chat, root, ChatRolls);
  assert.equal(root.querySelectorAll('.banter-attack-card').length, 1);
  assert.equal(root.querySelectorAll('.banter-attack-card__header').length, 1);
  assert.equal(root.querySelectorAll('.banter-attack-card__footer').length, 1);
  assert.equal(root.querySelectorAll('.banter-roll--attack').length, 2);
  assert.equal(root.querySelectorAll('.banter-defense').length, 0);
  assert.deepEqual(root.querySelectorAll('.banter-roll__sentence').map(node => node.textContent), ['Hero defends', 'vs. Another Orc']);
  assert.equal(root.querySelector('.banter-roll--defense').querySelector('.banter-roll__score small').textContent, 'Defense 26');
  assert.equal(root.querySelector('.banter-attack-card__damage').disabled, true);
  AttackChatCard.renderWithDefenses(chat, root, ChatRolls);
  assert.equal(root.querySelectorAll('.banter-roll--attack').length, 2, 'legacy and modern render hooks must not duplicate rows');
  chat.flags.playerDefense.targets[0].total = 28;
  chat.rolls.push({ total: 26, options: { banterDefenseTarget: 'hero' } });
  assert.equal(AttackChatCard.targetRows(chat).length, 2, 'stored animation dice must not add another attack row');
  content.replaceChildren();
  AttackChatCard.renderWithDefenses(chat, root, ChatRolls);
  assert.equal(root.querySelector('.banter-roll--defense').querySelector('.banter-roll__score small').textContent, 'Defense 28');
});


test('the defense chat row keeps its result hidden until the local dice animation completes', () => {
  globalThis.document = { createElement: tag => new Element(tag) };
  const hooks = new Map();
  globalThis.Hooks = { on(name, callback) { hooks.set(name, callback); return name; }, off: name => hooks.delete(name) };
  const root = new Element('li', 'message');
  const content = new Element('div', 'message-content');
  root.append(content);
  const chat = { id: 'animating-defense', isContentVisible: true, _dice3danimating: true,
    rolls: [{ total: 26, options: { banterDefenseTarget: 'hero' } }], flags: {
      playerDefense: { attackName: 'Handaxe', targets: [{ id: 'hero-0', tokenId: 'hero', actorName: 'Hero', defenseStat: 'AC',
        resolved: true, total: 26, natural: 16, rollDC: 21, outcome: 'miss', rollHtml: 'RESULT DICE', missText: 'RESULT EFFECT' }] },
    } };
  AttackChatCard.renderWithDefenses(chat, root, ChatRolls);
  assert.equal(root.querySelector('.banter-roll__score strong').textContent, 'Waiting');
  assert.equal(root.querySelector('.banter-roll__score small').textContent, 'Awaiting roll');
  assert.equal(root.querySelectorAll('.banter-roll__popup').length, 0);
  hooks.get('diceSoNiceRollComplete')(chat.id);
  assert.equal(root.querySelector('.banter-roll__score strong').textContent, 'Waiting', 'another queued animation is still running');
  chat._dice3danimating = false;
  hooks.get('diceSoNiceRollComplete')(chat.id);
  assert.equal(root.querySelector('.banter-roll__score strong').textContent, 'Evaded');
  assert.equal(root.querySelector('.banter-roll__score small').textContent, 'Defense 26');
  assert.equal(hooks.size, 0);
  chat.flags.playerDefense.targets.push({ id: 'second-0', tokenId: 'second', actorName: 'Second', defenseStat: 'AC',
    resolved: true, total: 12, natural: 2, rollDC: 21, outcome: 'normal' });
  chat.rolls.push({ total: 12, options: { banterDefenseTarget: 'second' } });
  chat._dice3danimating = true;
  content.replaceChildren();
  AttackChatCard.renderWithDefenses(chat, root, ChatRolls);
  assert.deepEqual(root.querySelectorAll('.banter-roll__score strong').map(node => node.textContent), ['Evaded', 'Waiting']);
  assert.equal(root.querySelector('.banter-attack-card__damage').disabled, true);
  hooks.get('canvasTearDown')();
  assert.equal(hooks.size, 0, 'scene changes remove animation listeners');
});
