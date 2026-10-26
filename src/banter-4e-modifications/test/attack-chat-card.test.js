import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(header.children[0].children[0].textContent, 'Aric attacks');
  assert.equal(header.children[1].textContent, 'Roll Damage');
  assert.deepEqual(group.children.at(-1).children.map(node => node.textContent), ['3 targets', 'vs. AC']);
  assert.deepEqual(cards.map(card => card.querySelector('.banter-roll__sentence').textContent),
    ['vs. Enforcer', 'vs. Lookout', 'vs. Captain']);
});
