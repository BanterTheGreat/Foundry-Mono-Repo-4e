import test from 'node:test';
import assert from 'node:assert/strict';
import { concernText, defaultPreparation, startSession, resolveAction, undoSession, publicSnapshot, sessionStatus } from '../scripts/negotiation/negotiation-data.js';

/** A neutral subject with room to test every numerical outcome. */
function session() {
	const preparation = defaultPreparation();
	preparation.interest = 2;
	preparation.patience = 3;
	preparation.motivations = [{ text: 'Protect the docks', clue: 'Private clue', revealed: false }];
	preparation.pitfalls = [{ text: 'Surrender authority', clue: 'Secret pitfall clue', revealed: false }];
	return startSession(preparation, { name: 'Magistrate', img: 'npc.webp' });
}

for (const [kind, expected] of Object.entries({
	motivation: { catastrophic: [1, 2], failure: [2, 2], success: [3, 2], perfect: [3, 3] },
	ordinary: { catastrophic: [1, 2], failure: [1, 2], success: [2, 2], perfect: [3, 2] },
})) {
	for (const [result, tracks] of Object.entries(expected)) {
		test(`${kind}: ${result} follows the printed table`, () => {
			const original = session();
			const next = resolveAction(original, { type: 'argument', kind, result, motivationIndex: 0 });
			assert.deepEqual([next.interest, next.patience], tracks);
			assert.equal(next.motivations[0].used, kind === 'motivation');
			assert.equal(original.motivations[0].used, false);
			assert.deepEqual(undoSession(next), original);
		});
	}
}

test('automatic outcomes ignore natural rolls and pitfall does not spend a motivation', () => {
	for (const kind of ['pitfall', 'repeated']) {
		const next = resolveAction(session(), { type: 'argument', kind, result: 'perfect', natural: '20', motivationIndex: 0 });
		assert.deepEqual([next.interest, next.patience, next.motivations[0].used], [1, 2, false]);
		assert.doesNotMatch(next.history[0].message, /benefit/);
	}
	const used = session();
	used.motivations[0].used = true;
	const next = resolveAction(used, { type: 'argument', kind: 'decisive', result: 'perfect', natural: '20', motivationIndex: 0 });
	assert.deepEqual([next.interest, next.patience], [2, 2]);
});

test('natural 20 removes ordinary Patience cost; natural 1 overrides success', () => {
	const action = { type: 'argument', kind: 'ordinary', result: 'success' };
	const twenty = resolveAction(session(), { ...action, natural: '20' });
	assert.deepEqual([twenty.interest, twenty.patience], [3, 3]);
	assert.match(twenty.history[0].message, /benefit/);
	const one = resolveAction(session(), { ...action, natural: '1' });
	assert.deepEqual([one.interest, one.patience], [1, 2]);
	assert.match(one.history[0].message, /complication/);
});

test('detected lie adds Interest loss and preserves the motivation', () => {
	const action = { type: 'argument', kind: 'motivation', result: 'failure', detectedLie: true, motivationIndex: 0 };
	const next = resolveAction(session(), action);
	assert.deepEqual([next.interest, next.patience, next.motivations[0].used], [1, 2, false]);
	assert.throws(() => resolveAction(session(), { ...action, result: 'success' }), /only when/);
});

test('discovery reveals only the selected concern, locks the party, and arguments unlock it', () => {
	const action = { type: 'discovery', result: 'success', concernKind: 'pitfalls', concernIndex: 0 };
	const next = resolveAction(session(), action);
	assert.equal(next.pitfalls[0].revealed, true);
	assert.equal(next.motivations[0].revealed, false);
	assert.equal(next.patience, 2);
	assert.throws(() => resolveAction(next, action), /must make an argument/);
	const argued = resolveAction(next, { type: 'argument', kind: 'ordinary', result: 'success' });
	assert.equal(argued.discoveryBlocked, false);
	assert.throws(() => resolveAction(argued, action), /hidden motivation or pitfall/);
	assert.deepEqual(undoSession(next), session());
});

for (const [result, cost] of [['perfect', 0], ['success', 1], ['failure', 1], ['catastrophic', 1]]) {
	test(`discovery ${result} costs ${cost} Patience`, () => {
		const next = resolveAction(session(), { type: 'discovery', result, concernKind: 'motivations', concernIndex: 0 });
		assert.equal(next.patience, 3 - cost);
		assert.equal(next.motivations[0].revealed, ['perfect', 'success'].includes(result));
	});
}

test('Interest endings take priority, track corrections reopen, and acceptance needs an offer', () => {
	const initial = session();
	initial.interest = 4;
	initial.patience = 1;
	const best = resolveAction(initial, { type: 'argument', kind: 'ordinary', result: 'perfect' });
	assert.deepEqual([best.interest, best.patience], [5, 0]);
	assert.match(sessionStatus(best), /Final offer/);
	assert.throws(() => resolveAction(best, { type: 'discovery', result: 'failure' }), /final/);
	const accepted = resolveAction(best, { type: 'end', ending: 'Accepted' });
	assert.equal(sessionStatus(accepted), 'Accepted');
	const corrected = resolveAction(accepted, { type: 'adjust', interest: 1, patience: 2 });
	assert.equal(sessionStatus(corrected), 'Negotiating');
	assert.throws(() => resolveAction(corrected, { type: 'end', ending: 'Accepted' }), /no deal/);
	corrected.interest = 0;
	corrected.patience = 0;
	assert.equal(sessionStatus(corrected), 'No deal');
});

test('public snapshot excludes every secret and preserves revealed zero tracks', () => {
	const state = session();
	state.motivations.push({ text: 'Public concern', clue: 'Still secret', revealed: true, used: true });
	state.history.push({ message: 'Secret argument' });
	state.interest = 0;
	state.visible.interest = true;
	state.visible.offer = true; // Legacy presets must never publish offers.
	state.request = 'Legacy request';
	state.promises = 'Legacy promises';
	state.visible.request = true;
	state.visible.promises = true;
	const snapshot = publicSnapshot(state);
	assert.equal(snapshot.interest, 0);
	assert.equal(snapshot.patience, null);
	assert.equal(Object.hasOwn(snapshot, 'offer'), false);
	assert.equal(Object.hasOwn(snapshot, 'request'), false);
	assert.equal(Object.hasOwn(snapshot, 'promises'), false);
	assert.deepEqual(snapshot.motivations, [{ text: 'Public concern', used: true }]);
	assert.deepEqual(snapshot.pitfalls, []);
	assert.doesNotMatch(JSON.stringify(snapshot), /Private clue|Secret|Still secret|Protect the docks|Surrender authority|history/);
});

test('fresh sessions reset spent motivations without mutating reusable preparation', () => {
	const preparation = defaultPreparation();
	preparation.motivations = [{ text: 'Protection', revealed: true, used: true }];
	const fresh = startSession(preparation, { name: 'NPC', img: 'npc.webp' });
	assert.equal(fresh.motivations[0].used, false);
	assert.equal(preparation.motivations[0].used, true);
	preparation.patience = 0;
	assert.throws(() => startSession(preparation, {}), /above 0/);
});


test('concern categories support overrides and retain existing custom preset text', () => {
	assert.equal(concernText({ category: 'Protection', override: '' }), 'Protection');
	assert.equal(concernText({ category: 'Protection', override: '  Keep residents safe  ' }), 'Keep residents safe');
	assert.equal(concernText({ text: 'Existing custom concern' }), 'Existing custom concern');
	const state = session();
	state.motivations = [{ category: 'Justice', override: 'Fair treatment', clue: 'Secret', revealed: true, used: false }];
	state.pitfalls = [{ category: 'Power', override: '', revealed: true }];
	assert.deepEqual(publicSnapshot(state).motivations, [{ text: 'Fair treatment', used: false }]);
	assert.deepEqual(publicSnapshot(state).pitfalls, [{ text: 'Power' }]);
});


test('concern descriptions reveal with their concern while discovery clues remain private', () => {
	const state = session();
	state.motivations[0].description = 'Keep residents safe';
	state.pitfalls[0].description = 'Do not undermine her command';
	assert.deepEqual(publicSnapshot(state).motivations, []);
	assert.deepEqual(publicSnapshot(state).pitfalls, []);
	state.motivations[0].revealed = true;
	state.pitfalls[0].revealed = true;
	assert.equal(publicSnapshot(state).motivations[0].description, 'Keep residents safe');
	assert.equal(publicSnapshot(state).pitfalls[0].description, 'Do not undermine her command');
	assert.doesNotMatch(JSON.stringify(publicSnapshot(state)), /Private clue|Secret pitfall clue/);
});
