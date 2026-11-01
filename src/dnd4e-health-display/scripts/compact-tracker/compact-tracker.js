import { getSpecialRole } from "../health-display/token-hover-display-data.js";
import { escapeHtml, hpHtml, gripHtml, roleHtml, titleHtml, subtitleText, nextPlayer, nextPlayerHtml, timerHtml, timerClasses,
	planReorder } from "./compact-tracker-data.js";
import { TurnTimer, PauseRegistry } from "./turn-timer.js";

const MODULE_ID = "dnd4e-health-display";
export const COMPACT_TRACKER_SETTING = "compactTracker";
const CHANNEL = `module.${MODULE_ID}`;
const ACTIVATION_HOOK = "dnd4e-health-display.activation";
const ROOT_CLASS = "dnd4e-compact-tracker";
/** Everything the tracker injects, so turning the setting off can remove it even when Foundry keeps a part. */
const INJECTED = ["[data-compact-title]", "[data-compact-role]", "[data-compact-hp]", "[data-compact-grip]", "[data-compact-info]"];
const timer = new TurnTimer();
const pauses = new PauseRegistry();
let dragId = null;
let dropIndex = null;
let refreshPending = false;

/** Whether the compact tracker is switched on for this world. */
function isEnabled() {
	return game.settings.get(MODULE_ID, COMPACT_TRACKER_SETTING);
}

/** Re-render the sidebar tracker and its pop-out so a setting change applies immediately. */
function refreshTrackers() {
	ui.combat?.render();
	ui.combat?.popout?.render();
}

/** Register the world setting that switches the compact tracker on. */
export function registerCompactTrackerSettings() {
	game.settings.register(MODULE_ID, COMPACT_TRACKER_SETTING, {
		name: "Compact combat tracker",
		hint: "Replace the combat tracker's portraits with one dense row per combatant: role icon, name, current/max HP in four colours, and the Hide Token button. Before combat the initiative number is editable; once it starts GMs drag a combatant between two others to slot its initiative in between. Adds the Battle Briefing title, a round and turn subtitle, a next-player line and, for GMs, a turn timer.",
		scope: "world", config: true, type: Boolean, default: false, onChange: refreshTrackers,
	});
}

/**
 * Hook everything up after ready. The hooks stay registered whatever the setting says and do nothing while
 * it is off, so toggling it never needs a reload.
 */
export function registerCompactTracker() {
	Hooks.on("renderCombatTracker", enhanceTracker);
	Hooks.on(ACTIVATION_HOOK, reportActivation);
	const refreshHp = foundry.utils.debounce(() => {
		if (!isEnabled() || !ui.combat?.viewed) {
			return;
		}
		// Rebuilding the rows under the pointer would cancel a drag in progress; catch up when it ends.
		if (dragId !== null) {
			refreshPending = true;
			return;
		}
		void ui.combat.render({ parts: ["tracker"] });
	}, 100);
	Hooks.on("updateActor", (actor, changes) => {
		if (foundry.utils.hasProperty(changes, "system.attributes.hp")) {
			refreshHp();
		}
	});
	Hooks.on("updateToken", (token, changes) => {
		if (changes.delta) {
			refreshHp();
		}
	});
	if (!game.user.isGM) {
		return;
	}
	game.socket.on(CHANNEL, receiveTargeting);
	Hooks.on("diceSoNiceRollStart", messageId => pauses.setDice(messageId, true, Date.now()));
	Hooks.on("diceSoNiceRollComplete", messageId => pauses.setDice(messageId, false, Date.now()));
	Hooks.on("updateUser", user => {
		if (!user.active) {
			pauses.clearUser(user.id);
		}
	});
	setInterval(tickTimer, 1000);
	ui.combat?.render();
}

/** Combatants the current user can see, in turn order. */
function shownTurns(combat) {
	return combat?.turns?.filter(combatant => combatant.visible) ?? [];
}

/** Apply the compact presentation to one render of the tracker; safe to run repeatedly. */
function enhanceTracker(app, element) {
	if (!isEnabled()) {
		removeCompact(element);
		return;
	}
	const combat = app.viewed;
	const draggable = game.user.isGM && Boolean(combat?.started);
	element.classList.add(ROOT_CLASS);
	element.classList.toggle("is-started", Boolean(combat?.started));
	element.classList.toggle("is-draggable", draggable);
	const shown = shownTurns(combat);
	enhanceHeader(element, combat, shown);
	enhanceRows(element, combat, draggable);
	enhanceFooter(element, combat, shown);
	enableDragging(app, element);
	// Foundry re-renders the tracker itself on HP changes, which rebuilds the row being dragged.
	if (dragId !== null) {
		element.querySelector(`li.combatant[data-combatant-id="${dragId}"]`)?.classList.add("is-dragging");
	}
}

/**
 * Undo the compact layout. Foundry does not always rebuild every part when the setting changes, so the
 * markup, status text and attributes added here are removed explicitly.
 */
function removeCompact(element) {
	element.classList.remove(ROOT_CLASS, "is-started", "is-draggable");
	for (const selector of INJECTED) {
		element.querySelectorAll(selector).forEach(node => node.remove());
	}
	const status = element.querySelector(".combat-tracker-header .encounter-title");
	if (status) {
		status.textContent = subtitleText(status.textContent, -1, 0);
	}
	for (const row of element.querySelectorAll("li.combatant[data-combatant-id]")) {
		row.draggable = false;
		delete row.dataset.team;
	}
	for (const input of element.querySelectorAll("[data-compact-initiative]")) {
		input.outerHTML = `<span>${escapeHtml(input.value)}</span>`;
	}
}

/** Battle Briefing title on top, the round and turn tracker as its subtitle. */
function enhanceHeader(element, combat, shown) {
	const header = element.querySelector(".combat-tracker-header");
	if (!header) {
		return;
	}
	header.querySelectorAll("[data-compact-title]").forEach(node => node.remove());
	const title = combat?.getFlag(MODULE_ID, "presentation")?.title?.trim();
	if (title) {
		header.querySelector(".encounter-controls")?.insertAdjacentHTML("beforebegin", titleHtml(title));
	}
	const status = header.querySelector(".encounter-title");
	if (status) {
		const position = combat?.started ? shown.findIndex(combatant => combatant.id === combat.combatant?.id) : -1;
		status.textContent = subtitleText(status.textContent, position, shown.length);
	}
}

/** Add the role icon, HP text and (for GMs, before combat) an editable initiative to every row. */
function enhanceRows(element, combat, draggable) {
	for (const row of element.querySelectorAll("li.combatant[data-combatant-id]")) {
		const combatant = combat?.combatants.get(row.dataset.combatantId);
		if (!combatant) {
			continue;
		}
		for (const selector of ["[data-compact-grip]", "[data-compact-role]", "[data-compact-hp]"]) {
			row.querySelectorAll(selector).forEach(node => node.remove());
		}
		row.dataset.team = teamOf(combatant);
		row.draggable = draggable;
		row.querySelector(".token-name")?.insertAdjacentHTML("beforebegin", (draggable ? gripHtml() : "") + roleHtml(getSpecialRole(combatant.actor ?? {})));
		const hp = combatant.actor?.system?.attributes?.hp;
		if (game.user.isGM || combatant.permission >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
			row.querySelector(".token-initiative")?.insertAdjacentHTML("beforebegin", hpHtml(Number(hp?.value), Number(hp?.max)));
		}
		makeInitiativeEditable(row, combat);
	}
}

/**
 * The native tracker shows decimal initiatives (DnD4e's tiebreakers) as plain text. Before combat the GM
 * needs to correct them, so swap in an input; the native change handler already updates the combatant.
 */
function makeInitiativeEditable(row, combat) {
	const display = row.querySelector(".token-initiative > span");
	if (display && game.user.isGM && !combat.started) {
		const label = game.i18n.localize("COMBATANT.FIELDS.initiative.label");
		display.outerHTML = `<input type="text" class="initiative-input" data-compact-initiative inputmode="decimal" value="${escapeHtml(display.textContent.trim())}" aria-label="${escapeHtml(label)}">`;
	}
}

/** Player characters, then friendly, neutral and hostile creatures by token disposition. */
function teamOf(combatant) {
	if (combatant.actor?.type === "Player Character") {
		return "pc";
	}
	const disposition = combatant.token?.disposition;
	return disposition > 0 ? "friendly" : disposition < 0 ? "enemy" : "neutral";
}

/** The next-player line for everyone and, for GMs, the turn timer. */
function enhanceFooter(element, combat, shown) {
	element.querySelectorAll("[data-compact-info]").forEach(node => node.remove());
	const controls = element.querySelector(".combat-controls");
	if (!controls || !combat) {
		return;
	}
	const turns = shown.map(combatant => ({ id: combatant.id, name: combatant.name,
		isPlayer: combatant.actor?.type === "Player Character" }));
	let html = nextPlayerHtml(nextPlayer(turns, combat.combatant?.id ?? null, combat.started));
	if (game.user.isGM && combat.started) {
		const state = timerState(combat);
		html += `<div class="${timerClasses(state)}" data-compact-timer>${timerHtml(state)}</div>`;
	}
	if (html) {
		controls.insertAdjacentHTML("beforebegin", `<div class="dnd4e-compact-tracker__info" data-compact-info>${html}</div>`);
	}
}

/** Advance the turn timer; a different combat, round or acting combatant restarts it. */
function timerState(combat, now = Date.now()) {
	const acting = combat?.started ? combat.combatant : null;
	const key = acting ? `${combat.id}:${combat.round}:${acting.id}` : null;
	return timer.update(key, key ? pauses.reason(acting.token?.uuid ?? null, now) : null, now);
}

/** Once a second: keep the timer counting and refresh every timer on screen. */
function tickTimer() {
	if (!isEnabled()) {
		return;
	}
	const state = timerState(ui.combat?.viewed ?? game.combat);
	for (const node of document.querySelectorAll("[data-compact-timer]")) {
		node.className = timerClasses(state);
		node.innerHTML = timerHtml(state);
	}
}

/** Tell the GM's timer whether this client's Target Automation session is open. */
function reportActivation(activation) {
	if (!isEnabled()) {
		return;
	}
	const active = !activation.finished;
	const tokenUuid = activation.caster?.document?.uuid ?? null;
	if (game.user.isGM) {
		pauses.setTargeting(game.user.id, active, tokenUuid);
	} else {
		game.socket.emit(CHANNEL, { type: "compactTrackerTargeting", userId: game.user.id, active, tokenUuid });
	}
}

/** GM side of the player report. Only an online user who owns the token may hold the timer. */
function receiveTargeting(message) {
	if (message?.type !== "compactTrackerTargeting" || typeof message.userId !== "string") {
		return;
	}
	const user = game.users.get(message.userId);
	const tokenUuid = typeof message.tokenUuid === "string" ? message.tokenUuid : null;
	if (!user?.active) {
		return;
	}
	if (message.active && !user.isGM && !fromUuidSync(tokenUuid)?.actor?.testUserPermission(user, "OWNER")) {
		return;
	}
	pauses.setTargeting(user.id, Boolean(message.active), tokenUuid);
}

/**
 * Drag-to-reorder: GMs only, once combat has started. The handlers are bound once to the tracker's root
 * element, which outlives renders, so the drag can end anywhere inside the tracker (over the header or footer
 * counts as the top or bottom of the list) and a re-render never loses them.
 */
function enableDragging(app, element) {
	if (element.dataset.compactDrag) {
		return;
	}
	element.dataset.compactDrag = "true";
	const trackerList = () => element.querySelector("ol.combat-tracker");
	element.addEventListener("dragstart", event => {
		const row = event.target.closest?.("li.combatant");
		if (!row || !app.viewed?.started || !game.user.isGM) {
			event.preventDefault();
			return;
		}
		dragId = row.dataset.combatantId;
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", dragId);
		requestAnimationFrame(() => row.classList.add("is-dragging"));
	});
	element.addEventListener("dragover", event => {
		const list = trackerList();
		if (dragId === null || !list || !app.viewed?.combatants.get(dragId)) {
			return;
		}
		event.preventDefault();
		scrollWhileDragging(list, event.clientY);
		const rows = otherRows(list);
		// Count the rows whose middle the pointer has passed; above the list that is none, below it all.
		dropIndex = rows.filter(row => {
			const box = row.getBoundingClientRect();
			return event.clientY > box.top + box.height / 2;
		}).length;
		clearDropMarkers(list);
		if (dropIndex < rows.length) {
			rows[dropIndex].classList.add("drop-before");
		} else {
			rows.at(-1)?.classList.add("drop-after");
		}
	});
	element.addEventListener("drop", event => {
		if (dragId === null || dropIndex === null) {
			return;
		}
		event.preventDefault();
		const combat = app.viewed;
		const id = dragId;
		const index = dropIndex;
		finishDrag(trackerList());
		void reorderCombatant(combat, id, index).catch(error => {
			console.error(`${MODULE_ID} | Could not reorder the combatant`, error);
			ui.notifications.error("Could not change the initiative order. Check the console.");
		});
	});
	element.addEventListener("dragend", () => finishDrag(trackerList()));
}

/** Scroll the list while the pointer is near (or beyond) its top or bottom edge, so every row is reachable. */
function scrollWhileDragging(list, y) {
	const zone = 40;
	const box = list.getBoundingClientRect();
	if (y < box.top + zone) {
		list.scrollTop -= Math.min(20, Math.ceil((box.top + zone - y) / 2));
	} else if (y > box.bottom - zone) {
		list.scrollTop += Math.min(20, Math.ceil((y - (box.bottom - zone)) / 2));
	}
}

/** Rows other than the one being dragged, in display order. */
function otherRows(list) {
	return [...list.querySelectorAll("li.combatant")].filter(row => row.dataset.combatantId !== dragId);
}

function clearDropMarkers(list) {
	list?.querySelectorAll(".drop-before,.drop-after").forEach(row => row.classList.remove("drop-before", "drop-after"));
}

function finishDrag(list) {
	dragId = null;
	dropIndex = null;
	clearDropMarkers(list);
	list?.querySelectorAll(".is-dragging").forEach(row => row.classList.remove("is-dragging"));
	if (refreshPending) {
		refreshPending = false;
		void ui.combat?.render({ parts: ["tracker"] });
	}
}

/**
 * Give the dragged combatant an initiative midway between its new neighbours, in one update. Foundry keeps
 * the turn with whoever is acting, so reordering never skips or repeats a turn.
 *
 * @param {Combat} combat The viewed encounter.
 * @param {string} combatantId The combatant that was dragged.
 * @param {number} index Insertion index among the other combatants.
 */
export async function reorderCombatant(combat, combatantId, index) {
	if (!game.user.isGM || !combat?.started) {
		return;
	}
	const turns = combat.turns.map(combatant => ({ id: combatant.id, initiative: combatant.initiative }));
	const plan = planReorder(turns, combatantId, index);
	if (!plan) {
		return;
	}
	await combat.updateEmbeddedDocuments("Combatant", plan.updates);
}
