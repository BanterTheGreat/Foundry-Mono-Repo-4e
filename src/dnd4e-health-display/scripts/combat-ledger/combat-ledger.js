import { MODULE_ID, BINDINGS_SETTING, actorResources, participantData, createReport, tickReport,
	ensureParticipant, finishTurn, markActivity, resourceSnapshot, snapshotRound, recordHealth,
	recordMessage, messageParticipant, isAttackRoll, restoreParticipantKeys } from "./ledger-data.js";
import { configureLedgerUI, addLedgerButton, refreshLedger } from "./ledger-ui.js";
export { registerLedgerSettings } from "./ledger-ui.js";

const CHANNEL = `module.${MODULE_ID}`;
let reports = {};
let lastReportId = null;
let dirty = false;
let saveTimer = null;
let savePromise = null;
let storageError = false;
let journal = null;
let recorderId = null;

/**
 * Observers always return undefined, including when their work fails or returns false.
 * Never await these callbacks from an original action or install cancellation hooks/wrappers.
 */
export function observeLedger(action) {
	return (...args) => {
		try {
			Promise.resolve(action(...args)).catch(reportFailure);
		} catch (error) {
			reportFailure(error);
		}
	};
}

/** Report a recording problem without allowing notification/render failures to escape. */
function reportFailure(error) {
	try {
		console.warn(`${MODULE_ID} | Combat Ledger recording failed; original action is unaffected`, error);
	} catch (_) {
		// Diagnostics must be as isolated as the recorder itself.
	}
}

/** Only one connected GM records shared document events. */
function isRecorder() {
	return game.user.isGM && game.users.activeGM?.id === game.user.id;
}

/** Read validated world bindings; unavailable settings leave the raw report usable. */
function bindings() {
	return game.settings.get(MODULE_ID, BINDINGS_SETTING)?.bindings ?? [];
}

/** Refresh the GM report and schedule an independent, debounced storage operation. */
function changed() {
	dirty = true;
	observeLedger(refreshLedger)();
	if (saveTimer === null) {
		saveTimer = setTimeout(() => {
			saveTimer = null;
			observeLedger(saveLedger)();
		}, 750);
	}
}

/**
 * Persist current encounters plus the last ended encounter in a private Journal.
 * The dirty flag is cleared only for the successfully saved revision; rejection remains retryable.
 */
export async function saveLedger() {
	if (!isRecorder() || !dirty || savePromise) {
		return savePromise;
	}
	const snapshot = structuredClone({ version: 1, reports, lastReportId });
	dirty = false;
	savePromise = (async () => {
		try {
			if (!journal || !game.journal.has(journal.id)) {
				journal = await JournalEntry.create({ name: "Combat Ledger · GM records",
					ownership: { default: 0 }, flags: { [MODULE_ID]: { combatLedgerStorage: true } } });
			}
			if (!isRecorder()) {
				dirty = true;
				return;
			}
			// UUID object keys contain dots, which Foundry can expand into document paths.
			await journal.setFlag(MODULE_ID, "combatLedger", JSON.stringify(snapshot));
			storageError = false;
		} catch (error) {
			dirty = true;
			storageError = true;
			reportFailure(error);
		} finally {
			savePromise = null;
			observeLedger(refreshLedger)();
		}
	})();
	return savePromise;
}

/** Recover persisted reports without treating time spent disconnected as measured turn time. */
function loadLedger(recover = false) {
	journal = game.journal.find(entry => entry.flags?.[MODULE_ID]?.combatLedgerStorage);
	const raw = journal?.flags?.[MODULE_ID]?.combatLedger;
	const stored = typeof raw === "string" ? JSON.parse(raw) : raw;
	if (stored?.version === 1 && stored.reports && !dirty) {
		reports = structuredClone(stored.reports);
		lastReportId = stored.lastReportId;
		for (const report of Object.values(reports)) {
			report.participants = restoreParticipantKeys(report.participants);
			report.baselines = restoreParticipantKeys(report.baselines);
			if (recover && !report.endedAt) {
				report.lastTick = Date.now();
				report.paused = game.paused;
				report.gaps = true;
			}
		}
	}
}

/** List the running record for a particular combat. */
function runningReport(combat) {
	return Object.values(reports).find(report => report.combatId === combat.id && !report.endedAt);
}

/** Enroll combatants without resetting existing HP baselines or counters. */
function enroll(combat, report) {
	for (const combatant of combat.combatants) {
		const participant = ensureParticipant(report, participantData(combatant));
		if (participant) {
			participant.removed = false;
		}
	}
	// Keep a hidden baseline for scene tokens which may join the encounter later.
	report.baselines ??= {};
	for (const token of game.scenes?.get(report.sceneId)?.tokens ?? []) {
		const data = participantData({ actor: token.actor, token });
		if (data && !report.baselines[data.key]) {
			report.baselines[data.key] = data;
		}
	}
}

/** Refresh recovered HP without attributing changes made while this recorder was absent. */
function recoverHealth(combat, report) {
	if (!report) {
		return;
	}
	report.lastTick = Date.now();
	report.paused = game.paused;
	report.gaps = true;
	enroll(combat, report);
	for (const participant of [...Object.values(report.participants), ...Object.values(report.baselines ?? {})]) {
		const token = game.scenes?.get(report.sceneId)?.tokens?.get?.(participant.tokenId)
			?? [...combat.combatants].find(entry => entry.token?.uuid === participant.tokenUuid)?.token;
		if (token?.actor) {
			Object.assign(participant, actorResources(token.actor));
			if (participant.hp <= 0 && "defeatedOnce" in participant) {
				participant.defeatedOnce = true;
			}
		}
	}
}

/** Start tracking at round one, or label a late installation/recovery as incomplete. */
function ensureReport(combat, partial = false) {
	let report = runningReport(combat);
	if (!report && combat.started) {
		report = createReport(combat, Date.now(), game.paused, partial);
		reports[report.id] = report;
		enroll(combat, report);
		report.rounds.push({ round: 0, ...resourceSnapshot(report, bindings()), playerDamage: 0,
			enemyDamage: 0, unattributedDamage: 0, partial: false, initial: true });
	}
	return report;
}

/** Observe committed combat state, rather than the pre-update combatStart/turn hooks. */
function combatChanged(combat, changes = {}) {
	if (!isRecorder()) {
		return;
	}
	const previous = runningReport(combat);
	if (!combat.started) {
		if (previous) {
			endReport(previous);
		}
		return;
	}
	const report = ensureReport(combat, !(changes.round === 1));
	tickReport(report, Date.now());
	enroll(combat, report);
	const marker = `${combat.round}:${combat.combatant?.id ?? "none"}`;
	if (report.marker !== marker) {
		finishTurn(report);
		if (report.round !== combat.round) {
			const ending = report.rounds.find(entry => entry.round === report.round && entry.partial);
			if (ending) {
				ending.partial = false;
			}
			report.round = combat.round;
		}
		report.marker = marker;
		const participant = combat.combatant ? ensureParticipant(report, participantData(combat.combatant)) : null;
		if (participant) {
			report.turn = { key: participant.key, elapsedMs: 0, contemplatingMs: 0, acted: false };
		}
	}
	snapshotRound(report, bindings());
	changed();
}

/** Preserve the final partial-round snapshot and retain exactly the latest ended encounter. */
function endReport(report) {
	tickReport(report, Date.now());
	finishTurn(report);
	snapshotRound(report, bindings());
	report.endedAt = Date.now();
	lastReportId = report.id;
	for (const [id, entry] of Object.entries(reports)) {
		if (entry.endedAt && id !== lastReportId) {
			delete reports[id];
		}
	}
	changed();
}

/** Resolve a matching native/automation receipt already persisted before HP application. */
function damageSource(report, target, health) {
	for (const message of game.messages) {
		const flags = message.flags?.[MODULE_ID];
		const request = flags?.damageApplication;
		const receipt = flags?.damageApplications?.[target.tokenId];
		if (request?.sceneId !== report.sceneId || receipt?.state !== "applying"
			|| receipt.health?.before !== target.hp || receipt.health?.tempBefore !== target.temp
			|| receipt.health?.after !== health.hp || receipt.health?.tempAfter !== health.temp) {
			continue;
		}
		const attack = flags.attackResults;
		const participant = messageParticipant(report, { tokenId: attack?.casterId ?? message.speaker?.token,
			actorId: message.speaker?.actor, actorUuid: request.itemUuid?.split(".Item.")[0] });
		if (participant) {
			return { key: participant.key, estimated: false };
		}
	}
	return { key: report.turn?.key, estimated: true };
}

/** Observe committed actor HP; manual edits use the current turn's actor as an explicit estimate. */
function actorChanged(actor) {
	if (!isRecorder()) {
		return;
	}
	const health = actorResources(actor);
	for (const report of Object.values(reports).filter(entry => !entry.endedAt)) {
		for (const baseline of Object.values(report.baselines ?? {})) {
			if (baseline.actorUuid === actor.uuid && ["hp", "temp", "surges", "maxHp", "maxSurges"].some(key => baseline[key] !== health[key])) {
				ensureParticipant(report, baseline);
			}
		}
		const targets = Object.values(report.participants).filter(entry => entry.actorUuid === actor.uuid && !entry.removed);
		if (!targets.length) {
			continue;
		}
		for (const baseline of Object.values(report.baselines ?? {}).filter(entry => entry.actorUuid === actor.uuid)) {
			Object.assign(baseline, health);
		}
		if (!targets.some(target => ["hp", "temp", "surges", "maxHp", "maxSurges"].some(key => target[key] !== health[key]))) {
			continue;
		}
		tickReport(report, Date.now());
		const target = targets.find(entry => entry.key === report.turn?.key) ?? targets[0];
		const source = target.hp > health.hp || target.temp > health.temp
			? damageSource(report, target, health) : { key: null, estimated: false };
		recordHealth(report, target, health, source.key, source.estimated, bindings());
		for (const other of targets.filter(entry => entry !== target)) {
			Object.assign(other, health);
		}
		snapshotRound(report, bindings());
		changed();
	}
}

/** Read messages once per ID; subsequent edits replace their attack/dice contribution. */
function chatChanged(message, created = false) {
	if (!isRecorder()) {
		return;
	}
	for (const report of Object.values(reports).filter(entry => !entry.endedAt)) {
		if (!report.attacks[message.id] && message.timestamp < report.startedAt) {
			continue;
		}
		const flags = message.flags ?? {};
		const context = flags[MODULE_ID]?.attackResults;
		const defense = flags.playerDefense;
		const sceneId = context?.sceneId ?? defense?.sceneId ?? message.speaker?.scene;
		if (sceneId && report.sceneId && sceneId !== report.sceneId) {
			continue;
		}
		const sourceUuid = message.rolls?.find(roll => roll.options?.banterAttackSource)?.options.banterAttackSource.actorUuid
			?? flags.dnd4e?.actorUuid;
		const sourceToken = context?.casterId ?? defense?.attackerTokenId ?? message.speaker?.token;
		const actorId = defense?.attackerId ?? message.speaker?.actor;
		const tokenIds = new Set([sourceToken, ...(context?.targetIds ?? []),
			...(defense?.targets ?? []).map(target => target.tokenId),
			...(message.rolls ?? []).map(roll => roll.options?.multirollData?.targetID)].filter(Boolean));
		for (const baseline of Object.values(report.baselines ?? {})) {
			if (tokenIds.has(baseline.tokenId) || (!sourceToken && (baseline.actorUuid === sourceUuid || baseline.actorId === actorId))) {
				ensureParticipant(report, baseline);
			}
		}
		const known = recordMessage(report, message);
		const preview = message.flags?.[MODULE_ID]?.powerActivation?.provisional;
		const attackRoll = (message.rolls ?? []).some(roll => isAttackRoll(roll, message))
			|| message.flags?.playerDefense;
		if (created && (preview || attackRoll)) {
			const flags = message.flags;
			const participant = messageParticipant(report, { tokenId: flags?.[MODULE_ID]?.attackResults?.casterId
				?? flags?.playerDefense?.attackerTokenId ?? message.speaker?.token,
				actorId: flags?.playerDefense?.attackerId ?? message.speaker?.actor,
				actorUuid: flags?.dnd4e?.actorUuid,
				sceneId: flags?.[MODULE_ID]?.attackResults?.sceneId ?? flags?.playerDefense?.sceneId ?? message.speaker?.scene });
			if (participant) {
				markActivity(report, participant.key, Date.now());
			}
		}
		if (known || preview) {
			changed();
		}
	}
}

/** Accept only the active turn token as a movement/preview/attack activity source. */
function tokenActivity(token) {
	if (!isRecorder()) {
		return;
	}
	for (const report of Object.values(reports).filter(entry => !entry.endedAt)) {
		if (report.turn?.key === token?.uuid) {
			markActivity(report, token.uuid, Date.now());
			changed();
		}
	}
}

/** Send preview activity only, without depending on a successful ledger or network connection. */
function announcePreview(app) {
	if (!app.options?.classes?.includes("power-targeting") || app.session?.state !== "targeting") {
		return;
	}
	const token = app.session.caster?.document;
	if (isRecorder()) {
		tokenActivity(token);
	} else if (token) {
		game.socket.emit(CHANNEL, { type: "combatLedgerActivity", tokenUuid: token.uuid, userId: game.user.id });
	}
}

/**
 * Register after ready; every callback is isolated and none returns a cancellation value.
 * The only writes are to the dedicated private Journal and explicit attribution settings.
 */
export function registerCombatLedger() {
	observeLedger(() => {
		if (game.system.id !== "dnd4e") {
			return;
		}
		configureLedgerUI({ getState: () => ({ reports, lastReportId, storageError, dirty }), retry: saveLedger });
		Hooks.on("renderCombatTracker", observeLedger(addLedgerButton));
		Hooks.on("renderApplicationV2", observeLedger(announcePreview));
		Hooks.on("dnd4e.rollAttack", observeLedger((item, targets, speaker) => {
			const sceneId = speaker?.scene ?? globalThis.canvas?.scene?.id;
			const token = game.scenes?.get(sceneId)?.tokens.get(speaker?.token);
			if (isRecorder()) {
				tokenActivity(token);
			} else if (token) {
				game.socket.emit(CHANNEL, { type: "combatLedgerActivity", tokenUuid: token.uuid, userId: game.user.id });
			}
		}));
		game.socket.on(CHANNEL, observeLedger(message => {
			if (!isRecorder() || message?.type !== "combatLedgerActivity" || typeof message.tokenUuid !== "string") {
				return;
			}
			const user = game.users.get(message.userId);
			// Socket activity is advisory; it never affects documents or combat statistics beyond timing.
			for (const combat of game.combats) {
				const token = combat.combatant?.token;
				if (token?.uuid === message.tokenUuid && user?.active
					&& (user.isGM || token.actor?.testUserPermission(user, "OWNER"))) {
					tokenActivity(token);
				}
			}
		}));
		if (!game.user.isGM) {
			return;
		}
		recorderId = game.users.activeGM?.id;
		loadLedger(isRecorder());
		Hooks.on("updateCombat", observeLedger(combatChanged));
		Hooks.on("deleteCombat", observeLedger(combat => {
			const report = runningReport(combat);
			if (isRecorder() && report) {
				endReport(report);
			}
		}));
		for (const hook of ["createCombatant", "updateCombatant", "deleteCombatant"]) {
			Hooks.on(hook, observeLedger(combatant => {
				if (hook === "deleteCombatant" && isRecorder()) {
					const report = runningReport(combatant.parent);
					const key = combatant.token?.uuid ?? combatant.actor?.uuid;
					if (report?.participants[key]) {
						report.participants[key].removed = true;
					}
				}
				combatChanged(combatant.parent);
			}));
		}
		Hooks.on("createToken", observeLedger(token => {
			if (isRecorder()) {
				for (const combat of game.combats) {
					const report = runningReport(combat);
					if (report?.sceneId === token.parent?.id) {
						enroll(combat, report);
						changed();
					}
				}
			}
		}));
		Hooks.on("updateActor", observeLedger(actorChanged));
		Hooks.on("updateToken", observeLedger((token, changes) => {
			if ("x" in changes || "y" in changes || "elevation" in changes) {
				tokenActivity(token);
			}
			if (changes.delta || changes.actorData) {
				actorChanged(token.actor);
			}
		}));
		Hooks.on("createChatMessage", observeLedger(message => chatChanged(message, true)));
		Hooks.on("updateChatMessage", observeLedger(message => chatChanged(message)));
		Hooks.on("pauseGame", observeLedger(paused => {
			if (isRecorder()) {
				for (const report of Object.values(reports).filter(entry => !entry.endedAt)) {
					tickReport(report, Date.now());
					report.paused = paused;
				}
				changed();
			}
		}));
		Hooks.on("updateJournalEntry", observeLedger(entry => {
			if (!isRecorder() && entry.flags?.[MODULE_ID]?.combatLedgerStorage) {
				loadLedger();
				refreshLedger();
			}
		}));
		Hooks.on("updateUser", observeLedger(() => {
			const nextRecorder = game.users.activeGM?.id;
			if (nextRecorder === recorderId) {
				return;
			}
			recorderId = nextRecorder;
			if (isRecorder()) {
				loadLedger(true);
				for (const combat of game.combats) {
					recoverHealth(combat, runningReport(combat));
					combatChanged(combat);
				}
			}
		}));
		// Recovery cannot reconstruct missed HP edits or timing; explicitly mark gaps.
		if (isRecorder()) {
			for (const report of Object.values(reports).filter(entry => !entry.endedAt)) {
				if (!game.combats.has(report.combatId)) {
					endReport(report);
				}
			}
			for (const combat of game.combats) {
				const report = runningReport(combat);
				if (report?.gaps) {
					recoverHealth(combat, report);
				}
				combatChanged(combat);
			}
			for (const message of game.messages) {
				chatChanged(message);
			}
		}
		setInterval(observeLedger(() => {
			if (!isRecorder()) {
				return;
			}
			for (const report of Object.values(reports).filter(entry => !entry.endedAt)) {
				tickReport(report, Date.now());
				snapshotRound(report, bindings());
				changed();
			}
			if (dirty) {
				observeLedger(saveLedger)();
			}
		}), 15000);
		observeLedger(() => ui.combat?.render())();
	})();
}
