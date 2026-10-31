import { bindPowerHitChanceHover } from "./power-hit-chance-hover.js";
import { bindPowerRangeHover } from "../power-activation/power-range-hover.js";
import { getActorDisplayData, getGroupHealthBars } from "./actor-display-data.js";
import { getNpcPowerHints, formatPowerHitChances } from "./npc-power-hints.js";
import { initializeActorDisplayTooltips, generateSystemTooltip } from "./actor-display-tooltips.js";
import { useAbility, showPowerInChat, isPowerActivationActive } from "../power-activation/power-activation.js";

const MODULE_ID = "dnd4e-health-display";
const HORIZONTAL_HUD_BODY_CLASS = "dnd4e-horizontal-hud-active";
const HORIZONTAL_HUD_HEIGHT_PROPERTY = "--dnd4e-horizontal-hud-height";
const SHOW_ACTOR_SETTING = "showHorizontalActorDisplay";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let selectionRenderTimer = null;
let isActorDismissed = false;

/** Register client settings owned by the actor display. */
export function registerActorDisplaySettings() {
	game.settings.register(MODULE_ID, SHOW_ACTOR_SETTING, {
		name: "Show Actor HUD",
		hint: "Show the portrait, power and character menus above the macro bar for the currently controlled player-character token. GMs also get it for any controlled token.",
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

}

/** Register hooks which create and refresh the actor display. */
export function registerActorDisplay() {
	Hooks.on("canvasReady", () => {
		isActorDismissed = false;
		renderSelectedActor();
	});
	Hooks.on("controlToken", scheduleSelectedActorRender);
	Hooks.on("createToken", scheduleSelectedActorRender);
	Hooks.on("deleteToken", scheduleSelectedActorRender);
	Hooks.on("updateToken", refreshForToken);
	Hooks.on("updateActor", refreshForActor);
	Hooks.on("createItem", refreshForItem);
	Hooks.on("updateItem", refreshForItem);
	Hooks.on("deleteItem", refreshForItem);
	Hooks.on("createActiveEffect", refreshForEffect);
	Hooks.on("updateActiveEffect", refreshForEffect);
	Hooks.on("deleteActiveEffect", refreshForEffect);
	Hooks.on("updateCombat", refreshAllActorDisplays);
	Hooks.on("deleteCombat", refreshAllActorDisplays);
	Hooks.on("canvasTearDown", closeAllActorDisplays);

	renderSelectedActor();
}

/** Render after Foundry has finished changing the controlled-token collection. */
function scheduleSelectedActorRender(token, controlled) {
	if (controlled) {
		isActorDismissed = false;
	}

	window.clearTimeout(selectionRenderTimer);
	selectionRenderTimer = window.setTimeout(renderSelectedActor, 0);
}

/** Select the best token for the current user and update the actor HUD. */
function renderSelectedActor() {
	if (!canvas?.ready) {
		return;
	}

	const group = getSelectedNpcGroup();
	const token = group?.[0] ?? getTokenToDisplay();
	const isActorEnabled = game.settings.get(MODULE_ID, SHOW_ACTOR_SETTING);
	const isNpcToken = Boolean(token) && token.actor?.type !== "Player Character";

	// The actor HUD is player-character only for regular players. GMs may run it for any
	// selected token.
	const showActor = isActorEnabled && (!isNpcToken || game.user.isGM);

	updateActorDisplay(showActor ? token : null, group ?? [token]);
}

/**
 * @param {Token|null} token The token the horizontal display should follow, or null to hide it.
 * @param {Token[]} tokens Every token represented by the display; the first is the primary token.
 */
function updateActorDisplay(token, tokens = [token]) {
	if (isActorDismissed) {
		return;
	}

	if (!token) {
		closeActorDisplay();
		return;
	}

	if (!ui.Dnd4eActorPortrait) {
		ui.Dnd4eActorPortrait = new ActorPortraitDisplay({}, token, tokens);
		ui.Dnd4eActorPortrait.render(true);
	} else {
		ui.Dnd4eActorPortrait.setToken(token, tokens);
	}

	if (!ui.Dnd4eActorDisplay) {
		ui.Dnd4eActorDisplay = new ActorDisplay({}, token, tokens);
		ui.Dnd4eActorDisplay.render(true);
	} else {
		ui.Dnd4eActorDisplay.setToken(token, tokens);
	}

}

/**
 * Resolve a multi-token selection of one NPC type for GMs.
 *
 * Tokens of the same creature type share their source actor id, whether they are linked or
 * unlinked, so renamed tokens such as "Goblin 1" and "Goblin 2" still group together.
 *
 * @returns {Token[]|null} The controlled tokens in selection order, or null when not applicable.
 */
function getSelectedNpcGroup() {
	const controlled = canvas.tokens?.controlled ?? [];
	if (controlled.length < 2 || !game.user.isGM) {
		return null;
	}

	const actorId = controlled[0].document?.actorId;
	const isSameCreature = controlled.every((token) => token.actor?.type === "NPC"
		&& token.document?.actorId === actorId);
	return actorId && isSameCreature ? Array.from(controlled) : null;
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

/** Re-render the actor display, e.g. when the combat tracker's turn changes. */
function refreshAllActorDisplays() {
	ui.Dnd4eActorPortrait?.render();
	ui.Dnd4eActorDisplay?.render();
}

/** Refresh scene-PC names and placed disposition without rerendering on every token move. */
function refreshForToken(_token, changes) {
	if (["name", "disposition", "actorId", "actorLink", "delta"].some(key => key in changes)) {
		refreshAllActorDisplays();
	}
}

/**
 * Refresh an available HUD for actor-owned document changes.
 *
 * @param {Actor|null} actor The updated actor, or null for world Items.
 */
function refreshForActor(actor) {
	const display = ui.Dnd4eActorDisplay;
	if (!actor || !display) {
		return;
	}

	if (display.actor?.id === actor.id || actor.type === "Player Character"
		|| display.tokens?.some((token) => token.actor?.id === actor.id)) {
		display.render();
		ui.Dnd4eActorPortrait?.render();
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

/** Close the actor HUD when its canvas is removed. */
function closeActorDisplay() {
	const portrait = ui.Dnd4eActorPortrait;
	ui.Dnd4eActorPortrait = null;
	void portrait?.close({ animate: false });
	const display = ui.Dnd4eActorDisplay;
	ui.Dnd4eActorDisplay = null;
	void display?.close({ animate: false });
}

/** Close the actor display. */
function closeAllActorDisplays() {
	window.clearTimeout(selectionRenderTimer);
	selectionRenderTimer = null;
	closeActorDisplay();
}

/** Dismiss the actor HUD until the user controls a token again. */
function dismissActorDisplay() {
	isActorDismissed = true;
	closeActorDisplay();
}

/**
 * Shared token-tracking, data-preparation, and interaction logic for the actor display.
 */
class ActorDisplayBase extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options, token, tokens = [token]) {
		super(options);
		this.token = token;
		this.tokens = tokens;
		this.activeTab = this.getInitialTab(token);
		this.savedScrollTop = 0;
		this.powerSearchQuery = "";
		this.activePowerCategory = null;
		this.expandedPowerIds = new Set();
	}

	/** The primary token's actor. Group actions always resolve through the first selected token. */
	get actor() {
		return this.token?.actor;
	}

	/** @returns {boolean} Whether several creatures of one NPC type are selected together. */
	get isGroup() {
		return (this.tokens?.length ?? 0) > 1;
	}

	/** @returns {string} The CSS selector of this layout's scrollable workspace, if any. */
	get scrollSelector() {
		return null;
	}

	/** @param {Token} token The token about to be displayed. @returns {string|null} */
	getInitialTab(token) {
		return token.actor?.type === "NPC" ? "features" : "powers";
	}

	/**
	 * @param {Token} token The new displayed (primary) token.
	 * @param {Token[]} tokens Every token represented by the display.
	 */
	setToken(token, tokens = [token]) {
		const actorChanged = this.actor?.id !== token.actor?.id;
		this.token = token;
		this.tokens = tokens;
		if (actorChanged) {
			this.activeTab = this.getInitialTab(token);
			this.savedScrollTop = 0;
			this.powerSearchQuery = "";
			this.hudSearchQuery = "";
			this.activePowerCategory = null;
			this.expandedPowerIds.clear();
		}

		// Group selections only offer the Sheet menu, so leave any other open menu behind.
		if (this.isGroup && this.activeTab && this.activeTab !== "sheet") {
			this.activeTab = "sheet";
			this.savedScrollTop = 0;
		}
		this.render();
	}

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const data = await getActorDisplayData(this.token, this.activeTab, this.expandedPowerIds, this.activePowerCategory);
		const groupData = this.isGroup ? {
			isGroup: true,
			name: `${this.tokens.length} creatures selected`,
			groupBars: getGroupHealthBars(this.tokens),
		} : { isGroup: false };
		return foundry.utils.mergeObject(context, {
			...data,
			...groupData,
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
		if (this.scrollSelector) {
			this.element.querySelector(this.scrollSelector)?.scrollTo(0, this.savedScrollTop);
		}
		this.initializeResourceInputs();
		this.initializePowerSearch();
		this.initializePowerContextMenus();
		initializeActorDisplayTooltips(this.element, this.actor);
	}

	/** Open the embedded Power Sheet when any part of a floating power row is right-clicked. */
	initializePowerContextMenus() {
		for (const row of this.element.querySelectorAll(".dnd4e-actor-display__power[data-item-id]")) {
			row.addEventListener("contextmenu", event => {
				event.preventDefault();
				event.stopPropagation();
				this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
			});
		}
	}

	/** Preserve the workspace scroll position across document refreshes. */
	render(options = {}) {
		this.clearPowerHitChanceHover?.();
		this.clearPowerHitChanceHover = null;
		this.clearPowerRangeHover?.();
		this.clearPowerRangeHover = null;
		if (this.scrollSelector) {
			this.savedScrollTop = this.element?.querySelector(this.scrollSelector)?.scrollTop ?? this.savedScrollTop;
		}
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

			const emptyState = this.element.querySelector("[data-power-search-empty]");
			if (emptyState) {
				emptyState.hidden = matchingPowers !== 0;
			}
		};

		input.addEventListener("input", filter);
		filter();
	}

	/** Select the visible action-type group in the Powers drawer. */
	onSelectPowerCategory(event, target) {
		this.activePowerCategory = target.dataset.powerCategory;
		this.savedScrollTop = 0;
		this.render();
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	onShowSection(event, target) {
		this.activeTab = target.dataset.displayTab;
		this.savedScrollTop = 0;
		this.render();
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	async onPower(event, target) {
		// Target automation is single-creature only for now.
		if (this.isGroup && event.button !== 2) {
			return;
		}

		const power = this.actor.items.get(target.dataset.itemId);
		if (event.button === 2) {
			power?.sheet.render(true);
			return;
		}
		if (power) {
			if (await useAbility(power, this.token)) {
				return;
			}
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

	/**
	 * Post through the activation service, which preserves normal costs for non-automated powers.
	 */
	onChatPower(event, target) {
		const power = this.actor.items.get(target.dataset.itemId);
		if (power) {
			return showPowerInChat(power);
		}
	}

	/** Roll an NPC power's damage through the DnD4e damage workflow. */
	onRollPowerDamage(event, target) {
		return this.actor.items.get(target.dataset.itemId)?.rollDamage({ event });
	}

	/** Toggle the full rules details for one player-character power. */
	onTogglePowerDetails(event, target) {
		game.tooltip.deactivate();
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
			case "endTurn": return this.onEndTurn();
			default: return undefined;
		}
	}

	/** Advance the combat tracker to the next turn, ending this actor's turn. */
	async onEndTurn() {
		try {
			await game.combat?.nextTurn();
		} catch (error) {
			console.error(`${MODULE_ID} | Failed to end turn.`, error);
			ui.notifications.error("Could not end turn. Check the console for details.");
		}
	}
}

class ActorPortraitDisplay extends ActorDisplayBase {
	constructor(options, token, tokens) {
		super(options, token, tokens);
		this.openDropdown = null;
		this.hudSearchQuery = "";
		this._nameFitFrame = null;
		this._nameResizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
			this.scheduleActorNameFit();
		});
		this._onDocumentClick = this._onDocumentClick.bind(this);
		this._onHudKeydown = this._onHudKeydown.bind(this);
		this._onHudResize = () => this.scheduleActorNameFit();
		document.addEventListener("click", this._onDocumentClick);
		document.addEventListener("keydown", this._onHudKeydown);
		window.addEventListener("resize", this._onHudResize);
	}

	static DEFAULT_OPTIONS = {
		id: "dnd4e-horizontal-actor-display",
		tag: "aside",
		classes: ["dnd4e-horizontal-actor-display"],
		position: {
			width: "auto",
			height: "auto",
		},
		dragResizable: false,
		window: { frame: false },
			actions: {
			dismiss: ActorPortraitDisplay.prototype.onDismiss,
			toggleDropdown: ActorPortraitDisplay.prototype.onToggleDropdown,
			quick: ActorPortraitDisplay.prototype.onQuickAction,
		},
	};

	static PARTS = {
		main: { template: `modules/${MODULE_ID}/scripts/actor-display/actor-portrait.hbs` },
	};

	/** The portrait has no tab drawer; menus belong to ActorDisplay. */
	getInitialTab() {
		return null;
	}

	/** @returns {object} */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.tabs = [];
		context.activeTab = null;
		return foundry.utils.mergeObject(context, {
			openDropdown: this.openDropdown,
			isSaveOpen: this.openDropdown === "save",
			isHealOpen: this.openDropdown === "heal",
			isRestOpen: this.openDropdown === "rest",
		});
	}

	/** Lift the players list clear of the HUD and initialize its layout. */
	_onRender(context, options) {
		super._onRender(context, options);
		document.body.classList.add(HORIZONTAL_HUD_BODY_CLASS);
		this.initializeActorNameFit();
		const height = this.element?.getBoundingClientRect().height ?? 0;
		document.documentElement.style.setProperty(HORIZONTAL_HUD_HEIGHT_PROPERTY, `${height}px`);
	}

	/** Refit the actor name whenever its available space changes. */
	initializeActorNameFit() {
		const nameLine = this.element?.querySelector(".dnd4e-horizontal-actor-display__name-line, .dnd4e-horizontal-actor-display__portrait-name-row");
		this._nameResizeObserver?.disconnect();
		if (nameLine) {
			this._nameResizeObserver?.observe(nameLine);
		}

		this.scheduleActorNameFit();
	}

	/** Schedule a name measurement after the browser has applied the current layout. */
	scheduleActorNameFit() {
		window.cancelAnimationFrame(this._nameFitFrame);
		this._nameFitFrame = window.requestAnimationFrame(() => {
			this._nameFitFrame = null;
			this.fitActorName();
			});
	}

	/** Scale an overlong actor name to the precise width left beside the quick-action buttons. */
	fitActorName() {
		const name = this.element?.querySelector(".dnd4e-horizontal-actor-display__name-line h2, .dnd4e-horizontal-actor-display__portrait-name-row h2");
		if (!name) {
			return;
		}

		// A resize or a previous measurement may have left a smaller inline size behind. Start from
		// the design size so the ratio always compares the complete name to its actual current space.
		name.style.removeProperty("font-size");
		const availableWidth = name.getBoundingClientRect().width;
		const naturalWidth = name.scrollWidth;
		if (availableWidth === 0 || naturalWidth <= availableWidth) {
			return;
		}

		const fontSize = Number.parseFloat(getComputedStyle(name).fontSize);
		if (!fontSize) {
			return;
		}

		// Leave one CSS pixel of headroom: scrollWidth rounds up while the flex layout can give
		// this element a fractional width. Without that allowance an apparently exact ratio can still
		// trigger the ellipsis for the final character.
		const scale = Math.max(0, (availableWidth - 1) / naturalWidth);
		name.style.fontSize = `${fontSize * scale}px`;
	}

	/** Close portrait dropdowns when clicking outside. */
	_onDocumentClick(event) {
		if (this.openDropdown && !this.element?.contains(event.target)) {
			this.openDropdown = null;
			this.render();
		}
	}

	/** Close portrait dropdowns with Escape. */
	_onHudKeydown(event) {
		if (event.key === "Escape" && this.openDropdown) {
			this.openDropdown = null;
			this.render();
		}
	}

	/** Dismiss this actor display until the user controls a token again. */
	onDismiss() {
		dismissActorDisplay();
	}

	/** @param {PointerEvent} event The action event. @param {HTMLElement} target The action target. */
	onToggleDropdown(event, target) {
		event.stopPropagation();
		const id = target.dataset.dropdown;
		this.openDropdown = this.openDropdown === id ? null : id;
		this.render();
	}

	/** Close the open dropdown after resolving a quick action. */
	onQuickAction(event, target) {
		event.stopPropagation();
		this.openDropdown = null;
		return super.onQuickAction(event, target);
	}

	/** Stop tracking outside clicks and restore Foundry's own bottom-left UI once this display is closed. */
	async close(options) {
		window.cancelAnimationFrame(this._nameFitFrame);
		this._nameResizeObserver?.disconnect();
		document.removeEventListener("click", this._onDocumentClick);
		document.removeEventListener("keydown", this._onHudKeydown);
		window.removeEventListener("resize", this._onHudResize);
		document.body.classList.remove(HORIZONTAL_HUD_BODY_CLASS);
		document.documentElement.style.removeProperty(HORIZONTAL_HUD_HEIGHT_PROPERTY);
		return super.close(options);
	}
}

/** Main actor menus anchored to Foundry's macro bar. */
class ActorDisplay extends ActorDisplayBase {
	constructor(options, token, tokens) {
		super(options, token, tokens);
		this.activePowerCategory = null;
		this.activeTab = this.getInitialTab(token);
		this.hudSearchQuery = "";
		this.positionAboveHotbar = this.positionAboveHotbar.bind(this);
		this.hotbarFrame = null;
		this.hotbarPosition = null;
		this.onOutsideClick = this.onOutsideClick.bind(this);
		this.onEscape = this.onEscape.bind(this);
		this.layoutObserver = new ResizeObserver(this.positionAboveHotbar);
		window.addEventListener("resize", this.positionAboveHotbar);
		document.addEventListener("pointerdown", this.onOutsideClick);
		document.addEventListener("keydown", this.onEscape);
		this.hotbarHook = Hooks.on("renderHotbar", this.positionAboveHotbar);
		this.sidebarHook = Hooks.on("collapseSidebar", this.positionAboveHotbar);
	}

	static DEFAULT_OPTIONS = {
		id: "dnd4e-actor-display",
		tag: "aside",
		classes: ["dnd4e-actor-display"],
		position: { width: "auto", height: "auto" },
		window: { frame: false },
		actions: {
			selectPowerCategory: ActorDisplay.prototype.onSelectPowerCategory,
			closePowers: ActorDisplay.prototype.onClosePowers,
			selectMenu: ActorDisplay.prototype.onSelectMenu,
			openFeatSheet: ActorDisplay.prototype.onOpenFeatSheet,
			skill: ActorDisplay.prototype.onSkill,
			feature: { handler: ActorDisplay.prototype.onFeature, buttons: [0, 2] },
			item: { handler: ActorDisplay.prototype.onItem, buttons: [0, 2] },
			toggleEquip: ActorDisplay.prototype.onToggleEquip,
			quick: ActorDisplay.prototype.onQuickAction,
			power: { handler: ActorDisplay.prototype.onPower, buttons: [0, 2] },
			chatPower: ActorDisplay.prototype.onChatPower,
			refreshPower: ActorDisplay.prototype.onRefreshPower,
		},
	};

	static PARTS = {
		main: { template: `modules/${MODULE_ID}/scripts/actor-display/actor-display.hbs` },
	};

	/** Open a feat sheet without toggling its containing disclosure. */
	onOpenFeatSheet(event, target) {
		event.preventDefault();
		event.stopPropagation();
		return this.actor.items.get(target.dataset.itemId)?.sheet.render(true);
	}

	/** Open the Sheet for newly displayed NPCs; leave PC menus closed. */
	getInitialTab(token) {
		return token?.actor?.type === "NPC" ? "sheet" : null;
	}

	get scrollSelector() {
		return ".dnd4e-actor-display__list";
	}

	/** Prepare four action groups; move, rest and unclassified powers belong to Other. */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const groups = ["Standard", "Minor", "Reaction", "Other"].map((name) => ({
			key: name.toLowerCase(), name, powers: [],
		}));
		for (const category of context.powerCategories) {
			const group = groups.find((entry) => entry.key === category.key) ?? groups[3];
			group.powers.push(...category.powers);
		}
		groups[3].name = "Others";
		const isNpc = this.actor?.type === "NPC";
		const isNpcSheet = isNpc && this.activeTab === "sheet";
		const npcFeatures = Array.from(this.actor?.items ?? [])
			.filter((item) => item.type === "feature")
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((item) => ({ id: item.id, name: item.name }));
		if (isNpcSheet) {
			await Promise.all(npcFeatures.map(async (feature) => {
				feature.expanded = npcFeatures.length <= 2;
				feature.html = await generateSystemTooltip(this.actor, this.actor.items.get(feature.id));
			}));
		}
		const selected = isNpcSheet ? { name: "Sheet", powers: groups.flatMap((group) => group.powers) }
			: groups.find((group) => group.key === this.activePowerCategory);
		if (isNpcSheet) {
			selected.powers = await Promise.all(selected.powers.map(async power => {
				const item = this.actor.items.get(power.id);
				const hints = getNpcPowerHints(item, this.token, canvas.tokens?.placeables ?? []);
				if (hints.weakTargets?.length && typeof item.getAttackBonus === "function") {
					try {
						const bonus = await item.getAttackBonus();
						hints.weakSummary = formatPowerHitChances(hints.weakTargets, bonus);
						hints.weakTooltip += " Percentages are base d20 hit chances, including natural 1/20; situational modifiers, combat advantage, cover, concealment and roll modes are excluded.";
					} catch (error) {
						console.warn(`Dnd4e Info Displays | Could not calculate ${item.name}'s hit chances.`, error);
					}
				}
				return {
					...power,
					...hints,
					// Target automation is disabled while several creatures are selected.
					canTargetAutomation: power.canTargetAutomation && !this.isGroup,
					isBasic: (item.attack ?? item.system?.attack)?.isBasic === true,
				};
			}));
			const basicPowers = selected.powers.filter(power => power.isBasic);
			const otherPowers = selected.powers.filter(power => !power.isBasic);
			selected.powers = [
				...basicPowers.map((power, index) => ({ ...power, npcPowerGroup: index === 0 ? "Basic Attacks" : "" })),
				...otherPowers.map((power, index) => ({ ...power, npcPowerGroup: index === 0 ? "Other Powers" : "" })),
			];
		}
		return { ...context, isNpc, isNpcSheet, npcFeatures, categories: (isNpc ? [] : groups).map((group) => ({
			...group, active: group === selected,
		})), selectedCategory: selected,
			hudSearchQuery: this.hudSearchQuery,
			selectedMenu: this.activeTab && !isNpcSheet ? { name: this.activeTab === "extras" ? "Extras" : context.activeTabLabel } : null,
			isExtras: this.activeTab === "extras",
			sheetMenu: isNpc ? { active: isNpcSheet } : null,
			menus: [...(isNpc ? [] : [{ key: "features", name: "Feats" }]), { key: "skills", name: "Skills" },
				{ key: "items", name: "Items" }, { key: "extras", name: "Extras" }]
				.map((menu) => ({ ...menu, active: this.activeTab === menu.key })),
		};
	}

	/** Bind tooltips and keep the selector aligned after hotbar or viewport layout changes. */
	_onRender(context, options) {
		super._onRender(context, options);
		if (context.isNpcSheet) {
			this.clearPowerRangeHover = bindPowerRangeHover(this.element, this.actor, this.token, isPowerActivationActive);
			this.clearPowerHitChanceHover = bindPowerHitChanceHover(this.element, this.actor, this.token, isPowerActivationActive);
		}
		this.hotbarPosition = null;
		this.layoutObserver.disconnect();
		const hotbar = document.getElementById("hotbar");
		if (hotbar) {
			this.layoutObserver.observe(hotbar);
		}
		this.layoutObserver.observe(document.body);
		this.positionAboveHotbar();
		this.trackHotbarPosition();
		this.initializeHudSearch();
	}

	/** Filter the existing skill, feature and inventory entries without refreshing the actor. */
	initializeHudSearch() {
		const input = this.element.querySelector("[data-hud-search]");
		if (!input) {
			return;
		}
		const filter = () => {
			this.hudSearchQuery = input.value;
			const query = input.value.trim().toLocaleLowerCase();
			let count = 0;
			for (const entry of this.element.querySelectorAll("[data-hud-entry]")) {
				entry.hidden = !entry.dataset.hudEntry.toLocaleLowerCase().includes(query);
				count += Number(!entry.hidden);
			}
			for (const group of this.element.querySelectorAll(".dnd4e-horizontal-actor-display__group")) {
				group.hidden = !group.querySelector("[data-hud-entry]:not([hidden])");
			}
			const empty = this.element.querySelector("[data-hud-search-empty]");
			if (empty) {
				empty.hidden = count > 0;
			}
		};
		input.addEventListener("input", filter);
		filter();
	}

	/** Follow position-only layout changes and sidebar animations while the HUD is rendered. */
	trackHotbarPosition() {
		window.cancelAnimationFrame(this.hotbarFrame);
		const follow = () => {
			this.positionAboveHotbar();
			this.hotbarFrame = window.requestAnimationFrame(follow);
		};
		this.hotbarFrame = window.requestAnimationFrame(follow);
	}


	/** Toggle a character menu in the shared macro-bar popup. */
	onSelectMenu(event, target) {
		this.activeTab = this.activeTab === target.dataset.displayTab ? null : target.dataset.displayTab;
		this.activePowerCategory = null;
		this.hudSearchQuery = "";
		this.savedScrollTop = 0;
		game.tooltip.deactivate();
		this.render();
	}

	/** Place the selector immediately above the actual hotbar, including UI scaling. */
	positionAboveHotbar() {
		const bar = document.getElementById("hotbar")?.getBoundingClientRect();
		if (!this.element) {
			return;
		}
		this.element.hidden = !bar?.width || !bar?.height;
		if (this.element.hidden) {
			return;
		}
		// Application roots inherit Foundry's UI scale; convert viewport pixels to CSS coordinates.
		const scale = this.element.getBoundingClientRect().width / this.element.offsetWidth || 1;
		const position = [bar.left, bar.top, bar.width, scale, window.innerHeight].join(":");
		if (position === this.hotbarPosition) {
			return;
		}
		this.hotbarPosition = position;
		this.element.style.setProperty("--power-dock-left", `${bar.left / scale}px`);
		this.element.style.setProperty("--power-dock-bottom", `${(window.innerHeight - bar.top + 6) / scale}px`);
		this.element.style.setProperty("--power-dock-width", `${bar.width / scale}px`);
	}

	/** Toggle the selected category without changing the character panel's active tab. */
	onSelectPowerCategory(event, target) {
		this.activeTab = null;
		this.activePowerCategory = this.activePowerCategory === target.dataset.powerCategory
			? null : target.dataset.powerCategory;
		this.savedScrollTop = 0;
		game.tooltip.deactivate();
		this.render();
	}

	/** Close the power list before entering targeting, retaining right-click sheet access. */
	onPower(event, target) {
		if (event.button !== 2) {
			this.onClosePowers();
		}
		return super.onPower(event, target);
	}

	/** Close the power list when sending a power to chat. */
	onChatPower(event, target) {
		this.onClosePowers();
		return super.onChatPower(event, target);
	}

	/** Close the list, leaving the four category buttons visible. */
	onClosePowers() {
		this.activeTab = null;
		this.activePowerCategory = null;
		game.tooltip.deactivate();
		this.render();
	}

	/** Dismiss the list when interacting elsewhere on the canvas or UI. */
	onOutsideClick(event) {
		if ((this.activePowerCategory || this.activeTab) && !this.element?.contains(event.target)) {
			this.onClosePowers();
		}
	}

	/** Dismiss the list with Escape. */
	onEscape(event) {
		if (event.key === "Escape" && (this.activePowerCategory || this.activeTab)) {
			this.onClosePowers();
		}
	}

	/** Release every observer and listener when the selector is disabled or its actor disappears. */
	async close(options) {
		this.clearPowerHitChanceHover?.();
		this.clearPowerHitChanceHover = null;
		this.clearPowerRangeHover?.();
		this.clearPowerRangeHover = null;
		window.cancelAnimationFrame(this.hotbarFrame);
		this.hotbarFrame = null;
		this.layoutObserver.disconnect();
		window.removeEventListener("resize", this.positionAboveHotbar);
		document.removeEventListener("pointerdown", this.onOutsideClick);
		document.removeEventListener("keydown", this.onEscape);
		Hooks.off("renderHotbar", this.hotbarHook);
		Hooks.off("collapseSidebar", this.sidebarHook);
		game.tooltip.deactivate();
		return super.close(options);
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
