import test from 'node:test';
import assert from 'node:assert/strict';
import { PowerChatCards } from '../scripts/modules/chat-rolls/power-chat-cards.js';
import { ChatRolls } from '../scripts/modules/chat-rolls/chat-rolls.js';

test('power identity uses the historical speaker and stored usage rather than current item data', () => {
  const card = { dataset: { actorId: 'actor' }, classList: { contains: value => value === 'use-daily' } };
  globalThis.game = { actors: new Map([['actor', { name: 'Renamed actor' }]]) };
  const model = PowerChatCards.describe({ speaker: { alias: 'Idrani Fullhorn' }, flags: {
    dnd4e: { itemData: { system: { useType: 'encounter' } } },
  } }, card);
  assert.deepEqual(model, { speaker: 'Idrani Fullhorn', usage: 'encounter' });
  assert.deepEqual(PowerChatCards.describe({}, card), { speaker: 'Renamed actor', usage: 'daily' });
});

test('missing/deleted actors and unknown power usage have neutral fallbacks', () => {
  globalThis.game = { actors: new Map() };
  const card = { dataset: {}, classList: { contains: () => false } };
  assert.deepEqual(PowerChatCards.describe({}, card), { speaker: 'Someone', usage: 'other' });
  for (const usage of ['atwill', 'encounter', 'daily']) {
    assert.equal(PowerChatCards.describe({ flags: { dnd4e: { itemData: { system: { useType: usage } } } } }, card).usage, usage);
  }
});

test('repeat render hooks recognize transformed power cards without rebinding them', () => {
  const transformed = { classList: { contains: value => value === 'banter-power' } };
  const unsupported = { classList: { contains: () => false }, querySelector: () => null };
  assert.equal(PowerChatCards.render({}, { querySelectorAll: () => [transformed] }), true);
  assert.equal(PowerChatCards.render({}, { querySelectorAll: () => [unsupported] }), false);
  assert.equal(PowerChatCards.render({}, { querySelectorAll: () => [] }), false);
});

test('power formatting shares the compact presentation setting and respects hidden messages', () => {
  let renders = 0;
  const original = PowerChatCards.render;
  PowerChatCards.render = () => { renders++; return true; };
  const root = { querySelectorAll() {}, querySelector() { return null; } };
  globalThis.game = { system: { id: 'dnd4e' }, settings: { get: () => true } };
  try {
    ChatRolls.render({ isContentVisible: false }, root);
    assert.equal(renders, 0);
    game.settings.get = () => false;
    ChatRolls.render({}, root);
    assert.equal(renders, 0);
    game.settings.get = () => true;
    ChatRolls.render({}, root);
    assert.equal(renders, 1);
    game.system.id = 'another-system';
    ChatRolls.render({}, root);
    assert.equal(renders, 1);
  } finally {
    PowerChatCards.render = original;
  }
});
