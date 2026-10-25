import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatMessageGroups } from '../scripts/modules/chat-rolls/chat-message-groups.js';
import { ChatRolls } from '../scripts/modules/chat-rolls/chat-rolls.js';
import { DamageSourceCapture } from '../scripts/modules/chat-rolls/damage-source-capture.js';

test('compact setting gates message grouping and its DOM observer', () => {
  let enabled = false;
  let installs = 0;
  const installGroups = ChatMessageGroups.install;
  const installCapture = DamageSourceCapture.install;
  globalThis.game = { system: { id: 'dnd4e' }, settings: { get: () => enabled } };
  ChatMessageGroups.install = () => { installs++; };
  DamageSourceCapture.install = () => {};
  const root = { dataset: {}, querySelectorAll: () => [], querySelector: () => null };
  const message = { speaker: { actor: 'beltane', alias: 'Beltane' } };
  try {
    ChatRolls.install();
    ChatRolls.render(message, root);
    assert.equal(installs, 0);
    assert.deepEqual(root.dataset, {});
    enabled = true;
    ChatRolls.install();
    ChatRolls.render(message, root);
    assert.equal(installs, 1);
    assert.equal(root.dataset.banterSpeaker, ChatMessageGroups.speakerKey(message));
  } finally {
    ChatMessageGroups.install = installGroups;
    DamageSourceCapture.install = installCapture;
  }
});

test('actor groups follow speaker identity rather than the user rolling', () => {
  const beltane = { speaker: { actor: 'beltane', alias: 'Beltane' }, author: { id: 'player' } };
  assert.equal(ChatMessageGroups.speakerKey(beltane),
    ChatMessageGroups.speakerKey({ ...beltane, author: { id: 'gm' } }));
  assert.notEqual(ChatMessageGroups.speakerKey(beltane),
    ChatMessageGroups.speakerKey({ ...beltane, speaker: { actor: 'idrani', alias: 'Idrani' } }));
  assert.notEqual(ChatMessageGroups.speakerKey({ author: { id: 'one' } }),
    ChatMessageGroups.speakerKey({ author: { id: 'two' } }));
});

test('displayed adjacency updates shared headers after deletion and history insertion', () => {
  const make = key => ({
    dataset: { banterSpeaker: key },
    matches: () => true,
    classList: { toggle(name, value) { this.continuation = value; } },
  });
  const first = make('Beltane');
  const second = make('Beltane');
  const other = make('Idrani');
  const last = make('Beltane');
  let messages = [first, second, other, last];
  const refresh = () => {
    messages.forEach((message, index) => { message.previousElementSibling = messages[index - 1]; });
    ChatMessageGroups.refresh({ querySelectorAll: () => messages });
    return messages.map(message => message.classList.continuation);
  };
  assert.deepEqual(refresh(), [false, true, false, false]);
  messages = [first, second, last];
  assert.deepEqual(refresh(), [false, true, true]);
  messages.unshift(make('Beltane'));
  assert.deepEqual(refresh(), [false, true, true, true]);
  messages.shift();
  assert.deepEqual(refresh(), [false, true, true]);
});
