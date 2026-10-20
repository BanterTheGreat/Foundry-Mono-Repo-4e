import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiationDcs } from '../scripts/negotiation/negotiation-dcs.js';

/** Represent scene token documents without requiring Foundry. */
function pc(id, level) {
	return { actorId: id, actor: { type: 'Player Character', system: { details: { level } } } };
}

test('scene DCs use rounded average PC level, counting duplicate actor tokens once', () => {
	const result = negotiationDcs([pc('a', 2), pc('a', 2), pc('b', { value: 5 }), { actor: { type: 'NPC', system: { details: { level: 30 } } } }]);
	assert.equal(result.count, 2);
	assert.equal(result.partyLevel, 4);
	assert.deepEqual([result.easy, result.normal, result.hard], [9, 14, 19]);
});

test('missing and unsupported PC levels are reported without inventing a DC', () => {
	const result = negotiationDcs([pc('a', undefined), pc('b', 0), pc('c', 31)]);
	assert.equal(result.count, 0);
	assert.equal(result.missingLevels, 3);
	assert.equal(result.level, null);
	assert.equal(result.normal, null);
	assert.equal(negotiationDcs([]).normal, null);
});

test('manual level selects the printed row independently of party level', () => {
	const tokens = [pc('a', 1), pc('b', 1)];
	assert.deepEqual([negotiationDcs(tokens).easy, negotiationDcs(tokens).normal, negotiationDcs(tokens).hard], [7, 12, 17]);
	const result = negotiationDcs(tokens, '30');
	assert.equal(result.partyLevel, 1);
	assert.deepEqual([result.easy, result.normal, result.hard], [27, 32, 37]);
	assert.equal(negotiationDcs([], 11).normal, 19);
	assert.equal(negotiationDcs(tokens, '').level, 1);
	assert.equal(negotiationDcs(tokens, 31).level, 1);
});
