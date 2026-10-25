import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDefenseTarget } from '../scripts/modules/player-defense/player-defense-chat.js';
import { SocketHelper } from '../scripts/modules/player-defense/socket-helper.js';

const target = { id: 'hero', actorName: 'Aria <Hero>', defenseStat: 'WILL', rollDC: 26, hitText: '<p>17 damage and slowed.</p>', missText: '' };

test('GM resolution replaces only the resolved target card and retains other pending targets', async () => {
  const first = { ...target };
  const second = { ...target, id: 'bram', actorName: 'Bram' };
  const defense = { attackName: 'Lash', targets: [first, second], hasDamage: false };
  const message = {
    flags: { playerDefense: defense },
    // Persisted HTML can be normalized: whitespace, entities and attribute
    // serialization are not a stable identifier for a target card.
    content: renderDefenseTarget(first, 'Lash').replace('<details>', '<details >') + renderDefenseTarget(second, 'Lash'),
    async update(change) { Object.assign(this, change); },
  };
  globalThis.game = { messages: new Map([['message', message]]), SocketHelper: new SocketHelper(), settings: { settings: new Map(), get: () => false } };
  const resolved = renderDefenseTarget(first, 'Lash', { outcome: 'miss', total: 27, natural: 17, rollHtml: 'roll' });
  assert.equal(await SocketHelper.resolveDefenseTarget('message', first.id, 'miss', resolved), true);
  assert.equal(message.content, resolved + renderDefenseTarget(second, 'Lash'));
  assert.equal(await SocketHelper.resolveDefenseTarget('message', first.id, 'critical', 'duplicate'), false);
  const secondResult = renderDefenseTarget(second, 'Lash', { outcome: 'normal', total: 22, natural: 12, rollHtml: 'roll' });
  assert.equal(await SocketHelper.resolveDefenseTarget('message', second.id, 'normal', secondResult), true);
  assert.equal(message.content, resolved + secondResult);
});

test('missing pending markup does not commit resolution or trigger damage', async () => {
  globalThis.ui = { notifications: { error() {} } };
  const pending = { ...target };
  const message = { content: '<p>Unrecognized card</p>', flags: { playerDefense: { targets: [pending] } }, async update() { assert.fail('must not update'); } };
  globalThis.game = { messages: new Map([['message', message]]), SocketHelper: new SocketHelper(), settings: { settings: new Map(), get: () => false } };
  assert.equal(await SocketHelper.resolveDefenseTarget('message', pending.id, 'normal', '<b>HIT</b>'), false);
  assert.equal(pending.resolved, undefined);
});

test('defense cards retain required DC and enriched hit effects outside roll disclosure', () => {
  const html = renderDefenseTarget(target, 'Shadow lash', { outcome: 'critical', natural: 1, total: 11, rollHtml: '<div>1 + 10 = 11</div>' });
  assert.match(html, /banter-defense--critical/);
  assert.match(html, /CRIT HIT/);
  assert.match(html, /Aria &lt;Hero&gt;/);
  assert.match(html, /<small>DC<\/small><strong>26/);
  assert.ok(html.indexOf('</details>') < html.indexOf('17 damage and slowed.'));
});

test('evaded attacks omit empty miss effects but preserve actual miss consequences', () => {
  const result = { outcome: 'miss', natural: 20, total: 30, rollHtml: 'roll' };
  assert.match(renderDefenseTarget(target, 'Lash', result), /EVADED/);
  assert.doesNotMatch(renderDefenseTarget(target, 'Lash', result), /MISS EFFECT/);
  assert.doesNotMatch(renderDefenseTarget({ ...target, missText: '<p>&nbsp;</p>' }, 'Lash', result), /MISS EFFECT/);
  assert.match(renderDefenseTarget({ ...target, missText: 'Half damage.' }, 'Lash', result), /MISS EFFECT.*Half damage\./);
  assert.match(renderDefenseTarget(target, 'Lash'), /WAITING/);
});
