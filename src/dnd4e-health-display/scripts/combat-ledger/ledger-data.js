/** Combat Ledger records are plain, GM-owned JSON; no document mutations belong here. */
export const MODULE_ID = "dnd4e-health-display";
export const BINDINGS_SETTING = "combatLedgerBindings";

/** Read only finite numeric game data. */
function number(value) {
	return Number.isFinite(Number(value)) ? Number(value) : 0;
}

/** Snapshot the resources used by DnD4e 0.9.3, including synthetic token actors. */
export function actorResources(actor) {
	const attributes = actor?.system?.attributes ?? {};
	const surges = actor?.system?.details?.surges ?? {};
	return { hp: number(attributes.hp?.value), maxHp: number(attributes.hp?.max),
		temp: number(attributes.temphp?.value), surges: number(surges.value), maxSurges: number(surges.max) };
}

/** Retain token identity for bindings and actor identity for default row grouping. */
export function participantData(combatant) {
	const actor = combatant.actor;
	const token = combatant.token;
	if (!actor) {
		return null;
	}
	const pc = actor.type === "Player Character";
	const disposition = token?.disposition ?? (pc ? 1 : 0);
	return { key: token?.uuid ?? actor.uuid, actorUuid: actor.uuid,
		baseActorUuid: actor.isToken ? `Actor.${actor.id}` : actor.uuid,
		actorId: actor.id, tokenId: token?.id ?? combatant.tokenId, tokenUuid: token?.uuid,
		name: actor.name, tokenName: token?.name ?? actor.name, pc,
		team: disposition === -1 ? "enemy" : pc ? "pc" : disposition === 1 ? "friendly" : "neutral",
		...actorResources(actor) };
}

/** Start a session, or explicitly mark a recording begun after combat was underway. */
export function createReport(combat, now, paused, partial = false) {
	return { version: 1, id: `${combat.id}:${now}`, combatId: combat.id, sceneId: combat.scene?.id ?? null,
		name: combat.name || combat.scene?.name || "Combat", startedAt: now, endedAt: null,
		lastTick: now, paused, elapsedMs: 0, partial, gaps: false, participants: {}, baselines: {},
		turn: null, marker: null, round: combat.round || 1, rounds: [], attacks: {}, unattributedDamage: 0 };
}

/** Advance clocks once, excluding pauses. Offline time is never guessed during recovery. */
export function tickReport(report, now) {
	const delta = Math.max(0, now - report.lastTick);
	report.lastTick = now;
	if (report.paused || report.endedAt) {
		return;
	}
	report.elapsedMs += delta;
	if (report.turn) {
		report.turn.elapsedMs += delta;
		if (!report.turn.acted) {
			report.turn.contemplatingMs += delta;
		}
	}
}

/** Add a participant once, retaining counters when documents subsequently change. */
export function ensureParticipant(report, data) {
	if (!data) {
		return null;
	}
	let participant = report.participants[data.key];
	if (!participant) {
		participant = report.participants[data.key] = { ...data, turns: [], damage: 0, estimatedDamage: 0,
			slain: 0, estimatedSlain: 0, defeatedOnce: data.hp <= 0, removed: false };
	}
	return participant;
}

/** A completed turn contributes its own duration; companion turns never overlap into one timer. */
export function finishTurn(report) {
	if (report.turn) {
		report.participants[report.turn.key]?.turns.push({ elapsedMs: report.turn.elapsedMs,
			contemplatingMs: report.turn.contemplatingMs });
	}
	report.turn = null;
}

/** Opening a preview, moving, or rolling stops only this token's contemplation timer. */
export function markActivity(report, key, now) {
	tickReport(report, now);
	if (report.turn?.key === key) {
		report.turn.acted = true;
	}
}

/** Resolve token overrides before actor-wide attribution. Settings prohibit cycles. */
export function bindingOwner(participant, bindings = []) {
	return bindings.find(binding => binding.source === participant.tokenUuid)?.owner
		?? bindings.find(binding => binding.source === participant.baseActorUuid || binding.source === participant.actorUuid)?.owner;
}

/** Sum resources rather than averaging individual percentages; linked PCs count once. */
export function resourceSnapshot(report, bindings = []) {
	let playerHp = 0, playerMax = 0, surges = 0, maxSurges = 0, enemyHp = 0, enemyMax = 0;
	const pcs = new Set();
	for (const actor of Object.values(report.participants)) {
		if (actor.pc && actor.team === "pc" && !bindingOwner(actor, bindings) && !pcs.has(actor.actorUuid)) {
			pcs.add(actor.actorUuid);
			playerHp += actor.removed ? 0 : Math.max(0, actor.hp);
			playerMax += actor.maxHp;
			surges += actor.surges;
			maxSurges += actor.maxSurges;
		} else if (actor.team === "enemy") {
			enemyHp += actor.removed ? 0 : Math.max(0, actor.hp);
			enemyMax += actor.maxHp;
		}
	}
	const ratio = (value, max) => max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : null;
	return { playerHp: ratio(playerHp, playerMax), playerSurges: ratio(surges, maxSurges), enemyHp: ratio(enemyHp, enemyMax) };
}

/** Refresh only the open round; completed snapshots remain historical facts. */
export function snapshotRound(report, bindings = []) {
	let round = report.rounds.find(entry => entry.round === report.round && entry.partial);
	if (!round) {
		round = { round: report.round, partial: true, playerDamage: 0, enemyDamage: 0, unattributedDamage: 0 };
		report.rounds.push(round);
	}
	Object.assign(round, resourceSnapshot(report, bindings));
	return round;
}

/** Observe actual HP/temp-HP loss, never rolled damage, so applying a roll cannot double-count. */
export function recordHealth(report, target, resources, sourceKey, estimated, bindings = []) {
	const loss = Math.max(0, target.hp - resources.hp) + Math.max(0, target.temp - resources.temp);
	const source = report.participants[sourceKey];
	const slain = target.team === "enemy" && target.hp > 0 && resources.hp <= 0 && !target.defeatedOnce;
	if (slain) {
		target.defeatedOnce = true;
	}
	for (const key of ["hp", "maxHp", "temp", "surges", "maxSurges"]) {
		target[key] = number(resources[key]);
	}
	if (source) {
		source.damage += loss;
		source.estimatedDamage += estimated ? loss : 0;
		source.slain += slain ? 1 : 0;
		source.estimatedSlain += slain && estimated ? 1 : 0;
	} else {
		report.unattributedDamage += loss;
	}
	const round = snapshotRound(report, bindings);
	if (source?.team === "enemy") {
		round.enemyDamage += loss;
	} else if (source && ["pc", "friendly"].includes(source.team)) {
		round.playerDamage += loss;
	} else {
		round.unattributedDamage += loss;
	}
	return loss;
}

/** Select active, kept natural d20s; modifiers and discarded rerolls never affect the average. */
export function naturalD20(roll) {
	return (roll.dice ?? []).filter(die => die.faces === 20).flatMap(die => die.results ?? [])
		.filter(result => result.active !== false && !result.discarded && !result.rerolled)
		.map(result => result.result).filter(value => Number.isFinite(value) && value >= 1 && value <= 20);
}

/** Resolve immutable message identities, never the GM's currently selected targets. */
export function messageParticipant(report, { tokenId, actorId, actorUuid, sceneId } = {}) {
	if (sceneId && report.sceneId && sceneId !== report.sceneId) {
		return null;
	}
	const entries = Object.values(report.participants);
	if (tokenId) {
		const match = entries.find(entry => entry.tokenId === tokenId);
		if (match) {
			return match;
		}
	}
	return entries.find(entry => actorUuid && [entry.actorUuid, entry.baseActorUuid].includes(actorUuid))
		?? entries.find(entry => actorId && entry.actorId === actorId) ?? null;
}

/** Recognize structured attack metadata without inspecting localized chat HTML. */
export function isAttackRoll(roll, message) {
	return Boolean(roll.options?.multirollData || roll.options?.banterAttackSource
		|| roll.options?.flags?.dnd4e?.roll?.type === "attack" || message.flags?.dnd4e?.roll?.type === "attack");
}

/**
 * Replace one message's contribution on confirmation or manual edits, making repeated updates idempotent.
 * Active-defense outcomes are attacker outcomes: normal/critical hit; miss is a successful defense.
 * A pending automation message contributes d20s, but no final hit/miss verdicts yet.
 */
export function recordMessage(report, message) {
	if (message.isContentVisible === false) {
		return false;
	}
	const flags = message.flags ?? {};
	const context = flags[MODULE_ID]?.attackResults;
	const defense = flags.playerDefense;
	const sceneId = context?.sceneId ?? defense?.sceneId ?? message.speaker?.scene;
	if (sceneId && report.sceneId && sceneId !== report.sceneId) {
		return false;
	}
	const source = message.rolls?.find(roll => roll.options?.banterAttackSource)?.options.banterAttackSource;
	const attacker = messageParticipant(report, {
		tokenId: context?.casterId ?? defense?.attackerTokenId ?? message.speaker?.token,
		actorId: defense?.attackerId ?? message.speaker?.actor,
		actorUuid: source?.actorUuid ?? flags.dnd4e?.actorUuid,
		sceneId: context?.sceneId ?? defense?.sceneId ?? message.speaker?.scene,
	});
	const previous = report.attacks[message.id];
	const contribution = { attacker: attacker?.key, attempts: [], dice: [] };
	const pending = context?.pending === true;
	const defenseIds = new Set((defense?.targets ?? []).map(target => target.tokenId));
	for (const roll of message.rolls ?? []) {
		const native = roll.options?.multirollData;
		const defenseToken = roll.options?.banterDefenseTarget;
		const roller = defenseToken ? messageParticipant(report, { tokenId: defenseToken }) : attacker;
		// Defense dice are read from targets below, once, even when appended to rolls for animations.
		if (!defenseToken && roller) {
			contribution.dice.push(...naturalD20(roll).map(value => ({ key: roller.key, value })));
		}
		if (!native || defenseToken || roll.options?.playerDefense || defenseIds.has(native.targetID)) {
			continue;
		}
		if (context && !context.targetIds?.includes(native.targetID)) {
			continue;
		}
		const target = messageParticipant(report, { tokenId: native.targetID });
		const outcome = ["critical", "fumble", "immune"].includes(native.critstate) ? native.critstate : native.hitstate;
		contribution.attempts.push({ target: target?.key, outcome: pending ? "pending" : outcome || "unknown" });
	}
	if (!contribution.attempts.length && !defense && (message.rolls ?? []).some(roll => isAttackRoll(roll, message))) {
		contribution.attempts.push({ outcome: "unknown" });
	}
	for (const target of defense?.targets ?? []) {
		if (context && !context.targetIds?.includes(target.tokenId)) {
			continue;
		}
		const participant = messageParticipant(report, { tokenId: target.tokenId, actorId: target.actorId, sceneId: target.sceneId });
		if (participant && target.resolved && Number.isFinite(target.natural)) {
			contribution.dice.push({ key: participant.key, value: target.natural });
		}
		contribution.attempts.push({ target: participant?.key,
			outcome: pending || !target.resolved ? "pending" : target.outcome === "normal" ? "hit" : target.outcome });
	}
	if (!contribution.dice.length && !contribution.attempts.length && !previous) {
		return false;
	}
	// Preserve attribution for a later chat update after the speaker/token is no longer available.
	contribution.attacker ??= previous?.attacker;
	report.attacks[message.id] = contribution;
	return true;
}

/** Aggregate attributed rows from raw totals, preserving weighted averages and original teams. */
export function reportRows(report, bindings = [], actorNames = {}) {
	const rows = new Map();
	const destinations = new Map();
	for (const participant of Object.values(report.participants)) {
		const owner = participant.team !== "enemy" ? bindingOwner(participant, bindings) : null;
		const id = owner ?? participant.actorUuid;
		destinations.set(participant.key, id);
		if (!rows.has(id)) {
			const ownerParticipant = Object.values(report.participants).find(entry => entry.actorUuid === id || entry.baseActorUuid === id);
			rows.set(id, { id, name: actorNames[id] ?? ownerParticipant?.name ?? participant.name,
				team: ownerParticipant?.team ?? (owner ? "pc" : participant.team), includes: [], turns: 0,
				turnMs: 0, contemplatingMs: 0, activeTurnMs: 0, activeContemplatingMs: 0, damage: 0,
				estimatedDamage: 0, slain: 0, estimatedSlain: 0, hit: 0, attempts: 0, received: 0,
				incoming: 0, unknown: 0, unknownIncoming: 0, d20Sum: 0, d20Count: 0 });
		}
		const row = rows.get(id);
		if (owner && !row.includes.includes(participant.tokenName)) {
			row.includes.push(participant.tokenName);
		}
		row.turns += participant.turns.length;
		for (const turn of participant.turns) {
			row.turnMs += turn.elapsedMs;
			row.contemplatingMs += turn.contemplatingMs;
		}
		for (const key of ["damage", "estimatedDamage", "slain", "estimatedSlain"]) {
			row[key] += participant[key];
		}
		if (report.turn?.key === participant.key) {
			row.activeTurnMs += report.turn.elapsedMs;
			row.activeContemplatingMs += report.turn.contemplatingMs;
			row.active = true;
		}
	}
	const rowFor = key => rows.get(destinations.get(key));
	for (const attack of Object.values(report.attacks)) {
		const source = rowFor(attack.attacker);
		for (const attempt of attack.attempts) {
			const target = rowFor(attempt.target);
			const resolved = ["hit", "critical", "miss", "fumble", "immune"].includes(attempt.outcome);
			const hit = ["hit", "critical"].includes(attempt.outcome);
			if (source) {
				source.attempts += resolved ? 1 : 0;
				source.hit += hit ? 1 : 0;
				source.unknown += resolved ? 0 : 1;
			}
			if (target) {
				target.incoming += resolved ? 1 : 0;
				target.received += hit ? 1 : 0;
				target.unknownIncoming += resolved ? 0 : 1;
			}
		}
		for (const die of attack.dice) {
			const row = rowFor(die.key);
			if (row) {
				row.d20Sum += die.value;
				row.d20Count++;
			}
		}
	}
	return [...rows.values()];
}
