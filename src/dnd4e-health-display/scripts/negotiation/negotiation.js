import { OFFER_LABELS, CONCERN_CATEGORIES, concernText, ATTITUDES, defaultPreparation, startSession, resolveAction, undoSession, publicSnapshot, sessionStatus, canContinue } from './negotiation-data.js';

import { negotiationDcs } from './negotiation-dcs.js';

const MODULE_ID = 'dnd4e-health-display';
const SETTING = 'activeNegotiation';
const FLAG = 'negotiation';
const ROOT = `modules/${MODULE_ID}/scripts/negotiation`;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
let controls;
let display;

/** Register only sanitized shared presentation state. */
export function registerNegotiationSettings() {
	game.settings.register(MODULE_ID, SETTING, {
		name: 'Active negotiation presentation', scope: 'world', config: false,
		type: Object, default: {}, onChange: synchronize,
	});
}

/** Add the independent Combat tab entry and restore presentations after reconnecting. */
export function registerNegotiation() {
	Hooks.on('renderCombatTracker', (app, element) => {
		// Keep negotiation setup in the sidebar, outside the popped-out encounter view.
		if (app !== ui.combat) {
			element.querySelector('[data-negotiation-start]')?.remove();
			return;
		}
		if (!game.user.isGM || element.querySelector('[data-negotiation-start]')) {
			return;
		}
		const header = element.querySelector('.combat-tracker-header, .directory-header, header');
		if (!header) {
			return;
		}
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.negotiationStart = '';
		button.className = 'dnd4e-combat-start__tracker-button';
		button.title = 'Start Negotiation';
		button.setAttribute('aria-label', 'Start Negotiation');
		button.innerHTML = '<i class="fa-solid fa-comments" aria-hidden="true"></i>';
		button.addEventListener('click', () => openNegotiationControls(game.settings.get(MODULE_ID, SETTING)));
		(header.querySelector('.battle-momentum-tracker-controls') ?? header).append(button);
	});
	for (const hook of ['canvasReady', 'createToken', 'updateToken', 'deleteToken', 'updateActor']) {
		Hooks.on(hook, () => {
			if (controls?.rendered && !controls.busy) {
				controls.capture();
				controls.render();
			}
		});
	}
	synchronize(game.settings.get(MODULE_ID, SETTING));
	ui.combat?.render();
}

/** Update every connected player's view from public data only. */
function synchronize(state) {
	if (!state?.active) {
		void display?.close();
		return;
	}
	display ??= new NegotiationDisplay();
	display.snapshot = state.snapshot;
	display.render(true);
	if (game.user.isGM && !controls) {
		openNegotiationControls(state);
	}
}

/**
 * Recover only the currently presented negotiation, never a browsable saved session.
 * Older presentations may have no private state; the GM still gets a dismiss control.
 */
function openNegotiationControls(state) {
	controls ??= new NegotiationControls();
	if (state?.active && !controls.session) {
		const entry = records('active').find(entry => entry.id === state.gmStateId);
		const current = entry?.getFlag(MODULE_ID, FLAG)?.data;
		if (current?.session && current.sessionId === state.sessionId) {
			controls.session = structuredClone(current.session);
			controls.sessionId = current.sessionId;
			controls.gmStateId = entry.id;
			controls.persistedSession = structuredClone(current.session);
			controls.dcLevelOverride = current.dcLevelOverride ?? '';
			controls.activeTab = 'resolution';
		}
	}
	controls.render(true);
}

/** Saved records are GM-private, including all individually owned permissions. */
function records(kind) {
	return game.journal.contents.filter(entry => entry.getFlag(MODULE_ID, FLAG)?.kind === kind
		&& Object.entries(entry.ownership).every(([id, level]) => level === 0 || game.users.get(id)?.isGM));
}

/** Save structured private data without placing secrets in public documents. */
async function saveRecord(kind, name, data, existingId) {
	const existing = existingId ? records(kind).find(entry => entry.id === existingId) : null;
	if (existing) {
		await existing.update({ name, [`flags.${MODULE_ID}.${FLAG}`]: { kind, data } });
		return existing;
	}
	let folder = game.folders.find(f => f.type === 'JournalEntry' && f.name === 'Negotiations');
	if (!folder) {
		folder = await Folder.create({ name: 'Negotiations', type: 'JournalEntry' });
	}
	return JournalEntry.create({
		name, folder: folder.id, ownership: { default: 0 },
		flags: { [MODULE_ID]: { [FLAG]: { kind, data } } },
	});
}

/** Shared read-only player window. */
class NegotiationDisplay extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: 'dnd4e-negotiation-display', classes: ['dnd4e-negotiation', 'dnd4e-negotiation-player'],
		position: { width: 300, height: 'auto' }, window: { title: 'Negotiation', resizable: true },
	};
	static PARTS = { main: { template: `${ROOT}/negotiation-display.hbs` } };

	/** Supply the compact portrait and revealed-concerns presentation. */
	async _prepareContext() {
		return { ...this.snapshot };
	}
}

/** Preparation, reusable presets, and live GM resolution, independent of active combat. */
class NegotiationControls extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: 'dnd4e-negotiation-controls', classes: ['dnd4e-negotiation', 'dnd4e-negotiation-setup', 'dnd4e-combat-start-setup'],
		position: { width: 970, height: 780 }, window: { title: 'Start Negotiation — GM', resizable: true },
	};
	static PARTS = { main: { template: `${ROOT}/negotiation-controls.hbs` } };
	activeTab = 'preparation';
	selectedConcern = { kind: 'motivations', index: 0 };
	draft = defaultPreparation();
	session = null;
	sessionId = '';
	gmStateId = '';
	presetId = '';
	persistedSession = null;
	busy = false;
	dcLevelOverride = '';
	pendingSave = Promise.resolve();

	/** Prepare GM reference data and the selected concern without publishing secrets. */
	async _prepareContext() {
		const d = this.session ?? this.draft;
		const dcs = negotiationDcs(canvas.scene?.tokens ?? [], this.dcLevelOverride);

		const concernView = c => ({
			...c, text: concernText(c), override: c.override ?? (c.category === undefined ? c.text : '') ?? '',
			categories: CONCERN_CATEGORIES.map(category => ({ category, selected: category === c.category })),
			customCategory: !c.category,
		});
		if (!d[this.selectedConcern.kind]?.[this.selectedConcern.index]) {
			this.selectedConcern = { kind: d.motivations.length ? 'motivations' : 'pitfalls', index: 0 };
		}
		const groups = ['motivations', 'pitfalls'].map(kind => ({
			kind, label: kind === 'motivations' ? 'Motivations' : 'Pitfalls',
			addCommand: kind === 'motivations' ? 'addMotivation' : 'addPitfall',
			count: d[kind].length,
			concerns: d[kind].map((c, index) => ({
				...concernView(c), kind, index,
				selected: this.selectedConcern.kind === kind && this.selectedConcern.index === index,
			})),
		}));
		const selected = d[this.selectedConcern.kind]?.[this.selectedConcern.index];
		return {
			concernGroups: groups,
			canApplyArguments: !!this.session && canContinue(this.session),
			canApplyMotivating: !!this.session && canContinue(this.session),
			offerLabel: OFFER_LABELS[d.interest],
			argumentRows: [
				{ label: 'Perfect', result: 'perfect', motivating: 'Interest +1 · Patience unchanged', ordinary: 'Interest +1 · Patience −1' },
				{ label: 'Success', result: 'success', motivating: 'Interest +1 · Patience −1', ordinary: 'Interest unchanged · Patience −1' },
				{ label: 'Failure', result: 'failure', motivating: 'Interest unchanged · Patience −1', ordinary: 'Interest −1 · Patience −1' },
				{ label: 'Catastrophic', result: 'catastrophic', motivating: 'Interest −1 · Patience −1', ordinary: 'Interest −1 · Patience −1' },
			],
			selectedConcern: selected ? { ...concernView(selected), ...this.selectedConcern, kindLabel: this.selectedConcern.kind === 'motivations' ? 'Motivation' : 'Pitfall', canMarkUsed: !!this.session && this.selectedConcern.kind === 'motivations' } : null,
			d: { ...d, motivations: d.motivations.map(concernView), pitfalls: d.pitfalls.map(concernView) }, live: !!this.session, status: this.session ? sessionStatus(this.session) : '',
			hasActivePresentation: !!game.settings.get(MODULE_ID, SETTING)?.active,
			dcs, dcLevelOverride: this.dcLevelOverride, sceneName: canvas.scene?.name ?? 'No active scene',
			subject: this.session?.subject ?? (this.draft.actorUuid ? await fromUuid(this.draft.actorUuid) : game.actors.get(d.actorId)),
			tabs: ['preparation', 'concerns', 'offers', 'resolution'].map(key => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), active: key === this.activeTab })),
			showPreparation: this.activeTab === 'preparation', showConcerns: this.activeTab === 'concerns', showOffers: this.activeTab === 'offers', showResolution: this.activeTab === 'resolution',
			attitudes: Object.keys(ATTITUDES).map(key => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), selected: key === d.attitude })),
			hasPresets: records('preset').length > 0,
			presets: records('preset').map(e => ({ id: e.id, name: e.name, selected: e.id === this.presetId })),
			offers: d.offers.map((text, index) => ({ text, index })),
			visibility: Object.entries(d.visible).filter(([key]) => ['interest', 'patience'].includes(key)).map(([key, value]) => ({ key, value })),
		};
	}

	/** Bind to the newly rendered part; all mutations run serially and report errors. */
	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element;
		const dropZone = root.querySelector('[data-actor-drop]');
		dropZone?.addEventListener('dragover', event => {
			event.preventDefault();
			dropZone.classList.add('is-dragover');
		});
		dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));
		dropZone?.addEventListener('drop', event => void this.onActorDrop(event));
		root.querySelector('[name="dcLevelOverride"]')?.addEventListener('input', event => {
			const value = event.target.value;
			if (value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 30)) {
				return;
			}
			this.dcLevelOverride = value;
			const dcs = negotiationDcs(canvas.scene?.tokens ?? [], value);
			for (const output of root.querySelectorAll('[data-dc]')) {
				output.textContent = dcs[output.dataset.dc] ?? '—';
			}
			if (this.session) {
				this.pendingSave = this.pendingSave.then(() => this.persist()).catch(error => {
					console.error(`${MODULE_ID} | Failed to save negotiation level`, error);
					ui.notifications.error('Negotiation level could not be saved.');
				});
			}
		});
		for (const field of root.querySelectorAll('[name="adjustInterest"], [name="adjustPatience"]')) {
			field.addEventListener('change', () => {
				const value = Number(field.value);
				if (field.value === '' || !Number.isInteger(value) || value < 0 || value > 5) {
					return;
				}
				return this.dispatch({
					target: { closest: () => ({ dataset: { command: 'adjust' } }) },
					preventDefault() {},
				});
			});
		}
		root.querySelector('[name="attitude"]')?.addEventListener('change', event => {
			this.capture();
			[this.draft.interest, this.draft.patience] = ATTITUDES[event.target.value];
			this.render();
		});
		root.querySelector('.negotiation-editor')?.addEventListener('change', event => {
			if (!this.session || this.busy || !event.target.matches('[data-offer], [data-concern] input, [data-concern] select, [data-concern] textarea')) {
				return;
			}
			this.capture();
			this.pendingSave = this.pendingSave.then(() => this.persist()).catch(error => {
				console.error(`${MODULE_ID} | Failed to save negotiation edits`, error);
				ui.notifications.error('Negotiation changes could not be saved.');
			});
		});
		root.querySelector('[data-buttons]')?.addEventListener('click', event => void this.dispatch(event));
		for (const button of root.querySelectorAll('[data-command]')) {
			if (!button.closest('[data-buttons]')) {
				button.addEventListener('click', event => void this.dispatch(event));
			}
		}
	}

	/** Capture unsaved form state before any operation or rerender. */
	capture() {
		const d = this.session ?? this.draft;
		for (const field of this.element.querySelectorAll('[data-field]')) {
			d[field.dataset.field] = field.type === 'number' ? Number(field.value) : field.value;
		}
		for (const field of this.element.querySelectorAll('[data-visible]')) {
			d.visible[field.dataset.visible] = field.checked;
		}
		for (const row of this.element.querySelectorAll('[data-concern]')) {
			const c = d[row.dataset.concern][Number(row.dataset.index)];
			if (!c) {
				continue;
			}
			c.category = row.querySelector('[name="category"]').value;
			c.override = row.querySelector('[name="override"]').value;
			c.text = concernText(c);
			c.description = row.querySelector('[name="description"]').value;
			c.clue = row.querySelector('[name="clue"]').value;
			c.revealed = row.querySelector('[name="revealed"]').checked;
		}
		for (const field of this.element.querySelectorAll('[data-offer]')) {
			d.offers[Number(field.dataset.offer)] = field.value;
		}

	}

	/** Select an actor from Foundry's native document drag payload. */
	async onActorDrop(event) {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.classList.remove('is-dragover');
		if (this.busy || this.session || !game.user.isGM) {
			return;
		}
		this.busy = true;
		try {
			const data = JSON.parse(event.dataTransfer.getData('text/plain'));
			if (data.type !== 'Actor') {
				throw new Error('Drop an Actor from the Actors directory or a compendium.');
			}
			const actor = data.uuid ? await fromUuid(data.uuid) : game.actors.get(data.id);
			if (!actor || actor.documentName !== 'Actor') {
				throw new Error('The dropped actor could not be found.');
			}
			this.capture();
			this.draft.actorId = actor.id;
			this.draft.actorUuid = actor.uuid;
			await this.render();
		} catch (error) {
			ui.notifications.error(error.message);
		} finally {
			this.busy = false;
		}
	}

	/** Checkpoint the current private GM state before publishing a sanitized presentation. */
	async persist(publish = false) {
		if (this.persistedSession && this.session.history.length === this.persistedSession.history.length) {
			const before = structuredClone(this.persistedSession);
			const current = structuredClone(this.session);
			delete before.history;
			delete current.history;
			if (JSON.stringify(before) !== JSON.stringify(current)) {
				this.session.history.push({ before, message: 'GM updated negotiation content or reveals' });
			}
		}
		const active = game.settings.get(MODULE_ID, SETTING);
		const entry = await saveRecord('active', 'Current Negotiation', {
			sessionId: this.sessionId, session: this.session, dcLevelOverride: this.dcLevelOverride,
		}, this.gmStateId || records('active')[0]?.id);
		this.gmStateId = entry.id;
		if (publish || (active.active && active.sessionId === this.sessionId)) {
			await game.settings.set(MODULE_ID, SETTING, { active: true, sessionId: this.sessionId, gmStateId: this.gmStateId, snapshot: publicSnapshot(this.session) });
		}
		this.persistedSession = structuredClone(this.session);
	}

	/** Guard asynchronous UI actions and keep the authoritative state on write failures. */
	async dispatch(event) {
		const button = event.target.closest('[data-command]');
		if (!button || this.busy || !game.user.isGM) {
			return;
		}
		event.preventDefault();
		this.busy = true;
		await this.pendingSave;
		const original = this.session ? structuredClone(this.session) : null;
		const originalId = this.sessionId;
		const originalPersisted = this.persistedSession;
		try {
			this.capture();
			const command = button.dataset.command;
			const d = this.session ?? this.draft;
			if (command === 'tab') {
				this.activeTab = button.dataset.tab;
			} else if (command === 'refreshDcs') {
				if (this.dcLevelOverride !== '' && (!Number.isInteger(Number(this.dcLevelOverride)) || Number(this.dcLevelOverride) < 1 || Number(this.dcLevelOverride) > 30)) {
					throw new Error('Choose a whole level from 1 to 30, or clear the override to use the scene average.');
				}
			} else if (command === 'selectConcern') {
				this.selectedConcern = { kind: button.dataset.kind, index: Number(button.dataset.index) };
			} else if (command === 'toggleConcernUsed') {
				if (this.session && this.selectedConcern.kind === 'motivations') {
					const concern = d.motivations[this.selectedConcern.index];
					concern.used = !concern.used;
					await this.persist();
				}
			} else if (command === 'toggleConcernReveal') {
				const concern = d[this.selectedConcern.kind][this.selectedConcern.index];
				concern.revealed = !concern.revealed;
				if (this.session) {
					await this.persist();
				}
			} else if (command === 'clearActor') {
				this.draft.actorId = '';
				this.draft.actorUuid = '';
			} else if (command === 'addMotivation' || command === 'addPitfall') {
				const kind = command === 'addMotivation' ? 'motivations' : 'pitfalls';
				d[kind].push({ category: CONCERN_CATEGORIES[0], override: '', description: '', clue: '', revealed: false, used: false });
				this.selectedConcern = { kind, index: d[kind].length - 1 };
			} else if (command === 'removeConcern') {
				const kind = button.dataset.kind;
				const index = Number(button.dataset.index);
				d[kind].splice(index, 1);
				this.selectedConcern = { kind, index: Math.max(0, Math.min(index, d[kind].length - 1)) };
				if (this.session) {
					await this.persist();
				}
			} else if ((command === 'savePreset' || command === 'savePresetAs')) {
				if (!d.name.trim()) {
					throw new Error('Give the negotiation a name.');
				}
				const entry = await saveRecord('preset', d.name, this.draft, command === 'savePresetAs' ? '' : this.presetId);
				this.presetId = entry.id;
				ui.notifications.info('Negotiation preset saved.');
			} else if (command === 'loadPreset') {
				const id = this.element.querySelector('[name="presetId"]').value;
				const entry = records('preset').find(e => e.id === id);
				if (!entry) {
					throw new Error('Choose a saved preset.');
				}
				this.draft = structuredClone(entry.getFlag(MODULE_ID, FLAG).data);
				this.presetId = id;
				this.selectedConcern = { kind: 'motivations', index: 0 };
				this.activeTab = 'preparation';
			} else if (command === 'newPreset') {
				this.draft = defaultPreparation();
				this.presetId = '';
			} else if (command === 'deletePreset') {
				const id = this.element.querySelector('[name="presetId"]').value;
				const entry = records('preset').find(e => e.id === id);
				if (entry && await foundry.applications.api.DialogV2.confirm({ window: { title: 'Delete negotiation preset?' }, content: '<p>Delete this reusable preset?</p>' })) {
					await entry.delete();
					this.presetId = '';
				}
			} else if (command === 'start') {
				const actor = this.draft.actorUuid ? await fromUuid(this.draft.actorUuid) : game.actors.get(this.draft.actorId);
				if (!actor || actor.documentName !== 'Actor') {
					throw new Error('Drop an actor into the subject panel.');
				}
				this.session = startSession(this.draft, actor);
				this.sessionId = foundry.utils.randomID();
				this.persistedSession = null;
				this.activeTab = 'resolution';
				await this.persist(true);
			} else if (command === 'prepare' || command === 'dismissPresentation') {
				const active = game.settings.get(MODULE_ID, SETTING);
				await game.settings.set(MODULE_ID, SETTING, {});
				const entry = records('active').find(entry => entry.id === (this.gmStateId || active.gmStateId));
				await entry?.delete();
				this.gmStateId = '';
				this.session = null;
				this.sessionId = '';
				this.persistedSession = null;
				this.activeTab = 'preparation';
			} else if (command === 'adjust' || command === 'end' || command === 'applyArgument') {
				const action = command === 'applyArgument'
					? { type: 'argument', kind: button.dataset.kind, result: button.dataset.result, natural: button.dataset.natural, trackOnly: true }
					: command === 'adjust'
					? { type: 'adjust', interest: this.element.querySelector('[name="adjustInterest"]').value, patience: this.element.querySelector('[name="adjustPatience"]').value }
					: { type: 'end', ending: button.dataset.ending };
				this.session = resolveAction(this.session, action);
				if (this.persistedSession) {
					const before = structuredClone(this.persistedSession);
					delete before.history;
					this.session.history.at(-1).before = before;
				}
				await this.persist();
			} else if (command === 'undo') {
				this.session = undoSession(this.session);
				await this.persist();
			} else if (command === 'hide') {
				await this.persist();
				await game.settings.set(MODULE_ID, SETTING, {});
			} else if (command === 'show' || command === 'update') {
				if (original) {
					const before = structuredClone(this.persistedSession ?? original);
					delete before.history;
					this.session.history.push({ before, message: 'GM updated concerns, offers, or reveals' });
				}
				await this.persist(command === 'show');
			}
			await this.render();
		} catch (error) {
			this.session = original;
			this.sessionId = originalId;
			this.persistedSession = originalPersisted;
			console.error(`${MODULE_ID} | Negotiation action failed`, error);
			ui.notifications.error(error.message);
		} finally {
			this.busy = false;
		}
	}
}
