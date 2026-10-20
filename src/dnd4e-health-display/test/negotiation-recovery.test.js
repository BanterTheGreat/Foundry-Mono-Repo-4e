import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreparation, startSession, publicSnapshot } from '../scripts/negotiation/negotiation-data.js';

/** Boot the actual controller module against an isolated Foundry lifecycle harness. */
async function boot({ isGM = true, privateState = null } = {}) {
	const rendered = [];
	const session = startSession(defaultPreparation(), { name: 'Magistrate', img: 'npc.webp' });
	let shared = { active: true, sessionId: 'live', gmStateId: 'private', snapshot: publicSnapshot(session) };
	class Application {
		_onRender() {}
		element = { querySelectorAll: () => [], querySelector: () => null };
		render() { this.rendered = true; rendered.push(this); return this; }
		async close() { this.rendered = false; }
	}
	globalThis.foundry = { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: c => c } } };
	globalThis.Hooks = { on() {} };
	globalThis.canvas = {};
	globalThis.ui = { combat: { render() {} }, notifications: { error(message) { throw new Error(message); } } };
	let stored = { kind: 'active', data: { sessionId: 'live', session: privateState } };
	const entry = privateState ? {
		id: 'private', ownership: { default: 0 }, getFlag: () => stored, deleted: false,
		async update(data) { stored = data['flags.dnd4e-health-display.negotiation']; },
		async delete() { this.deleted = true; },
	} : null;
	globalThis.game = {
		user: { isGM }, users: { get: () => null },
		journal: { contents: entry ? [entry] : [] }, actors: { get: () => null },
		settings: { get: () => shared, async set(_module, _key, value) { shared = value; } },
	};
	const module = await import(`../scripts/negotiation/negotiation.js?recovery=${Math.random()}`);
	await module.registerNegotiation();
	await new Promise(resolve => setImmediate(resolve));
	return { rendered, entry, shared: () => shared };
}

test('reload of an existing presentation gives the GM a dismiss path even without private state', async () => {
	const app = await boot();
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	assert.ok(gm, 'The shared display must not reopen without a GM control window');
	assert.equal((await gm._prepareContext()).hasActivePresentation, true);
	const button = { dataset: { command: 'dismissPresentation' } };
	await gm.dispatch({ target: { closest: () => button }, preventDefault() {} });
	assert.equal(app.shared().active, undefined);
});

test('reload restores the current private GM state without revealing it to players', async () => {
	const preparation = defaultPreparation();
	preparation.motivations = [{ text: 'Secret concern', clue: 'Private clue', revealed: false }];
	const state = startSession(preparation, { name: 'Magistrate', img: 'npc.webp' });
	state.interest = 4;
	state.patience = 1;
	const app = await boot({ privateState: state });
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	assert.ok(gm);
	assert.deepEqual(gm.session, state);
	assert.equal(gm.activeTab, 'resolution');
	assert.doesNotMatch(JSON.stringify(app.shared()), /Secret concern|Private clue/);
});

test('players recover only the shared presentation, never GM controls', async () => {
	const app = await boot({ isGM: false });
	assert.equal(app.rendered.some(w => w.constructor.name === 'NegotiationControls'), false);
	assert.equal(app.rendered.some(w => w.constructor.name === 'NegotiationDisplay'), true);
});


test('live changes checkpoint privately and ending clears the presentation and checkpoint', async () => {
	const state = startSession(defaultPreparation(), { name: 'Magistrate', img: 'npc.webp' });
	state.motivations = [{ text: 'Secret concern', clue: 'Private clue', revealed: false }];
	const app = await boot({ privateState: state });
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	gm.session.interest = 4;
	await gm.persist();
	assert.equal(app.entry.getFlag().data.session.interest, 4);
	assert.equal(app.shared().gmStateId, 'private');
	assert.doesNotMatch(JSON.stringify(app.shared()), /Secret concern|Private clue/);
	const button = { dataset: { command: 'prepare' } };
	await gm.dispatch({ target: { closest: () => button }, preventDefault() {} });
	assert.equal(app.shared().active, undefined);
	assert.equal(app.entry.deleted, true);
	assert.equal(gm.session, null);
});


test('live offer edits save without an Update button and remain GM-only', async () => {
	const state = startSession(defaultPreparation(), { name: 'Magistrate', img: 'npc.webp' });
	const app = await boot({ privateState: state });
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	let changed;
	const offer = { dataset: { offer: '2' }, value: 'GM-only edited offer' };
	gm.element = {
		querySelectorAll: selector => selector === '[data-offer]' ? [offer] : [],
		querySelector: selector => selector === '.negotiation-editor' ? { addEventListener(_event, handler) { changed = handler; } } : null,
	};
	gm._onRender({}, {});
	changed({ target: { matches: () => true } });
	await gm.pendingSave;
	assert.equal(app.entry.getFlag().data.session.offers[2], 'GM-only edited offer');
	assert.doesNotMatch(JSON.stringify(app.shared()), /GM-only edited offer/);
});

test('argument buttons change tracks without selecting or spending a motivation', async () => {
	const preparation = defaultPreparation();
	preparation.motivations = [{ category: 'Protection', override: '', revealed: false }];
	const state = startSession(preparation, { name: 'Magistrate', img: 'npc.webp' });
	const app = await boot({ privateState: state });
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	assert.equal((await gm._prepareContext()).canApplyMotivating, true);
	const click = async dataset => gm.dispatch({ target: { closest: () => ({ dataset }) }, preventDefault() {} });
	await click({ command: 'applyArgument', kind: 'motivation', result: 'success' });
	assert.deepEqual([gm.session.interest, gm.session.patience, gm.session.motivations[0].used], [3, 2, false]);
	assert.equal(app.entry.getFlag().data.session.interest, 3);
	assert.equal((await gm._prepareContext()).canApplyMotivating, true);
	assert.equal((await gm._prepareContext()).offerLabel, 'Yes, but…');
	await click({ command: 'undo' });
	assert.deepEqual([gm.session.interest, gm.session.patience, gm.session.motivations[0].used], [2, 3, false]);
	await click({ command: 'applyArgument', kind: 'ordinary', result: 'perfect', natural: '20' });
	assert.deepEqual([gm.session.interest, gm.session.patience], [3, 3]);
	await click({ command: 'applyArgument', kind: 'ordinary', result: 'failure' });
	assert.deepEqual([gm.session.interest, gm.session.patience], [2, 2]);
});


test('motivating outcome buttons work even when no motivations are configured', async () => {
	const state = startSession(defaultPreparation(), { name: 'Magistrate', img: 'npc.webp' });
	const app = await boot({ privateState: state });
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	assert.equal((await gm._prepareContext()).canApplyMotivating, true);
	const button = { dataset: { command: 'applyArgument', kind: 'motivation', result: 'perfect' } };
	await gm.dispatch({ target: { closest: () => button }, preventDefault() {} });
	assert.deepEqual([gm.session.interest, gm.session.patience], [3, 3]);
	assert.deepEqual(gm.session.motivations, []);
});

test('editing Level immediately updates every displayed DC and saves the level', async () => {
	const state = startSession(defaultPreparation(), { name: 'Magistrate', img: 'npc.webp' });
	const app = await boot({ privateState: state });
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	let input;
	const level = { value: '20', addEventListener(_event, handler) { input = handler; } };
	const outputs = ['easy', 'normal', 'hard', 'normal'].map(dc => ({ dataset: { dc }, textContent: '' }));
	gm.element = {
		querySelectorAll: selector => selector === '[data-dc]' ? outputs : [],
		querySelector: selector => selector === '[name="dcLevelOverride"]' ? level : null,
	};
	gm._onRender({}, {});
	input({ target: level });
	assert.deepEqual(outputs.map(o => o.textContent), [20, 25, 30, 25]);
	await gm.pendingSave;
	assert.equal(app.entry.getFlag().data.dcLevelOverride, '20');
	assert.equal((await gm._prepareContext()).dcs.normal, 25);
});

test('footer track edits automatically save and refresh the offer shorthand', async () => {
	const state = startSession(defaultPreparation(), { name: 'Magistrate', img: 'npc.webp' });
	const app = await boot({ privateState: state });
	const gm = app.rendered.find(w => w.constructor.name === 'NegotiationControls');
	const handlers = {};
	const interest = { value: '4', addEventListener(_event, handler) { handlers.interest = handler; } };
	const patience = { value: '3', addEventListener(_event, handler) { handlers.patience = handler; } };
	gm.element = {
		querySelectorAll: selector => selector === '[name="adjustInterest"], [name="adjustPatience"]' ? [interest, patience] : [],
		querySelector: selector => selector === '[name="adjustInterest"]' ? interest : selector === '[name="adjustPatience"]' ? patience : null,
	};
	gm._onRender({}, {});
	await handlers.interest();
	assert.equal(gm.session.interest, 4);
	assert.equal(app.entry.getFlag().data.session.interest, 4);
	assert.equal((await gm._prepareContext()).offerLabel, 'Yes');
	patience.value = '0';
	await handlers.patience();
	assert.equal(gm.session.patience, 0);
	assert.equal(app.entry.getFlag().data.session.patience, 0);
	assert.equal((await gm._prepareContext()).argumentRows.length, 4);
});
