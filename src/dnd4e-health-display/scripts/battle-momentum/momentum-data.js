import { getEncounterCalculation, getEncounterWeight } from "../combat-start/encounter-calculation.js";

/** Snapshot a tracked token; party membership matches Battle Briefing's player ownership. */
export function snapshotParticipant(combatant) {
	const actor = combatant.actor;
	if (!actor || (!actor.hasPlayerOwner && combatant.token?.disposition !== -1)) {
		return null;
	}
	const pc = Boolean(actor.hasPlayerOwner);
	const level = Number(actor.system?.details?.level?.value ?? actor.system?.details?.level ?? actor.system?.level);
	const rank = pc ? "standard" : actor.system?.details?.role?.secondary || "standard";
	const hp = Number(actor.system?.attributes?.hp?.value);
	const max = Number(actor.system?.attributes?.hp?.max);
	const weight = getEncounterWeight(level, rank);
	return { id: combatant.id, pc, level, rank, hp, max, weight,
		valid: weight !== null && Number.isFinite(hp) && Number.isFinite(max) && max > 0,
		defeated: Boolean(combatant.defeated), statuses: Array.from(actor.statuses ?? []) };
}

/** Defeat is distinct from temporary action denial, including unconsciousness. */
function isOut(p) {
	return p.hp <= 0 || p.defeated || p.statuses.includes("dead");
}

/** Estimate effective output; shared control penalties use the strongest factor only. */
export function remainingCapacity(p) {
	if (isOut(p) || p.statuses.includes("unconscious") || p.statuses.includes("stunned")) {
		return 0;
	}
	const availability = Math.min(p.statuses.includes("dazed") ? .7 : 1, p.statuses.includes("blinded") ? .6 : 1);
	const endurance = p.rank === "minion" ? 1 : .5 + .5 * Math.max(0, Math.min(1, p.hp / p.max));
	return p.weight * availability * endurance;
}

/** Derive balance from a roster without reading or changing Foundry documents. */
export function calculateBalance(members, round, edge = 1.5) {
	const party = members.filter(p => p.pc);
	const enemies = members.filter(p => !p.pc);
	if (!party.length || !enemies.length || members.some(p => !p.valid)) {
		return null;
	}
	const level = Math.ceil(party.reduce((sum, p) => sum + p.level, 0) / party.length);
	const budget = party.length * getEncounterWeight(level);
	const partyWeight = party.reduce((sum, p) => sum + p.weight, 0);
	const enemyWeight = enemies.reduce((sum, p) => sum + p.weight, 0);
	const partyCapacity = party.reduce((sum, p) => sum + remainingCapacity(p), 0) / partyWeight;
	const enemyCapacity = enemies.reduce((sum, p) => sum + remainingCapacity(p), 0) / enemyWeight;
	const partyStrength = budget * edge * partyCapacity;
	const enemyStrength = enemyWeight * enemyCapacity;
	const partyOut = party.every(isOut);
	const enemiesOut = enemies.every(isOut);
	const ended = partyOut || enemiesOut;
	const boost = ended ? 0 : Math.min(20, party.filter(p => p.boostUntil > round).length * 10);
	const total = partyStrength + enemyStrength;
	const raw = total ? 100 * (partyStrength - enemyStrength) / total : 0;
	const balance = ended ? (partyOut && enemiesOut ? 0 : enemiesOut ? 100 : -100) : Math.max(-100, Math.min(100, raw - boost));
	const roster = members.map(p => ({ id: p.id, actor: { hasPlayerOwner: p.pc,
		system: { details: { level: p.level, role: { secondary: p.rank } } } }, token: { disposition: -1 } }));
	return { balance, partyCapacity, enemyCapacity, boost, ended, partyOut, enemiesOut,
		danger: getEncounterCalculation({ combatants: roster }).difficulty };
}

/** Start GM-local observation; history is intentionally not reconstructed on reload. */
export function createMomentumSession(combat, partial = false) {
	return { members: new Map(), round: Number(combat.round) || 1, anchor: null,
		partial: partial || combat.round > 1 || combat.turn > 0, dismissed: false, result: null };
}

/** Sample every event, even while closed, so a quick down-and-heal retains its breakthrough. */
export function observeMomentum(session, combat, edge = 1.5) {
	const round = Number(combat.round) || 1;
	const newRound = round !== session.round;
	const rewind = round < session.round;
	const seen = new Set();
	for (const combatant of combat.combatants) {
		const p = snapshotParticipant(combatant);
		if (!p) {
			continue;
		}
		seen.add(p.id);
		const previous = session.members.get(p.id);
		p.boostUntil = rewind ? 0 : previous?.boostUntil ?? 0;
		if (!rewind && p.pc && previous?.hp > 0 && p.hp <= 0) {
			p.boostUntil = round + 2;
		}
		session.members.set(p.id, p);
	}
	// Keep casualties in the denominator if the GM removes them from initiative.
	for (const [id, p] of session.members) {
		if (!seen.has(id)) {
			p.hp = 0;
			p.defeated = true;
		}
		if (rewind) {
			p.boostUntil = 0;
		}
	}
	if (rewind) {
		session.partial = true;
	}
	session.result = calculateBalance(Array.from(session.members.values()), round, edge);
	if (session.result && (newRound || session.anchor === null)) {
		session.anchor = session.result.balance;
	}
	session.round = round;
	return session.result;
}

/** Format a small panel with explicit balance and direction rather than win probabilities. */
export function momentumView(session) {
	const r = session?.result;
	if (!r) {
		return { unavailable: true, note: "Start combat with PCs and hostile enemies. Each needs a valid level, rank and maximum HP." };
	}
	const side = r.balance >= 0 ? "Party" : "Enemies";
	const magnitude = Math.abs(r.balance);
	const label = r.ended ? (r.partyOut && r.enemiesOut ? "Both sides defeated" : `${side} prevail`)
		: magnitude < 5 ? "Closely balanced" : `${side} ${magnitude < 20 ? "slightly favored" : "favored"}`;
	const delta = r.balance - session.anchor;
	return { label, danger: r.danger, round: session.round, partial: session.partial,
		position: (100 - r.balance) / 2, value: Math.round(r.balance), score: `${r.balance >= 0 ? "+" : ""}${Math.round(r.balance)}`,
		trend: r.ended ? "Fight decided" : Math.abs(delta) < 2 ? "Momentum steady" : `${delta > 0 ? "← Party gaining" : "Enemies gaining →"}`,
		change: Math.abs(delta) >= 2 && !r.ended ? Math.abs(delta).toFixed(0) : "",
		party: Math.round(r.partyCapacity * 100), enemy: Math.round(r.enemyCapacity * 100), boost: r.boost };
}
