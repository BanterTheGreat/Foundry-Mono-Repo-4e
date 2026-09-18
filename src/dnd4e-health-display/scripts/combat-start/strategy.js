const MODULE_ID = "dnd4e-health-display";
const STRATEGY_FLAG = "strategy";
const OVERLAY_TEMPLATE = `modules/${MODULE_ID}/scripts/combat-start/strategy-overlay.hbs`;
const OVERLAY_POSITION_SETTING = "combatStartStrategyOverlayPosition";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Register the client-scoped setting that remembers where the GM last placed the strategy overlay. */
export function registerStrategySettings() {
	game.settings.register(MODULE_ID, OVERLAY_POSITION_SETTING, {
		scope: "client",
		config: false,
		type: Object,
		default: null,
	});
}

/** @returns {{environment: string[], pointers: Array<{id: string, notes: string[], combatantIds: string[]}>}} */
export function getDefaultStrategy() {
	return { environment: [], pointers: [] };
}

/** @param {Combat|null} combat @returns {object} The encounter's saved strategy notes. */
export function getStrategy(combat) {
	return foundry.utils.mergeObject(getDefaultStrategy(), combat?.getFlag(MODULE_ID, STRATEGY_FLAG) ?? {}, { inplace: false });
}

/** @param {Combat} combat @param {object} strategy @returns {Promise} */
export function setStrategy(combat, strategy) {
	return combat.setFlag(MODULE_ID, STRATEGY_FLAG, strategy);
}

/** Register the hooks that drive the strategy overlay. */
export function registerStrategy() {
	Hooks.on("updateCombat", onUpdateCombat);
	Hooks.on("deleteCombat", onDeleteCombat);

	if (game.user.isGM && game.combat?.started && game.combat.active) {
		refreshStrategyOverlay(game.combat);
	}
}

/** @param {Combat} combat @param {object} changes */
function onUpdateCombat(combat, changes) {
	if (!game.user.isGM || !combat.active) {
		return;
	}

	if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${STRATEGY_FLAG}`) && combat.started) {
		refreshStrategyOverlay(combat);
	}

	if ("turn" in changes || "round" in changes) {
		if (combat.started) {
			refreshStrategyOverlay(combat);
		} else {
			closeStrategyOverlay();
		}
	}
}

/** @param {Combat} combat */
function onDeleteCombat(combat) {
	if (ui.Dnd4eStrategyOverlay?.combatId === combat.id) {
		closeStrategyOverlay();
	}
}

/**
 * Show, refresh, or close the combined strategy overlay: the encounter's environment notes,
 * always on screen, plus whoever's turn it currently is, along with any pointer notes prepared
 * for them.
 *
 * @param {Combat} combat
 */
function refreshStrategyOverlay(combat) {
	const strategy = getStrategy(combat);
	const environmentNotes = (strategy.environment ?? []).filter((note) => note?.trim());
	const combatant = combat.combatant;
	const pointerNotes = combatant
		? strategy.pointers
			.filter((pointer) => pointer.combatantIds?.includes(combatant.id))
			.flatMap((pointer) => pointer.notes ?? [])
		: [];

	if (!environmentNotes.length && !combatant) {
		closeStrategyOverlay();
		return;
	}

	const data = {
		combatId: combat.id,
		environmentNotes,
		turnPointer: combatant ? {
			combatantName: combatant.name,
			combatantImg: combatant.actor?.img ?? combatant.token?.texture?.src ?? "icons/svg/mystery-man.svg",
			notes: pointerNotes,
		} : null,
	};

	if (!ui.Dnd4eStrategyOverlay) {
		ui.Dnd4eStrategyOverlay = new StrategyOverlayPanel({}, data);
		ui.Dnd4eStrategyOverlay.render(true);
		return;
	}

	ui.Dnd4eStrategyOverlay.setData(data);
}

/** Close the strategy overlay and clear its shared UI reference. */
function closeStrategyOverlay() {
	const panel = ui.Dnd4eStrategyOverlay;
	ui.Dnd4eStrategyOverlay = null;
	void panel?.close({ dnd4eForce: true });
}

/**
 * @returns {{left: number, top: number}|null} A previously saved position, if any. Only the
 * position is remembered: the overlay isn't resizable, and its height tracks its content (notes
 * change from turn to turn), so a fixed remembered size would clip whatever no longer fits the
 * size it happened to have last time.
 */
function getSavedPosition() {
	const saved = game.settings.get(MODULE_ID, OVERLAY_POSITION_SETTING);
	if (!saved || typeof saved !== "object") {
		return null;
	}

	return { left: saved.left, top: saved.top };
}

/** Persist the overlay's current position, debounced so dragging doesn't spam the client setting. */
const persistPosition = foundry.utils.debounce((position) => {
	void game.settings.set(MODULE_ID, OVERLAY_POSITION_SETTING, {
		left: position.left,
		top: position.top,
	});
}, 400);

/** GM-only overlay showing the encounter's environment notes and whoever's turn it currently is, with any pointer notes prepared for them. */
class StrategyOverlayPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options, data) {
		super(foundry.utils.mergeObject({
			position: getSavedPosition() ?? { left: 20, top: window.innerHeight - 320 },
		}, options));
		this.data = data;
	}

	static DEFAULT_OPTIONS = {
		id: "dnd4e-strategy-overlay",
		classes: ["dnd4e-strategy-overlay"],
		position: { width: 360, height: "auto" },
		window: { title: "Combat Pointers", resizable: false, minimizable: false },
		actions: {
			previousTurn: StrategyOverlayPanel.prototype.onPreviousTurn,
			nextTurn: StrategyOverlayPanel.prototype.onNextTurn,
			endCombat: StrategyOverlayPanel.prototype.onEndCombat,
		},
	};

	static PARTS = {
		main: { template: OVERLAY_TEMPLATE },
	};

	get combatId() {
		return this.data.combatId;
	}

	/** @param {object} data */
	setData(data) {
		this.data = data;
		this.render();
	}

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return foundry.utils.mergeObject(context, this.data);
	}

	/** Remember the GM's chosen position and size for the next time this overlay opens. */
	setPosition(position) {
		const applied = super.setPosition(position);
		persistPosition(this.position);
		return applied;
	}

	/**
	 * This overlay is driven entirely by combat state, not opened or closed by the GM directly,
	 * so only the module's own hooks (never a misclick or the Escape key) may actually close it.
	 */
	async close(options = {}) {
		if (!options.dnd4eForce) {
			return this;
		}
		return super.close(options);
	}

	/** Step back to the previous combatant's turn. */
	async onPreviousTurn() {
		if (!game.user.isGM) {
			return;
		}

		try {
			await game.combats.get(this.combatId)?.previousTurn();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to go back to the previous turn.`, error);
			ui.notifications.error("Could not go back to the previous turn. Check the console for details.");
		}
	}

	/** Advance to the next combatant's turn. */
	async onNextTurn() {
		if (!game.user.isGM) {
			return;
		}

		try {
			await game.combats.get(this.combatId)?.nextTurn();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to advance to the next turn.`, error);
			ui.notifications.error("Could not advance to the next turn. Check the console for details.");
		}
	}

	/** End the encounter, prompting for confirmation like the combat tracker's own control. */
	async onEndCombat() {
		if (!game.user.isGM) {
			return;
		}

		try {
			await game.combats.get(this.combatId)?.endCombat();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to end combat.`, error);
			ui.notifications.error("Could not end combat. Check the console for details.");
		}
	}
}
