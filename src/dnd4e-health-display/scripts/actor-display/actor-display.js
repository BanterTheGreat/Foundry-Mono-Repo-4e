import { getActorDisplayData } from "./actor-display-data.js";
import { initializeActorDisplayTooltips } from "./actor-display-tooltips.js";

const MODULE_ID = "dnd4e-health-display";
const SHOW_SETTING = "showActorDisplay";
const POSITION_SETTING = "actorDisplayPosition";
const COLLAPSED_SETTING = "actorDisplayCollapsed";
const POWER_FLAVOUR_HIDDEN_SETTING = "actorDisplayPowerFlavourHidden";
const TEMPLATE_PATH = `modules/${MODULE_ID}/scripts/actor-display/actor-display.hbs`;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let selectionRenderTimer = null;
let isActorDisplayDismissed = false;

/** Register client settings owned by the actor display. */
export function registerActorDisplaySettings() {
	game.settings.register(MODULE_ID, SHOW_SETTING, {
		name: "Show actor display",
		hint: "Show a compact action and inventory display for the currently controlled token.",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: (enabled) => {
			if (enabled) {
				renderSelectedActor();
			} else {
				closeActorDisplay();
			}
		},
	});

	game.settings.register(MODULE_ID, POSITION_SETTING, {
		name: "Actor display position",
		hint: "Saved screen position of the actor display.",
		scope: "client",
		config: false,
		type: Object,
		default: { top: null, left: null },
	});

	game.settings.register(MODULE_ID, COLLAPSED_SETTING, {
		name: "Collapse actor display",
		hint: "Show only the actor's identity and current status until the display is expanded.",
		scope: "client",
		config: false,
		type: Boolean,
		default: false,
		onChange: (collapsed) => ui.Dnd4eActorDisplay?.setCollapsed(collapsed),
	});

	game.settings.register(MODULE_ID, POWER_FLAVOUR_HIDDEN_SETTING, {
		name: "Hide player-character power flavour",
		hint: "Hide the short flavour text beneath player-character powers in the actor display.",
		scope: "client",
		config: false,
		type: Boolean,
		default: false,
		onChange: (hidden) => ui.Dnd4eActorDisplay?.setPowerFlavourHidden(hidden),
	});
}

/** Register hooks which create and refresh the actor display. */
export function registerActorDisplay() {
	Hooks.on("canvasReady", () => {
		isActorDisplayDismissed = false;
		renderSelectedActor();
	});
	Hooks.on("controlToken", scheduleSelectedActorRender);
	Hooks.on("createToken", scheduleSelectedActorRender);
	Hooks.on("deleteToken", scheduleSelectedActorRender);
	Hooks.on("updateActor", refreshForActor);
	Hooks.on("createItem", refreshForItem);
	Hooks.on("updateItem", refreshForItem);
	Hooks.on("deleteItem", refreshForItem);
	Hooks.on("createActiveEffect", refreshForEffect);
	Hooks.on("updateActiveEffect", refreshForEffect);
	Hooks.on("deleteActiveEffect", refreshForEffect);
	Hooks.on("canvasTearDown", closeActorDisplay);

	renderSelectedActor();
}

/** Render after Foundry has finished changing the controlled-token collection. */
function scheduleSelectedActorRender(token, controlled) {
	if (controlled) {
		isActorDisplayDismissed = false;
	}

	window.clearTimeout(selectionRenderTimer);
	selectionRenderTimer = window.setTimeout(renderSelectedActor, 0);
}

/** Select the best token for the current user and display it. */
function renderSelectedActor() {
	if (!game.settings.get(MODULE_ID, SHOW_SETTING) || !canvas?.ready) {
		return;
	}

	if (isActorDisplayDismissed) {
		return;
	}

	if (ui.Dnd4eActorDisplay?.isDetached) {
		return;
	}

	const token = getTokenToDisplay();
	if (!token) {
		closeActorDisplay();
		return;
	}

	if (!ui.Dnd4eActorDisplay) {
		ui.Dnd4eActorDisplay = new ActorDisplay({}, token);
		ui.Dnd4eActorDisplay.render(true);
		return;
	}

	ui.Dnd4eActorDisplay.setToken(token);
}

/**
 * Resolve the controlled token, with an owned-character fallback for players.
 *
 * @returns {Token|null}
 */
function getTokenToDisplay() {
	if (canvas.tokens?.controlled?.length === 1) {
		return canvas.tokens.controlled[0];
	}

	if (game.user.isGM) {
		return null;
	}

	if (game.user.character) {
		const assigned = canvas.tokens.placeables.find((token) => token.actor?.id === game.user.character.id);
		if (assigned) {
			return assigned;
		}
	}

	return canvas.tokens.placeables.find((token) => token.actor?.type === "Player Character"
		&& token.document.testUserPermission(game.user, "OWNER")) ?? null;
}

/** @param {Actor} actor The updated actor. */
function refreshForActor(actor) {
	const display = ui.Dnd4eActorDisplay;
	if (!display) {
		return;
	}

	if (display.actor?.id === actor.id) {
		display.render();
	}
}

/** @param {Item} item The changed embedded item. */
function refreshForItem(item) {
	refreshForActor(item.parent);
}

/** @param {ActiveEffect} effect The changed active effect. */
function refreshForEffect(effect) {
	refreshForActor(effect.parent);
}

/** Close the actor display when its canvas is removed. */
function closeActorDisplay() {
	window.clearTimeout(selectionRenderTimer);
	selectionRenderTimer = null;
	const display = ui.Dnd4eActorDisplay;
	ui.Dnd4eActorDisplay = null;
	void display?.close();
}

/** Dismiss the actor display until the user controls a token again. */
function dismissActorDisplay() {
	isActorDisplayDismissed = true;
	closeActorDisplay();
}

class ActorDisplay extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options, token) {
		super(options);
		this.token = token;
		this.activeTab = getDefaultTab(token);
		this.isCollapsed = game.settings.get(MODULE_ID, COLLAPSED_SETTING);
		this.isPowerFlavourHidden = game.settings.get(MODULE_ID, POWER_FLAVOUR_HIDDEN_SETTING);
		this.isDetached = false;
		this.savedScrollTop = 0;
		this.powerSearchQuery = "";
		this.expandedPowerIds = new Set();
	}

	static DEFAULT_OPTIONS = {
		id: "dnd4e-info-actor-display",
		tag: "aside",
		classes: ["dnd4e-info-actor-display"],
		position: {
			top: 16,
			left: 16,
			width: 368,
			height: "auto",
		},
		dragResizable: false,
		window: { frame: false },
		actions: {
			dismiss: ActorDisplay.prototype.onDismiss,
			toggleDetach: ActorDisplay.prototype.onToggleDetach,
			toggleCollapse: ActorDisplay.prototype.onToggleCollapse,
			togglePowerFlavour: ActorDisplay.prototype.onTogglePowerFlavour,
			showSection: ActorDisplay.prototype.onShowSection,
			power: { handler: ActorDisplay.prototype.onPower, buttons: [0, 2] },
			chatPower: ActorDisplay.prototype.onChatPower,
			rollPowerDamage: ActorDisplay.prototype.onRollPowerDamage,
			refreshPower: ActorDisplay.prototype.onRefreshPower,
			togglePowerDetails: ActorDisplay.prototype.onTogglePowerDetails,
			skill: ActorDisplay.prototype.onSkill,
			feature: { handler: ActorDisplay.prototype.onFeature, buttons: [0, 2] },
			item: { handler: ActorDisplay.prototype.onItem, buttons: [0, 2] },
			toggleEquip: ActorDisplay.prototype.onToggleEquip,
			quick: ActorDisplay.prototype.onQuickAction,
		},
	};

	static PARTS = {
		main: { template: TEMPLATE_PATH },
	};

	get actor() {
		return this.token?.actor;
	}

	/** @param {Token} token The new displayed token. */
	setToken(token) {
		if (this.isDetached) {
			return;
		}

		const actorChanged = this.actor?.id !== token.actor?.id;
		this.token = token;
		if (actorChanged) {
			this.activeTab = getDefaultTab(token);
			this.savedScrollTop = 0;
			this.powerSearchQuery = "";
			this.expandedPowerIds.clear();
		}
		this.render();
	}

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return foundry.utils.mergeObject(context, {
			...await getActorDisplayData(this.token, this.activeTab, this.expandedPowerIds),
			isCollapsed: this.isCollapsed,
			isPowerFlavourHidden: this.isPowerFlavourHidden,
			isDetached: this.isDetached,
			powerSearchQuery: this.powerSearchQuery,
		});
	}

	/** Place the frameless display directly in the document body. */
	_insertElement(element) {
		document.body.appendChild(element);
	}

	/** Initialize DOM behavior after each render. */
	_onRender(context, options) {
		super._onRender(context, options);
		this.element.querySelector(".dnd4e-info-actor-display__workspace")?.scrollTo(0, this.savedScrollTop);
		this.initializeResourceInputs();
		this.initializePowerSearch();
		initializeActorDisplayTooltips(this.element, this.actor);
		this.initializeDrag();
		this.restorePosition();
	}

	/** Preserve the inventory scroll position across document refreshes. */
	render(options = {}) {
		this.savedScrollTop = this.element?.querySelector(".dnd4e-info-actor-display__workspace")?.scrollTop ?? this.savedScrollTop;
		return super.render(options);
	}

	/** Bind editable resource inputs. */
	initializeResourceInputs() {
		for (const input of this.element.querySelectorAll("[data-resource-path]")) {
			let submittedValue = input.value;
			const submit = async () => {
				const value = Number(input.value);
				if (!Number.isFinite(value) || input.value === submittedValue) {
					return;
				}

				submittedValue = input.value;
				await this.actor.update({ [input.dataset.resourcePath]: value });
			};

			input.addEventListener("keydown", async (event) => {
				if (event.key !== "Enter") {
					return;
				}

				await submit();
				input.blur();
			});
			input.addEventListener("blur", () => void submit());
		}
	}

	/** Make the display draggable from its identity header. */
	initializeDrag() {
		const handle = this.element.querySelector(".dnd4e-info-actor-display__identity");
		if (!handle) {
			return;
		}

		handle.addEventListener("pointerdown", (event) => {
			if (event.button !== 0 || event.target.closest("input, button, [data-action]")) {
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

	/** Restore the user's last saved display position. */
	restorePosition() {
		const position = game.settings.get(MODULE_ID, POSITION_SETTING);
		if (position?.left != null && position?.top != null) {
			this.setPosition(position);
		}
	}

	/** Dismiss this actor display until the user controls a token again. */
	onDismiss() {
		dismissActorDisplay();
	}

	/** Toggle whether the display follows the controlled token. */
	onToggleDetach() {
		this.isDetached = !this.isDetached;
		if (this.isDetached) {
			this.render();
			return;
		}

		renderSelectedActor();
	}

	/** @param {boolean} collapsed Whether to show the status-only display. */
	setCollapsed(collapsed) {
		if (this.isCollapsed === collapsed) {
			return;
		}

		this.isCollapsed = collapsed;
		this.render();
	}

	/** Toggle between the full display and the status-only display. */
	async onToggleCollapse() {
		await game.settings.set(MODULE_ID, COLLAPSED_SETTING, !this.isCollapsed);
	}

	/** Bind the live power-name filter for player-character displays. */
	initializePowerSearch() {
		const input = this.element.querySelector("[data-power-search]");
		if (!input) {
			return;
		}

		const filter = () => {
			this.powerSearchQuery = input.value;
			const query = this.powerSearchQuery.trim().toLocaleLowerCase();
			let matchingPowers = 0;

			for (const power of this.element.querySelectorAll("[data-power-name]")) {
				const matches = !query || power.dataset.powerName.toLocaleLowerCase().includes(query);
				power.hidden = !matches;
				matchingPowers += Number(matches);
			}

			for (const category of this.element.querySelectorAll("[data-power-category]")) {
				category.hidden = !category.querySelector("[data-power-name]:not([hidden])");
			}

			const emptyState = this.element.querySelector("[data-power-search-empty]");
			if (emptyState) {
				emptyState.hidden = matchingPowers !== 0;
			}
		};

		input.addEventListener("input", filter);
		filter();
	}

	/**
	 * Set whether player-character power flavour text is hidden.
	 *
	 * @param {boolean} hidden Whether to hide player-character power flavour text.
	 */
	setPowerFlavourHidden(hidden) {
		if (this.isPowerFlavourHidden === hidden) {
			return;
		}

		this.isPowerFlavourHidden = hidden;
		this.render();
	}

	/**
	 * Toggle the player-character power flavour text.
	 */
	async onTogglePowerFlavour() {
		await game.settings.set(MODULE_ID, POWER_FLAVOUR_HIDDEN_SETTING, !this.isPowerFlavourHidden);
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	onShowSection(event, target) {
		this.activeTab = target.dataset.displayTab;
		this.savedScrollTop = 0;
		this.render();
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	async onPower(event, target) {
		const power = this.actor.items.get(target.dataset.itemId);
		if (event.button === 2) {
			power?.sheet.render(true);
			return;
		}
		if (power) {
			if (this.actor.type === "NPC" && power.hasAttack) {
				await this.consumePowerUse(power);
				await power.rollAttack();
				return;
			}
			await this.actor.usePower(power);
		}
	}

	/**
	 * Consume an NPC power's limited use before its direct attack roll.
	 *
	 * This mirrors the DnD4e actor's normal usePower workflow, which the
	 * direct rollAttack call intentionally bypasses to avoid posting a chat card.
	 *
	 * @param {Item} power The NPC power being used.
	 */
	async consumePowerUse(power) {
		const uses = power.system?.uses;
		if (!uses?.per) {
			return;
		}

		const currentUses = Number.parseInt(uses.value || 0, 10) || 0;
		if (currentUses <= 0) {
			ui.notifications.warn(game.i18n.format("DND4E.ItemNoUses", { name: power.name }));
		}

		if (game.combat || !["round", "turn"].includes(uses.per)) {
			await power.update({ "system.uses.value": Math.max(currentUses - 1, 0) });
		}
	}

	/** Send an NPC power's standard item card to chat. */
	onChatPower(event, target) {
		return this.actor.items.get(target.dataset.itemId)?.roll();
	}

	/** Roll an NPC power's damage through the DnD4e damage workflow. */
	onRollPowerDamage(event, target) {
		return this.actor.items.get(target.dataset.itemId)?.rollDamage({ event });
	}

	/** Toggle the full rules details for one player-character power. */
	onTogglePowerDetails(event, target) {
		const powerId = target.dataset.itemId;
		if (this.expandedPowerIds.has(powerId)) {
			this.expandedPowerIds.delete(powerId);
		} else {
			this.expandedPowerIds.add(powerId);
		}
		this.render();
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	async onRefreshPower(event, target) {
		const power = this.actor.items.get(target.dataset.itemId);
		if (power) {
			await power.update({ "system.uses.value": power.system?.uses?.max });
			await whisperPowerRefresh(this.actor, power);
		}
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	onSkill(event, target) {
		return this.actor.rollSkill(target.dataset.skill, { fastForward: true });
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	onFeature(event, target) {
		const feature = this.actor.items.get(target.dataset.itemId);
		if (event.button === 2) {
			return feature?.sheet.render(true);
		}
		if (feature?.hasAttack) {
			return feature.rollAttack();
		}
		return feature?.roll();
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	onItem(event, target) {
		const item = this.actor.items.get(target.dataset.itemId);
		if (event.button === 2) {
			return item?.sheet.render(true);
		}
		return item?.roll();
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	async onToggleEquip(event, target) {
		const item = this.actor.items.get(target.dataset.itemId);
		if (item) {
			await item.update({ "system.equipped": !item.system?.equipped });
		}
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	onQuickAction(event, target) {
		const hooks = dnd4e.compatibility.tah.TokenBarHooks;
		switch (target.dataset.command) {
			case "actionPoint": return hooks.actionPoint(this.actor, event);
			case "savingThrow": return hooks.saveDialog(this.actor, event);
			case "initiative": return this.actor.rollInitiative({ createCombatants: true }, { event });
			case "healing": return hooks.healDialog(this.actor, event);
			case "secondWind": return hooks.secondWind(this.actor, event);
			case "shortRest": return new dnd4e.applications.apps.ShortRestDialog({ document: this.actor }).render(true);
			case "extendedRest": return new dnd4e.applications.apps.LongRestDialog({ document: this.actor }).render(true);
			case "deathSave": return hooks.deathSave(this.actor, event);
			case "openSheet": return this.actor.sheet.render(true);
			default: return undefined;
		}
	}
}

/**
 * Notify the currently online GMs that an actor-display power was refreshed.
 *
 * @param {Actor} actor The actor which owns the refreshed power.
 * @param {Item} power The power whose uses were restored.
 */
async function whisperPowerRefresh(actor, power) {
	const recipients = game.users
		.filter((user) => user.active && user.isGM)
		.map((user) => user.id);
	if (!recipients.length) {
		return;
	}

	const userName = Handlebars.escapeExpression(game.user.name);
	const actorName = Handlebars.escapeExpression(actor.name);
	const powerName = Handlebars.escapeExpression(power.name);
	await ChatMessage.create({
		content: `<p><strong>${userName}</strong> refreshed <strong>${powerName}</strong> for <strong>${actorName}</strong>.</p>`,
		whisper: recipients,
	});
}

/** @param {Token} token The token whose actor determines the initial tab. */
function getDefaultTab(token) {
	return token.actor?.type === "NPC" ? "features" : "powers";
}
