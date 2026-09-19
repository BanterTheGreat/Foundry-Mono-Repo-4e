import { getCombatTrackerData } from "./combat-tracker-data.js";
import { openBattleBriefing } from "../combat-start/combat-start.js";
import { GM_HUD_MERGED_CHANGE_HOOK, isGmCombatMergedIntoHorizontalHud } from "../actor-display/gm-hud-state.js";

const MODULE_ID = "dnd4e-health-display";
const SHOW_SETTING = "showCombatTracker";
const POSITION_SETTING = "combatTrackerPosition";
const TEMPLATE_PATH = `modules/${MODULE_ID}/scripts/combat-tracker/combat-tracker.hbs`;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The encounter id the current user dismissed with the close button, until its next combatStart. */
let dismissedCombatId = null;

/** Register client settings owned by the combat tracker HUD. */
export function registerCombatTrackerSettings() {
	game.settings.register(MODULE_ID, SHOW_SETTING, {
		name: "Show combat tracker HUD",
		hint: "Automatically show a compact turn-order display, styled to match this module's HUD, whenever an encounter starts.",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: (enabled) => {
			if (enabled) {
				syncCombatTracker();
			} else {
				closeCombatTracker();
			}
		},
	});

	game.settings.register(MODULE_ID, POSITION_SETTING, {
		name: "Combat tracker HUD position",
		hint: "Saved screen position of the combat tracker HUD.",
		scope: "client",
		config: false,
		type: Object,
		default: { top: null, left: null },
	});
}

/** Register the combat tracker HUD lifecycle and refresh hooks. */
export function registerCombatTracker() {
	Hooks.on("combatStart", onCombatStart);
	Hooks.on("updateCombat", onUpdateCombat);
	Hooks.on("deleteCombat", onDeleteCombat);
	Hooks.on("createCombatant", onCombatantChange);
	Hooks.on("updateCombatant", onCombatantChange);
	Hooks.on("deleteCombatant", onCombatantChange);
	Hooks.on("createActiveEffect", onEffectChange);
	Hooks.on("updateActiveEffect", onEffectChange);
	Hooks.on("deleteActiveEffect", onEffectChange);
	Hooks.on("updateActor", onActorUpdate);
	Hooks.on("canvasReady", () => {
		dismissedCombatId = null;
		syncCombatTracker();
	});
	Hooks.on("canvasTearDown", closeCombatTracker);
	Hooks.on(GM_HUD_MERGED_CHANGE_HOOK, () => syncCombatTracker());

	syncCombatTracker();
}

/** Reopen the display fresh whenever an encounter starts. */
function onCombatStart(combat) {
	dismissedCombatId = null;
	syncCombatTracker(combat);
}

/** Refresh or open/close the display as the active encounter's round or state changes. */
function onUpdateCombat(combat) {
	syncCombatTracker(combat);
}

/** Close the display when its encounter is deleted. */
function onDeleteCombat(combat) {
	if (ui.Dnd4eCombatTracker?.combatId !== combat.id) {
		return;
	}

	dismissedCombatId = null;
	closeCombatTracker();
}

/** Refresh the display when combatants are added, changed, or removed. */
function onCombatantChange(combatant) {
	if (ui.Dnd4eCombatTracker?.combatId === combatant.parent?.id) {
		ui.Dnd4eCombatTracker.render();
	}
}

/** Refresh the display when a tracked combatant's active effects change. */
function onEffectChange(effect) {
	if (effect.parent instanceof Actor && ui.Dnd4eCombatTracker?.tracksActor(effect.parent.id)) {
		ui.Dnd4eCombatTracker.render();
	}
}

/** Refresh the display when a tracked combatant's actor changes (e.g. HP). */
function onActorUpdate(actor) {
	if (ui.Dnd4eCombatTracker?.tracksActor(actor.id)) {
		ui.Dnd4eCombatTracker.render();
	}
}

/** Open, refresh, or close the display to match the active encounter's state. */
function syncCombatTracker(combat = game.combats?.active) {
	if (!game.settings.get(MODULE_ID, SHOW_SETTING) || !canvas?.ready) {
		closeCombatTracker();
		return;
	}

	// The GM's own tracker moves into the horizontal HUD once it's showing during an active
	// encounter, rather than staying open as a separate floating window too.
	if (game.user.isGM && isGmCombatMergedIntoHorizontalHud()) {
		closeCombatTracker();
		return;
	}

	if (!combat?.started) {
		closeCombatTracker();
		return;
	}

	if (dismissedCombatId === combat.id) {
		return;
	}

	if (!ui.Dnd4eCombatTracker) {
		ui.Dnd4eCombatTracker = new CombatTrackerDisplay({}, combat.id);
		ui.Dnd4eCombatTracker.render(true);
		return;
	}

	ui.Dnd4eCombatTracker.setCombat(combat.id);
}

/** Close the display and clear its UI reference. */
function closeCombatTracker() {
	const display = ui.Dnd4eCombatTracker;
	ui.Dnd4eCombatTracker = null;
	void display?.close();
}

class CombatTrackerDisplay extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options, combatId) {
		super(options);
		this.combatId = combatId;
	}

	static DEFAULT_OPTIONS = {
		id: "dnd4e-info-combat-tracker",
		tag: "aside",
		classes: ["dnd4e-info-combat-tracker"],
		position: {
			top: 16,
			left: 900,
			width: 304,
			height: "auto",
		},
		dragResizable: false,
		window: { frame: false },
		actions: {
			close: CombatTrackerDisplay.prototype.onDismiss,
			setCurrent: CombatTrackerDisplay.prototype.onSetCurrent,
			toggleHidden: CombatTrackerDisplay.prototype.onToggleHidden,
			toggleDefeated: CombatTrackerDisplay.prototype.onToggleDefeated,
			nav: CombatTrackerDisplay.prototype.onNav,
			endCombat: CombatTrackerDisplay.prototype.onEndCombat,
			openBriefing: CombatTrackerDisplay.prototype.onOpenBriefing,
		},
	};

	static PARTS = {
		main: { template: TEMPLATE_PATH },
	};

	/** @returns {Combat|null} */
	get combat() {
		return game.combats?.get(this.combatId) ?? null;
	}

	/** @param {string} combatId The encounter this display should now follow. */
	setCombat(combatId) {
		this.combatId = combatId;
		this.render();
	}

	/** @param {string} actorId @returns {boolean} Whether the displayed encounter includes this actor. */
	tracksActor(actorId) {
		return Boolean(this.combat?.combatants.some((combatant) => combatant.actorId === actorId));
	}

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return foundry.utils.mergeObject(context, {
			...getCombatTrackerData(this.combat, game.user.isGM),
			isGM: game.user.isGM,
		});
	}

	/** Place the frameless display directly in the document body. */
	_insertElement(element) {
		document.body.appendChild(element);
	}

	/** Restore drag state and wire HP inputs after every render. */
	_onRender(context, options) {
		super._onRender(context, options);
		this.initializeDrag();
		this.initializeHpInputs();
		this.initializeInitiativeInputs();
		this.restorePosition();
	}

	/** Make the header the drag handle. */
	initializeDrag() {
		const handle = this.element.querySelector(".dnd4e-info-combat-tracker__header");
		if (!handle) {
			return;
		}

		handle.addEventListener("pointerdown", (event) => {
			if (event.button !== 0 || event.target.closest("button, [data-action]")) {
				return;
			}

			const startX = event.clientX;
			const startY = event.clientY;
			const startLeft = this.position.left;
			const startTop = this.position.top;
			const move = (moveEvent) => this.setPosition({
				left: startLeft + moveEvent.clientX - startX,
				top: startTop + moveEvent.clientY - startY,
			});
			const release = async () => {
				document.removeEventListener("pointermove", move);
				document.removeEventListener("pointerup", release);
				await game.settings.set(MODULE_ID, POSITION_SETTING, {
					left: this.position.left,
					top: this.position.top,
				});
			};

			event.preventDefault();
			document.addEventListener("pointermove", move);
			document.addEventListener("pointerup", release);
		});
	}

	/** Commit inline HP edits back to the combatant's actor. */
	initializeHpInputs() {
		for (const input of this.element.querySelectorAll("[data-hp-input]")) {
			input.addEventListener("click", (event) => event.stopPropagation());
			input.addEventListener("change", async (event) => {
				const combatant = this.combat?.combatants.get(input.dataset.hpInput);
				const actor = combatant?.actor;
				const max = Number(actor?.system?.attributes?.hp?.max) || 0;
				const value = Math.max(0, Math.min(max, Number(event.target.value) || 0));
				try {
					await actor?.update({ "system.attributes.hp.value": value });
				} catch (error) {
					console.error(`${MODULE_ID} | Failed to update combatant HP.`, error);
					ui.notifications.error("Hit points could not be updated. Check the console for details.");
					this.render();
				}
			});
		}
	}

	/** Commit inline initiative edits back to the encounter. */
	initializeInitiativeInputs() {
		for (const input of this.element.querySelectorAll("[data-init-input]")) {
			input.addEventListener("click", (event) => event.stopPropagation());
			input.addEventListener("change", async (event) => {
				const combat = this.combat;
				const combatant = combat?.combatants.get(input.dataset.initInput);
				if (!combatant) {
					return;
				}

				const value = event.target.value.trim();
				try {
					if (value === "") {
						await combatant.update({ initiative: null });
					} else {
						await combat.setInitiative(combatant.id, Number(value));
					}
				} catch (error) {
					console.error(`${MODULE_ID} | Failed to set initiative.`, error);
					ui.notifications.error("Initiative could not be set. Check the console for details.");
					this.render();
				}
			});
		}
	}

	/** Restore the user's last saved display position. */
	restorePosition() {
		const position = game.settings.get(MODULE_ID, POSITION_SETTING);
		if (position?.left != null && position?.top != null) {
			this.setPosition(position);
		}
	}

	/** Dismiss the display until the next encounter starts. */
	onDismiss() {
		dismissedCombatId = this.combatId;
		closeCombatTracker();
	}

	/** Jump the encounter to a clicked combatant's turn. */
	async onSetCurrent(event, target) {
		if (!game.user.isGM) {
			return;
		}

		const combat = this.combat;
		const turn = combat?.turns.findIndex((combatant) => combatant.id === target.dataset.combatantId) ?? -1;
		if (turn < 0) {
			return;
		}

		try {
			await combat.update({ turn });
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to set the current turn.`, error);
			ui.notifications.error("The current turn could not be changed. Check the console for details.");
		}
	}

	/** Toggle whether a combatant and its scene token are hidden from players. */
	async onToggleHidden(event, target) {
		if (!game.user.isGM) {
			return;
		}

		const combatant = this.combat?.combatants.get(target.dataset.combatantId);
		if (!combatant) {
			return;
		}

		const hidden = !(combatant.hidden || combatant.token?.hidden);
		try {
			if (combatant.token && combatant.token.hidden !== hidden) {
				await combatant.token.update({ hidden });
			}
			if (combatant.hidden !== hidden) {
				await combatant.update({ hidden });
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to change combatant visibility.`, error);
			ui.notifications.error("The combatant visibility could not be changed. Check the console for details.");
		}
	}

	/** Toggle a combatant's defeated status. */
	async onToggleDefeated(event, target) {
		if (!game.user.isGM) {
			return;
		}

		const combatant = this.combat?.combatants.get(target.dataset.combatantId);
		try {
			await combatant?.toggleDefeated();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to toggle defeated status.`, error);
			ui.notifications.error("The defeated status could not be toggled. Check the console for details.");
		}
	}

	/** Advance or rewind the encounter by one turn. */
	async onNav(event, target) {
		if (!game.user.isGM) {
			return;
		}

		try {
			if (target.dataset.nav === "next") {
				await this.combat?.nextTurn();
			} else {
				await this.combat?.previousTurn();
			}
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to change the turn.`, error);
			ui.notifications.error("The turn could not be changed. Check the console for details.");
		}
	}

	/** Open the Battle Briefing for the active encounter. */
	async onOpenBriefing() {
		if (!game.user.isGM || !this.combat) {
			return;
		}

		await openBattleBriefing(this.combat);
	}

	/** End the active encounter. */
	async onEndCombat(event, target) {
		if (!game.user.isGM) {
			return;
		}

		target.disabled = true;
		try {
			await this.combat?.endCombat();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to end the encounter.`, error);
			ui.notifications.error("The encounter could not be ended. Check the console for details.");
		} finally {
			target.disabled = false;
		}
	}

	/** Clear the shared UI reference once this display actually closes. */
	_onClose(options) {
		super._onClose(options);
		if (ui.Dnd4eCombatTracker === this) {
			ui.Dnd4eCombatTracker = null;
		}
	}
}
