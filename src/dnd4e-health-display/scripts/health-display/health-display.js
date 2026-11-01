import { getTokenHoverDisplayData } from "./token-hover-display-data.js";
import { hideTokenRing, renderTokenRing, repositionTokenRing } from "./token-ring.js";

const STYLESHEET_ID = "dnd4e-health-display-styles";
const STYLESHEET_PATH = "modules/dnd4e-health-display/styles/health-display.css";

let hoveredToken = null;
let renderSequence = 0;
let ringRepositionFrame = null;

/** Register the token hover display and the hooks which keep it current. */
export function registerHealthDisplay() {
	ensureStylesheet();

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
	Hooks.on("canvasPan", scheduleRingReposition);
	Hooks.on("refreshToken", scheduleRingReposition);
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
 * Render the ring, name tag and effect list for the currently hovered token.
 *
 * @param {Token} token The token to render.
 */
async function renderDisplay(token) {
	if (!token?.actor) {
		hideDisplay();
		return;
	}

	const sequence = ++renderSequence;
	await renderTokenRing(
		token,
		getTokenHoverDisplayData(token),
		() => sequence !== renderSequence || hoveredToken?.id !== token.id,
	);
}

/** Keep the ring on the hovered token while the canvas pans, zooms or the token moves. */
function scheduleRingReposition() {
	if (!hoveredToken || ringRepositionFrame !== null) {
		return;
	}

	ringRepositionFrame = requestAnimationFrame(() => {
		ringRepositionFrame = null;

		if (hoveredToken && repositionTokenRing(hoveredToken)) {
			void renderDisplay(hoveredToken);
		}
	});
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

/** Refresh effect ending distances when the active combat or its combatants change. */
function refreshForCombat() {
	if (hoveredToken) {
		void renderDisplay(hoveredToken);
	}
}

/** Hide and invalidate the current hover display. */
function hideDisplay() {
	hoveredToken = null;
	renderSequence += 1;
	hideTokenRing();
}
