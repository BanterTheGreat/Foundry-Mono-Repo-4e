import { MIN_RING_SIZE, buildTokenRingData, placeEffectStrip } from "./token-ring-data.js";

const RING_ID = "dnd4e-token-ring-display";
const RING_TEMPLATE = "modules/dnd4e-health-display/scripts/health-display/token-ring.hbs";

let shownTokenId = null;
let shownLayout = null;

/**
 * Measure a token in screen pixels, accounting for the canvas element's CSS scaling.
 *
 * @param {Token} token The hovered canvas token.
 * @returns {{centreX: number, centreY: number, size: number}|null}
 */
function getTokenScreenRect(token) {
	if (!canvas?.ready || !token?.w) {
		return null;
	}

	const view = canvas.app.view.getBoundingClientRect();
	const screen = canvas.app.renderer.screen;
	const scaleX = view.width / screen.width;
	const scaleY = view.height / screen.height;
	const start = token.toGlobal(new PIXI.Point(0, 0));
	const end = token.toGlobal(new PIXI.Point(token.w, token.h));
	const width = (end.x - start.x) * scaleX;
	const height = (end.y - start.y) * scaleY;

	return {
		centreX: view.left + (start.x + end.x) / 2 * scaleX,
		centreY: view.top + (start.y + end.y) / 2 * scaleY,
		size: Math.min(width, height),
	};
}

/**
 * Create the fixed ring mount point if it does not exist yet.
 *
 * @returns {HTMLElement}
 */
function ensureRing() {
	let root = document.getElementById(RING_ID);

	if (!root) {
		root = document.createElement("section");
		root.id = RING_ID;
		root.setAttribute("aria-live", "polite");
		root.hidden = true;
		document.body.append(root);
	}

	return root;
}

/**
 * Position the ring frame on the token and the effect strip beside the ring.
 *
 * @param {HTMLElement} root The ring mount point.
 * @param {object} data Ring template data.
 * @param {{centreX: number, centreY: number}} rect The token's screen rectangle.
 */
function layoutRing(root, data, rect) {
	const left = rect.centreX - data.outer / 2;
	const top = rect.centreY - data.outer / 2;
	root.style.left = `${left}px`;
	root.style.top = `${top}px`;
	const strip = root.querySelector(".dnd4e-token-ring__strip");
	const stub = root.querySelector(".dnd4e-token-ring__stub");

	if (!strip || !stub) {
		return;
	}

	const placement = placeEffectStrip({
		centre: data.centre,
		radius: data.radius,
		strip: { width: strip.offsetWidth, height: strip.offsetHeight },
		frame: { left, top },
		viewport: { width: window.innerWidth, height: window.innerHeight },
	});
	strip.classList.toggle("is-flipped", placement.flip);
	strip.style.left = `${placement.left}px`;
	strip.style.top = `${placement.top}px`;
	stub.style.left = `${placement.stubLeft}px`;
	stub.style.top = `${data.centre - 1}px`;
	stub.style.width = `${placement.stubWidth}px`;
}

/**
 * Draw the ring and effect strip for a hovered token.
 *
 * @param {Token} token The hovered token.
 * @param {object} display Data from getTokenHoverDisplayData().
 * @param {() => boolean} isStale Whether a newer render or a different hovered token replaced this one.
 */
export async function renderTokenRing(token, display, isStale) {
	const rect = getTokenScreenRect(token);

	if (!rect) {
		hideTokenRing();
		return;
	}

	const data = buildTokenRingData(display, { size: rect.size });
	const render = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
	const html = await render(RING_TEMPLATE, data);

	if (isStale()) {
		return;
	}

	const root = ensureRing();
	root.innerHTML = html;
	root.hidden = false;
	shownTokenId = token.id;
	shownLayout = { data, size: data.size };
	layoutRing(root, data, rect);
}

/**
 * Follow the token while the canvas pans or the token moves.
 *
 * @param {Token} token The hovered token.
 * @returns {boolean} True when the zoom changed the ring size and it must be rendered again.
 */
export function repositionTokenRing(token) {
	const root = document.getElementById(RING_ID);
	const rect = getTokenScreenRect(token);

	if (!root || root.hidden || !shownLayout || shownTokenId !== token.id || !rect) {
		return false;
	}

	if (Math.max(MIN_RING_SIZE, Math.round(rect.size)) !== shownLayout.size) {
		return true;
	}

	layoutRing(root, shownLayout.data, rect);
	return false;
}

/** Hide the ring and forget which token it showed. */
export function hideTokenRing() {
	shownTokenId = null;
	shownLayout = null;
	const root = document.getElementById(RING_ID);

	if (root) {
		root.hidden = true;
	}
}
