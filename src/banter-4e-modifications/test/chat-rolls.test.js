import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRoll, naturalD20, damageContributors } from '../scripts/modules/chat-rolls/chat-roll-data.js';
import { DamageSourceCapture } from '../scripts/modules/chat-rolls/damage-source-capture.js';
import { ChatRollActions, typedDamage } from '../scripts/modules/chat-rolls/chat-roll-actions.js';
import { ChatRolls } from '../scripts/modules/chat-rolls/chat-rolls.js';

test('outcome hover highlights its stored visible target without selecting or exposing other scenes', () => {
  const handlers = {};
  const sentence = { addEventListener: (name, handler) => { handlers[name] = handler; } };
  let enters = 0;
  let leaves = 0;
  const token = { isVisible: true, controlled: false,
    _onHoverIn() { enters++; }, _onHoverOut() { leaves++; } };
  globalThis.canvas = { ready: true, scene: { id: 'scene' }, tokens: { get: id => id === 'enemy' ? token : null } };
  ChatRolls.bindTargetHighlight(sentence, { speaker: { scene: 'scene' } }, { options: { multirollData: { targetID: 'enemy' } } });
  handlers.pointerenter({});
  handlers.pointerleave({});
  assert.equal(enters, 1);
  assert.equal(leaves, 1);
  token.isVisible = false;
  handlers.pointerenter({});
  assert.equal(enters, 1);
  token.isVisible = true;
  canvas.scene.id = 'elsewhere';
  handlers.pointerenter({});
  assert.equal(enters, 1);
});

const message = { id: 'roll', isContentVisible: true, speaker: { alias: 'Idrani Fullhorn' } };
const attack = (total, state, badges = []) => ({ total, options: {
  multirollData: { target: 'Kell-Guild Blade', hitstate: state }, banterAttackBuffs: badges,
} });

test('attack entries preserve their own stored outcomes, names and totals', () => {
  assert.equal(describeRoll(message, attack(25, 'hit')).label, 'Idrani Fullhorn Hit Kell-Guild Blade');
  assert.equal(describeRoll(message, attack(14, 'miss'), 1).total, 14);
  assert.match(describeRoll(message, attack(25, '')).label, /attacked/);
  assert.equal(describeRoll(message, attack(25, 'hit')).attackOutcome, 'hit');
  assert.equal(describeRoll(message, attack(14, 'miss')).attackOutcome, 'miss');
  assert.equal(describeRoll(message, attack(25, '')).attackOutcome, null);
  for (const special of ['critical', 'fumble', 'immune']) {
    const roll = attack(25, 'hit', [{ name: 'Bless', value: 2, decisive: true }]);
    roll.options.multirollData.critstate = special;
    assert.equal(describeRoll(message, roll).attackOutcome, special);
    assert.equal(describeRoll(message, roll).attackModifiers.length, 1);
  }
});

test('all nonzero temporary attack modifiers appear collapsed', () => {
  const badges = [{ name: 'Strength', kind: 'ability', value: 5, decisive: true },
    { name: 'Bless', value: 2, decisive: true }, { name: 'Other', value: 2, decisive: false },
    { name: 'Distracted', value: -2, decisivePenalty: true },
    { name: 'Cover', value: -2 }, { name: 'Unused', value: 0 },
    { name: 'Enchantment', kind: 'enhancement', value: 2 }];
  assert.deepEqual(describeRoll(message, attack(25, 'hit', badges)).attackModifiers.map(b => b.name), ['Bless', 'Other', 'Distracted', 'Cover']);
});

test('skill sources stay in details and private rolls have no presentation model', () => {
  const skill = { ...message, flags: { 'banter-4e-modifications': { skillCheck: {
    skillId: 'acr', skillName: 'Acrobatics', badges: [{ name: 'Training', value: 5, decisive: true }],
  } } } };
  const model = describeRoll(skill, { total: 25 });
  assert.match(model.label, /rolled Acrobatics/);
  assert.equal(model.attackModifiers.length, 0);
  assert.equal(model.badges.length, 1);
  assert.equal(describeRoll({ ...skill, isContentVisible: false }, { total: 25 }), null);
});

test('natural d20 ignores discarded, rerolled and inactive results', () => {
  assert.deepEqual(naturalD20({ dice: [{ faces: 20, results: [
    { result: 20, active: false }, { result: 5, discarded: true }, { result: 1, rerolled: true },
    { result: 19, active: true },
  ] }, { faces: 8, results: [{ result: 7 }] }] }), [19]);
});

test('damage snapshots preserve formula, source identity and zero contributions through JSON', () => {
  const context = { sources: [{ sourceUuid: 'Effect.1', changeIndex: 0, name: 'Flame infusion', temporary: true,
    parts: [{ formula: '(2d8 + 2)[fire]', displayFormula: '2d8 + 2', damageType: 'fire' }] }] };
  const entries = DamageSourceCapture.correlate(['(17)[physical]', '(2d8 + 2)[fire]'],
    [{ target: '(2d8 + 2)[fire]', value: '@extraDamage' }], 'normal', context);
  assert.equal(entries[0].displayFormula, '2d8 + 2');
  entries[0].rolledContribution = 0;
  assert.equal(damageContributors(JSON.parse(JSON.stringify(entries)))[0].rolledContribution, 0);
  assert.deepEqual(DamageSourceCapture.correlate(['(other)[fire]'], [], 'normal', context), []);
  assert.deepEqual(DamageSourceCapture.correlate(['(18)[fire]'], [], 'crit', context), []);
});

test('damage divisor changes display once; healing and unrelated rolls retain native rendering', () => {
  const roll = { total: 29, options: { hitTypeDamage: true, hitType: 'miss', divisors: { miss: { value: 2, reason: ['Miss'] } } } };
  assert.equal(describeRoll(message, roll).total, 14);
  assert.equal(describeRoll(message, roll).label, 'Idrani Fullhorn deals damage');
  roll.options.hitTypeHealing = true;
  assert.equal(describeRoll(message, roll), null);
  assert.equal(describeRoll(message, { total: 10, options: {} }), null);
});

test('damage outcomes use the stored roll type independently of damage divisors', () => {
  for (const hitType of ['miss', 'crit', 'normal', undefined]) {
    const roll = { total: 29, options: { hitTypeDamage: true, hitType } };
    const model = describeRoll(message, roll);
    assert.equal(model.damageOutcome, ['miss', 'crit'].includes(hitType) ? hitType : null);
    assert.equal(model.total, 29);
  }
  assert.equal(describeRoll(message, attack(25, 'critical')).damageOutcome, null);
});

test('typed adapter matches native remainder allocation and awaits actor mitigation', async () => {
  const roll = { total: 28, terms: [{ total: 17, flavor: 'physical' }, { operator: '+' }, { total: 11, flavor: 'fire' }],
    options: { hitTypeDamage: true, hitType: 'miss', divisors: { miss: { value: 2 } } } };
  assert.deepEqual(typedDamage({ total: 10, terms: [{ total: 3, flavor: 'fire' }, { total: 4, flavor: 'cold' }] }), [[5, 'fire'], [5, 'cold']]);
  let complete;
  const calls = [];
  const actor = { isOwner: true, calcDamage: (...args) => {
    calls.push(args);
    return new Promise(resolve => { complete = resolve; });
  } };
  globalThis.game = { system: { version: '0.9.3' }, user: { isGM: false }, i18n: { localize: key => key } };
  globalThis.canvas = { tokens: { controlled: [{ actor }] } };
  globalThis.ui = { notifications: { error() {}, warn() {} } };
  const result = ChatRollActions.apply({ ...message, rolls: [roll] });
  assert.equal(await ChatRollActions.apply({ ...message, rolls: [roll] }), false);
  assert.deepEqual(calls, [[[[17, 'physical'], [11, 'fire']], .5]]);
  complete();
  assert.equal(await result, true);
  assert.equal(ChatRollActions.pending.size, 0);
  const halfResult = ChatRollActions.apply({ ...message, rolls: [roll] }, 0.5);
  assert.deepEqual(calls[1], [[[17, 'physical'], [11, 'fire']], .25]);
  assert.equal(await ChatRollActions.apply({ ...message, rolls: [roll] }), false);
  complete();
  assert.equal(await halfResult, true);
  canvas.tokens.controlled = [];
  assert.equal(await ChatRollActions.apply({ ...message, rolls: [roll] }), false);
  canvas.tokens.controlled = [{ actor: { isOwner: false } }];
  assert.equal(await ChatRollActions.apply({ ...message, rolls: [roll] }), false);
});

test('damage lock covers the native unawaited HP write and releases after failure', async () => {
  let finish;
  let finished = false;
  const actor = {
    async calcDamage(damage, multiplier) { this.applyDamage(damage[0][0], multiplier); },
    applyDamage() { return new Promise(resolve => { finish = resolve; }); },
  };
  const application = ChatRollActions.applyActorDamage(actor, [[10, 'physical']], 1).then(() => { finished = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(finished, false);
  finish();
  await application;
  actor.applyDamage = () => Promise.reject(new Error('Denied'));
  await assert.rejects(ChatRollActions.applyActorDamage(actor, [[10, 'physical']], 1), /HP update failed/);
});

test('overlapping damage dialogs persist their own source before effects expire', async () => {
  const snapshot = DamageSourceCapture.snapshot;
  class Item {
    constructor(name) { this.name = name; }
    getRollData() { return {}; }
    async rollDamage({ wait }) {
      const data = this.getRollData();
      await wait;
      const roll = Expression.createRoll(['(2d8 + 2)[fire]'], [{ target: '(2d8 + 2)[fire]', value: '@extraDamage' }],
        data, { hitTypeDamage: true, hitType: 'normal' });
      return roll.toMessage();
    }
  }
  class Expression {
    static createRoll(parts, replacements, data, options) {
      return { options: { ...options, parts }, _evaluated: true, terms: [{ total: 11 }],
        async toMessage() { return JSON.parse(JSON.stringify(this.options.banterChatRoll)); } };
    }
  }
  DamageSourceCapture.snapshot = async item => ({ source: { itemName: item.name }, sources: [
    { sourceUuid: item.name, name: 'Expired infusion', temporary: true, parts: [
      { formula: '(2d8 + 2)[fire]', displayFormula: '2d8 + 2', damageType: 'fire' },
    ] },
  ] });
  try {
    DamageSourceCapture.wrap(Item, Expression, {});
    let closeFirst;
    const firstItem = new Item('First');
    const first = firstItem.rollDamage({ wait: new Promise(resolve => { closeFirst = resolve; }) });
    const second = await new Item('Second').rollDamage({ wait: Promise.resolve() });
    firstItem.name = 'Renamed after roll';
    closeFirst();
    const savedFirst = await first;
    assert.equal(savedFirst.source.itemName, 'First');
    assert.equal(second.source.itemName, 'Second');
    assert.equal(savedFirst.contributors[0].rolledContribution, 11);
    assert.equal(savedFirst.contributors[0].displayFormula, '2d8 + 2');
    assert.equal(savedFirst.version, 1);
  } finally {
    DamageSourceCapture.snapshot = snapshot;
  }
});

test('manual attack edits remain explicit even when reset to zero', () => {
  const message = { speaker: { alias: 'Hero' } };
  const roll = { total: 18, options: { multirollData: { hitstate: 'hit' }, postAttackModifier: 3 } };
  assert.equal(describeRoll(message, roll).manualEdit, 'Manually edited (+3)');
  roll.options.postAttackModifier = 0;
  assert.equal(describeRoll(message, roll).manualEdit, 'Manually edited (+0)');
  delete roll.options.postAttackModifier;
  assert.equal(describeRoll(message, roll).manualEdit, null);
});


test('mixed pending attacks mark only ordinary rolls unconfirmed and clear them after confirmation', () => {
  const pending = { ...message, flags: { 'dnd4e-health-display': { attackResults: { pending: true } } } };
  const confirmed = { ...message, flags: { 'dnd4e-health-display': { attackResults: { pending: false } } } };
  const rolls = ['critical', 'fumble', 'hit', 'miss'].map(outcome => {
    const roll = attack(20, outcome === 'fumble' || outcome === 'miss' ? 'miss' : 'hit');
    if (['critical', 'fumble'].includes(outcome)) {
      roll.options.multirollData.critstate = outcome;
    }
    return roll;
  });
  assert.deepEqual(rolls.map((roll, index) => describeRoll(pending, roll, index).unconfirmed), [false, false, true, true]);
  assert.deepEqual(rolls.map((roll, index) => describeRoll(confirmed, roll, index).unconfirmed), [false, false, false, false]);
});
