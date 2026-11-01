/** Pure helpers for the compact combat tracker. Nothing here touches Foundry globals or the DOM. */

export const PAWN_ICON = "fa-solid fa-chess-pawn";
const PRECISION = 1e6;
const MIN_GAP = 2 / PRECISION;
/** Spacing used to pull apart combatants that share an initiative; far smaller than any real gap. */
const SPREAD_STEP = 1e-8;
const FINE = 1e9;

/** Escape text interpolated into the HTML fragments below. */
export function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"']/g, character => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
	})[character]);
}

/**
 * Colour band for a hit point total: green above 75%, yellow above 50%, orange above 25% (below that is
 * bloodied territory in 4e), red at 25% or less. Anything without a usable maximum counts as red.
 *
 * @param {number} hp Current hit points.
 * @param {number} max Maximum hit points.
 * @returns {"green"|"yellow"|"orange"|"red"}
 */
export function hpBand(hp, max) {
	const fraction = max > 0 ? hp / max : 0;
	if (fraction > 0.75) {
		return "green";
	}
	if (fraction > 0.5) {
		return "yellow";
	}
	return fraction > 0.25 ? "orange" : "red";
}

/** Number of whole hit points as the tracker's `current/max` text. Returns "" when HP is unknown. */
export function hpHtml(hp, max) {
	if (!Number.isFinite(hp) || !Number.isFinite(max) || max <= 0) {
		return "";
	}
	return `<span class="dnd4e-compact-tracker__hp is-${hpBand(hp, max)}" data-compact-hp`
		+ ` title="Hit points ${hp} of ${max}"><b>${hp}</b>/${max}</span>`;
}

/**
 * The single role icon shown before a name. The caller passes the health display's role (solo, leader,
 * elite or minion), which already applies the same priority; minions have no icon there, so the tracker
 * gives them a pawn.
 *
 * @param {{key: string, label: string, icon?: string}|null} role
 * @returns {{key: string, label: string, icon: string}|null}
 */
export function trackerRole(role) {
	if (!role) {
		return null;
	}
	const icon = role.icon ?? (role.key === "minion" ? PAWN_ICON : null);
	return icon ? { key: role.key, label: role.label, icon } : null;
}

/** The drag handle shown on rows a GM can reorder. */
export function gripHtml() {
	return "<span class=\"dnd4e-compact-tracker__grip\" data-compact-grip aria-hidden=\"true\"><i class=\"fa-solid fa-grip-vertical\"></i></span>";
}

/** A fixed-width slot, so names stay aligned whether or not the combatant has a role icon. */
export function roleHtml(role) {
	const shown = trackerRole(role);
	if (!shown) {
		return "<span class=\"dnd4e-compact-tracker__role\" data-compact-role aria-hidden=\"true\"></span>";
	}
	return `<span class="dnd4e-compact-tracker__role is-${escapeHtml(shown.key)}" data-compact-role`
		+ ` title="${escapeHtml(shown.label)}" aria-label="${escapeHtml(shown.label)}">`
		+ `<i class="${escapeHtml(shown.icon)}" aria-hidden="true"></i></span>`;
}

/** The combat title taken from the Battle Briefing. */
export function titleHtml(title) {
	return `<h2 class="dnd4e-compact-tracker__title" data-compact-title>${escapeHtml(title)}</h2>`;
}

/**
 * The round tracker shown as the subtitle: "Round 2 · Turn 3 of 8" once combat has started.
 *
 * @param {string} base The native status text ("Round 2", "Not started", ...).
 * @param {number} position Zero-based position of the acting combatant among shown turns, or -1.
 * @param {number} total Number of shown turns.
 */
export function subtitleText(base, position, total) {
	const label = String(base).replace(/\s*·\s*Turn .*$/, "").trim();
	return position >= 0 && total > 0 ? `${label} · Turn ${position + 1} of ${total}` : label;
}

/**
 * Sort exactly as Foundry's `Combat#_sortCombatants`: initiative descending, unrolled last, ties by id.
 *
 * @param {Array<{id: string, initiative: number|null}>} list
 */
export function sortTurns(list) {
	const value = entry => Number.isFinite(entry.initiative) ? entry.initiative : -Infinity;
	return [...list].sort((a, b) => (value(b) - value(a)) || (a.id > b.id ? 1 : -1));
}

const round = number => Math.round(number * PRECISION) / PRECISION;

/**
 * Initiative for a combatant dropped between `upper` (acts earlier) and `lower` (acts later).
 * When the neighbours are tied (or nearly) there is no number strictly between them: `tied` is true and
 * `value` is absent, and the caller must pull the tied run apart instead (see `planReorder`).
 *
 * @param {{id: string, initiative: number|null}|undefined} upper
 * @param {{id: string, initiative: number|null}|undefined} lower
 * @returns {{value?: number, tied: boolean, note: string}}
 */
export function initiativeBetween(upper, lower) {
	const above = Number.isFinite(upper?.initiative) ? upper.initiative : null;
	const below = Number.isFinite(lower?.initiative) ? lower.initiative : null;
	if (above !== null && below !== null) {
		if (above - below >= MIN_GAP) {
			return { value: round((above + below) / 2), tied: false, note: "midway" };
		}
		return { tied: true, note: "neighbours tied" };
	}
	if (above !== null) {
		return { value: round(above - 1), tied: false, note: "last" };
	}
	if (below !== null) {
		return { value: round(below + 1), tied: false, note: "first" };
	}
	return { value: 0, tied: false, note: "no initiatives rolled" };
}

/**
 * Re-number a run of tied combatants, with the dragged one inserted at `slot`, so each has its own value in
 * the intended order. The run keeps its highest value and steps down by a tiny amount, so nothing outside the
 * run can change place with it. Foundry breaks exact ties by id, so a plain nudge of one neighbour would
 * reorder the others.
 */
function spreadRun(rest, slot, draggedId) {
	const near = (a, b) => Number.isFinite(a.initiative) && Number.isFinite(b.initiative)
		&& Math.abs(a.initiative - b.initiative) < MIN_GAP;
	let first = slot - 1;
	let last = slot;
	while (first > 0 && near(rest[first - 1], rest[first])) {
		first--;
	}
	while (last < rest.length - 1 && near(rest[last], rest[last + 1])) {
		last++;
	}
	const run = [...rest.slice(first, slot), { id: draggedId }, ...rest.slice(slot, last + 1)];
	const top = rest[first].initiative;
	return run.map((entry, k) => ({ _id: entry.id, initiative: Math.round((top - k * SPREAD_STEP) * FINE) / FINE }))
		.filter(update => update._id === draggedId || update.initiative !== rest.find(other => other.id === update._id)?.initiative);
}

/**
 * Work out the updates for dragging one combatant into a new slot. Foundry v14 keeps the acting combatant
 * acting when initiatives change (`Combatant._preUpdateOperation`), so only initiatives are planned here.
 *
 * @param {Array<{id: string, initiative: number|null}>} turns Every combatant, in Foundry's turn order.
 * @param {string} draggedId The combatant being moved.
 * @param {number} index Insertion index among the other combatants.
 * @returns {{updates: Array<{_id: string, initiative: number}>, note: string}|null}
 *   null when the drop would not change the order.
 */
export function planReorder(turns, draggedId, index) {
	const rest = turns.filter(entry => entry.id !== draggedId);
	const slot = Math.max(0, Math.min(rest.length, index));
	const between = initiativeBetween(rest[slot - 1], rest[slot]);
	const { note } = between;
	const updates = between.tied ? spreadRun(rest, slot, draggedId) : [{ _id: draggedId, initiative: between.value }];
	const next = sortTurns(turns.map(entry => {
		const update = updates.find(candidate => candidate._id === entry.id);
		return update ? { ...entry, initiative: update.initiative } : entry;
	}));
	if (next.every((entry, i) => entry.id === turns[i]?.id)) {
		return null;
	}
	return { updates, note };
}

/**
 * Turns from the acting combatant until the next player character, wrapping into the next round.
 * Before combat starts it reports the first player in the order instead.
 *
 * @param {Array<{id: string, name: string, isPlayer: boolean}>} turns The turns shown to this user, in order.
 * @param {string|null} currentId The acting combatant.
 * @param {boolean} started Whether combat has started.
 * @returns {{name: string, turns: number, started: boolean}|null} null when there is no player to report, or
 *   when the acting combatant is not among the turns this user can see.
 */
export function nextPlayer(turns, currentId, started) {
	if (!started) {
		const first = turns.findIndex(entry => entry.isPlayer);
		return first < 0 ? null : { name: turns[first].name, turns: first + 1, started: false };
	}
	const start = turns.findIndex(entry => entry.id === currentId);
	if (start < 0) {
		return null;
	}
	for (let step = 1; step <= turns.length; step++) {
		const entry = turns[(start + step) % turns.length];
		if (entry.isPlayer) {
			return { name: entry.name, turns: step, started: true };
		}
	}
	return null;
}

/** m:ss, rounded down. */
export function formatTimer(ms) {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Neutral under one minute, then yellow from 1:00 and orange from 2:00. */
export function timerStage(ms) {
	if (ms >= 120000) {
		return "orange";
	}
	return ms >= 60000 ? "yellow" : "none";
}

/** The "Next player" line. */
export function nextPlayerHtml(next) {
	if (!next) {
		return "";
	}
	const label = next.started ? "Next player" : "First player";
	const when = next.started ? (next.turns === 1 ? "next" : `in ${next.turns} turns`) : `turn ${next.turns}`;
	return `<div class="dnd4e-compact-tracker__next" data-compact-next><span>${label}: `
		+ `<strong>${escapeHtml(next.name)}</strong></span><span class="when">${when}</span></div>`;
}

/**
 * The turn timer line. While paused the time stays frozen, keeps its colour and names the reason.
 *
 * @param {{elapsedMs: number, pausedBy: string|null}} state
 */
export function timerHtml({ elapsedMs, pausedBy }) {
	const why = pausedBy ? `<span class="why">&#9208; Paused · ${escapeHtml(pausedBy)}</span>` : "";
	return `<span class="label">Turn timer</span><span>${why}<span class="time">${formatTimer(elapsedMs)}</span></span>`;
}

/** Classes for the timer container; the colour stage and paused state live on one element. */
export function timerClasses({ elapsedMs, pausedBy }) {
	return `dnd4e-compact-tracker__timer is-${timerStage(elapsedMs)}${pausedBy ? " is-paused" : ""}`;
}
