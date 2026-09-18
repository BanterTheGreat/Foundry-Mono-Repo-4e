import { getTokenHoverDisplayData } from "./token-hover-display-data.js";

const DISPLAY_ID = "dnd4e-token-hover-display";
const DISPLAY_TEMPLATE = "modules/dnd4e-health-display/scripts/health-display/health-display.hbs";
const STYLESHEET_ID = "dnd4e-health-display-styles";
const STYLESHEET_PATH = "modules/dnd4e-health-display/styles/health-display.css";
const EFFECT_DESCRIPTIONS_SETTING = "shiftEffectDescriptions";
const SHOW_TRAITS_SETTING = "showNpcTraits";

let hoveredToken = null;
let renderSequence = 0;
let shiftHeld = false;

/** Register settings used by the token hover display. */
export function registerHealthDisplaySettings() {
	game.settings.register("dnd4e-health-display", EFFECT_DESCRIPTIONS_SETTING, {
		name: "Show effect descriptions by default",
		hint: "When enabled, temporary-effect descriptions are shown by default and holding Shift reveals their names. Disable this to reverse that behavior.",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: refreshHoveredToken,
	});

	game.settings.register("dnd4e-health-display", SHOW_TRAITS_SETTING, {
		name: "Show NPC traits",
		hint: "Show NPC trait descriptions in the token hover display. Traits remain visible only to GMs.",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: refreshHoveredToken,
	});
}

/** Register the token hover display and the hooks which keep it current. */
export function registerHealthDisplay() {
	ensureStylesheet();
	ensureDisplay();

	Hooks.on("hoverToken", onHoverToken);
	Hooks.on("updateActor", refreshForActor);
	Hooks.on("updateToken", refreshForToken);
	Hooks.on("createActiveEffect", refreshForEffect);
	Hooks.on("updateActiveEffect", refreshForEffect);
	Hooks.on("deleteActiveEffect", refreshForEffect);
	Hooks.on("createItem", refreshForItem);
	Hooks.on("updateItem", refreshForItem);
	Hooks.on("deleteItem", refreshForItem);
	Hooks.on("updateCombat", refreshForCombat);
	Hooks.on("createCombatant", refreshForCombat);
	Hooks.on("updateCombatant", refreshForCombat);
	Hooks.on("deleteCombatant", refreshForCombat);
	Hooks.on("canvasTearDown", hideDisplay);
	window.addEventListener("keydown", onModifierChange);
	window.addEventListener("keyup", onModifierChange);
	window.addEventListener("blur", clearModifiers);
}

/** Load the display styles even when Foundry has cached an older module manifest. */
function ensureStylesheet() {
	if (document.getElementById(STYLESHEET_ID)) {
		return;
	}

	const stylesheet = document.createElement("link");
	const version = game.modules.get("dnd4e-health-display")?.version ?? "1";
	stylesheet.id = STYLESHEET_ID;
	stylesheet.rel = "stylesheet";
	stylesheet.href = `${STYLESHEET_PATH}?v=${encodeURIComponent(version)}-${Date.now()}`;
	document.head.append(stylesheet);
}

/**
 * Create the fixed display mount point if it does not exist yet.
 *
 * @returns {HTMLElement}
 */
function ensureDisplay() {
	let display = document.getElementById(DISPLAY_ID);

	if (!display) {
		display = document.createElement("section");
		display.id = DISPLAY_ID;
		display.classList.add("dnd4e-health-display");
		display.setAttribute("aria-live", "polite");
		Object.assign(display.style, {
			position: "fixed",
			top: "3.5rem",
			left: "50%",
			right: "auto",
			bottom: "auto",
			zIndex: "90",
			width: "min(34rem, calc(100vw - 2rem))",
			margin: "0",
			transform: "translateX(-50%)",
			pointerEvents: "none",
		});
		display.hidden = true;
		document.body.append(display);
	}

	return display;
}

/**
 * Display the hovered token, or clear the display when that same token is left.
 *
 * @param {Token} token The hovered canvas token.
 * @param {boolean} hovered Whether the pointer entered or left the token.
 */
function onHoverToken(token, hovered) {
	if (hovered) {
		hoveredToken = token;
		void renderDisplay(token);
		return;
	}

	if (hoveredToken?.id === token.id) {
		hideDisplay();
	}
}

/**
 * Render the currently hovered token.
 *
 * @param {Token} token The token to render.
 */
async function renderDisplay(token) {
	if (!token?.actor) {
		hideDisplay();
		return;
	}

	const sequence = ++renderSequence;
	const render = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
	const html = await render(DISPLAY_TEMPLATE, getTokenHoverDisplayData(token, {
		useEffectDescriptions: shouldShowDescriptions(),
		expandTraits: shiftHeld,
		showTraits: game.settings.get("dnd4e-health-display", SHOW_TRAITS_SETTING),
	}));

	if (sequence !== renderSequence || hoveredToken?.id !== token.id) {
		return;
	}

	const display = ensureDisplay();
	display.innerHTML = html;
	display.hidden = false;
}

/**
 * Resolve the current label mode from the configured default and Shift state.
 *
 * @returns {boolean}
 */
function shouldShowDescriptions() {
	const descriptionsByDefault = game.settings.get("dnd4e-health-display", EFFECT_DESCRIPTIONS_SETTING);
	return descriptionsByDefault !== shiftHeld;
}

/**
 * Invert the configured effect-label mode while Shift is held.
 *
 * @param {KeyboardEvent} event The keyboard event.
 */
function onModifierChange(event) {
	const nextValue = event.shiftKey;

	if (nextValue === shiftHeld) {
		return;
	}

	shiftHeld = nextValue;

	if (hoveredToken) {
		void renderDisplay(hoveredToken);
	}
}

/** Clear modifier state if the browser loses focus. */
function clearModifiers() {
	if (!shiftHeld) {
		return;
	}

	shiftHeld = false;

	if (hoveredToken) {
		void renderDisplay(hoveredToken);
	}
}

/** Refresh the currently hovered token, if any. */
function refreshHoveredToken() {
	if (hoveredToken) {
		void renderDisplay(hoveredToken);
	}
}

/**
 * Refresh when the hovered actor changes.
 *
 * @param {Actor} actor The changed actor.
 */
function refreshForActor(actor) {
	if (hoveredToken?.actor?.id === actor.id) {
		void renderDisplay(hoveredToken);
	}
}

/**
 * Refresh when the hovered token changes.
 *
 * @param {TokenDocument} tokenDocument The changed token document.
 */
function refreshForToken(tokenDocument) {
	if (hoveredToken?.document?.id === tokenDocument.id) {
		void renderDisplay(hoveredToken);
	}
}

/**
 * Refresh when one of the hovered actor's effects changes.
 *
 * @param {ActiveEffect} effect The changed effect.
 */
function refreshForEffect(effect) {
	if (hoveredToken?.actor?.id === effect.parent?.id) {
		void renderDisplay(hoveredToken);
	}
}

/**
 * Refresh when an embedded item on the hovered actor changes.
 *
 * @param {Item} item The changed item.
 */
function refreshForItem(item) {
	if (hoveredToken?.actor?.id === item.parent?.id) {
		void renderDisplay(hoveredToken);
	}
}

/** Refresh initiative distance when the active combat or its combatants change. */
function refreshForCombat() {
	if (hoveredToken) {
		void renderDisplay(hoveredToken);
	}
}

/** Hide and invalidate the current hover display. */
function hideDisplay() {
	hoveredToken = null;
	renderSequence += 1;
	ensureDisplay().hidden = true;
}
