import { createMomentumSession, observeMomentum, momentumView } from "./momentum-data.js";

const MODULE_ID = "dnd4e-health-display";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const sessions = new Map();
let panel;
let renderTimer;
let refreshQueue = Promise.resolve();

/** Register the visible estimator's explicit, provisional calibration. */
export function registerMomentumSettings() {
	game.settings.register(MODULE_ID, "momentumPartyEdge", {
		name: "Battle momentum: party edge", scope: "client", config: true, type: Number, default: 1.5,
		hint: "Party-strength multiplier used by the GM's momentum estimate. 1.5 is provisional; this is not a victory probability.",
		range: { min: 1, max: 3, step: .1 },
		onChange: () => {
			for (const session of sessions.values()) {
				session.anchor = null;
			}
			observeCurrentCombat();
		},
	});
}

/** Register exclusively on GM clients; the ledger registers its tracker control first. */
export function registerBattleMomentum() {
	if (!game.user.isGM) {
		return;
	}
	Hooks.on("renderCombatTracker", (app, element) => {
		addMomentumButton(app, element);
		observeCurrentCombat();
	});
	for (const hook of ["updateCombat", "createCombatant", "updateCombatant", "deleteCombatant", "updateActor", "updateToken", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "canvasReady"]) {
		Hooks.on(hook, observeCurrentCombat);
	}
	Hooks.on("deleteCombat", combat => {
		sessions.delete(combat.id);
		observeCurrentCombat();
	});
	const combat = currentCombat();
	if (combat?.started) {
		sessions.set(combat.id, createMomentumSession(combat, true));
	}
	if (ui.combat?.element) {
		addMomentumButton(ui.combat, ui.combat.element);
	}
	observeCurrentCombat();
}

/** Follow the selected tracker encounter, not an unrelated active scene. */
function currentCombat() {
	return ui.combat?.viewed ?? game.combat;
}

/** Insert one icon immediately after Combat Ledger's statistics button. */
export function addMomentumButton(app, element) {
	if (!game.user.isGM || app !== ui.combat || app.isPopout || element.querySelector("[data-battle-momentum]")) {
		return;
	}
	const statistics = element.querySelector("[data-combat-ledger]");
	if (!statistics) {
		return;
	}
	const button = document.createElement("button");
	button.type = "button";
	button.className = "battle-momentum-tracker-button";
	button.dataset.battleMomentum = "";
	button.title = "Open battle momentum";
	button.setAttribute("aria-label", "Open battle momentum");
	button.innerHTML = '<i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>';
	button.addEventListener("click", openMomentum);
	let controls = statistics.closest(".battle-momentum-tracker-controls");
	if (!controls) {
		controls = document.createElement("div");
		controls.className = "battle-momentum-tracker-controls";
		statistics.before(controls);
		controls.append(statistics);
	}
	controls.append(button);
}

/** Reopen the same movable window, retaining its position and ongoing observation. */
function openMomentum() {
	if (!game.user.isGM) {
		return;
	}
	const combat = currentCombat();
	if (combat?.started) {
		let session = sessions.get(combat.id);
		if (!session) {
			session = createMomentumSession(combat, true);
			sessions.set(combat.id, session);
		}
		session.dismissed = false;
		observeMomentum(session, combat, game.settings.get(MODULE_ID, "momentumPartyEdge"));
	}
	panel ??= new MomentumPanel();
	panel.combatId = combat?.id;
	panel.view = momentumView(sessions.get(combat?.id));
	queueRender(true);
}

/** Capture synchronously; debounce only presentation to preserve rapid HP transitions. */
function observeCurrentCombat() {
	if (!game.user.isGM) {
		return;
	}
	const combat = currentCombat();
	if (combat?.started) {
		let session = sessions.get(combat.id);
		if (!session) {
			session = createMomentumSession(combat);
			sessions.set(combat.id, session);
		}
		observeMomentum(session, combat, game.settings.get(MODULE_ID, "momentumPartyEdge"));
	} else if (combat) {
		// Reset a stopped encounter so starting it again establishes a fresh history.
		sessions.delete(combat.id);
	}
	queueRender();
}

/** Serialize renders and recheck dismissal after queued events; updates never reopen an X-closed panel. */
function queueRender(manual = false) {
	clearTimeout(renderTimer);
	renderTimer = setTimeout(() => {
		refreshQueue = refreshQueue.then(async () => {
			if (!game.user.isGM) {
				await panel?.close({ momentumInternal: true });
				return;
			}
			const combat = currentCombat();
			const session = sessions.get(combat?.id);
			if (session?.dismissed || (!combat?.started && !manual)) {
				await panel?.close({ momentumInternal: true });
				return;
			}
			panel ??= new MomentumPanel();
			panel.combatId = combat?.id;
			panel.view = momentumView(session);
			await panel.render({ force: true });
		}).catch(error => console.warn(`${MODULE_ID} | Battle momentum display failed`, error));
	}, 40);
}

/** Compact native title bar supplies dragging and the requested X close control. */
export class MomentumPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "dnd4e-battle-momentum", classes: ["dnd4e-battle-momentum"],
		position: { width: 290, height: "auto", top: 170, left: 65 },
		window: { title: "Battle momentum · GM", resizable: false, minimizable: true },
		actions: {
			details() {
				this.showDetails = !this.showDetails;
				return this.render({ force: true });
			},
		},
	};
	static PARTS = { body: { template: `modules/${MODULE_ID}/scripts/battle-momentum/momentum.hbs` } };

	/** Do not expose hidden enemy estimates through player-side rendering. */
	async _prepareContext() {
		if (!game.user.isGM) {
			throw new Error("Battle momentum is GM only.");
		}
		return { ...this.view, showDetails: this.showDetails };
	}

	/** User dismissal lasts for this encounter; internal lifecycle closes do not dismiss another fight. */
	async close(options = {}) {
		const { momentumInternal, ...nativeOptions } = options;
		if (!momentumInternal) {
			const session = sessions.get(this.combatId);
			if (session) {
				session.dismissed = true;
			}
		}
		return super.close(nativeOptions);
	}
}
