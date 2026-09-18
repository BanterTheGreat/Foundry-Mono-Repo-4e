const MODULE_ID = "dnd4e-health-display";
const SHOW_SETTING = "showMarkDisplay";
const MARK_STATUS_PATTERN = /^mark(?:_[1-7])?$/;
const LINE_COLOR = 0xf0c879;
const LINE_SHADOW_COLOR = 0x1b1712;
const LINE_WIDTH = 4;
const LINE_SHADOW_WIDTH = 8;
const ARROW_OUTLINE_WIDTH = 3;
const TOKEN_INSET = 0.44;
const TARGET_GAP = 8;
const ARROW_LENGTH = 16;
const ARROW_WIDTH = 9;
const CONNECTION_OFFSET = 6;
const ARROW_PULSE_AMPLITUDE = 0.08;
const ARROW_PULSE_DURATION = 2200;
const MOVEMENT_REDRAW_DURATION = 1000;

let overlay = null;
let renderTimer = null;
let animationFrame = null;
let animationEndTime = 0;
let effectAnimationFrame = null;

/** Register settings owned by the mark-ownership display. */
export function registerMarkDisplaySettings() {
	game.settings.register(MODULE_ID, SHOW_SETTING, {
		name: "Show mark connections",
		hint: "Show arrows between a hovered or controlled marker and its marked tokens.",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: scheduleMarkRender,
	});
}

/** Register the mark-display lifecycle and refresh hooks. */
export function registerMarkDisplay() {
	Hooks.on("canvasReady", scheduleMarkRender);
	Hooks.on("canvasTearDown", destroyMarkOverlay);
	Hooks.on("createToken", scheduleMarkRender);
	Hooks.on("updateToken", refreshForTokenUpdate);
	Hooks.on("deleteToken", scheduleMarkRender);
	Hooks.on("refreshToken", renderMarkConnections);
	Hooks.on("hoverToken", scheduleMarkRender);
	Hooks.on("controlToken", scheduleMarkRender);
	Hooks.on("updateActor", scheduleMarkRender);
	Hooks.on("createActiveEffect", scheduleMarkRender);
	Hooks.on("updateActiveEffect", scheduleMarkRender);
	Hooks.on("deleteActiveEffect", scheduleMarkRender);

	scheduleMarkRender();
}

/** Schedule a single redraw after Foundry completes a related document update. */
function scheduleMarkRender() {
	window.clearTimeout(renderTimer);
	renderTimer = window.setTimeout(renderMarkConnections, 0);
}

/**
 * Redraw every animation frame after a positional token update.
 *
 * Foundry interpolates the canvas token's position after its document update. The
 * short loop keeps both ends of a connector aligned during that interpolation.
 *
 * @param {TokenDocument} tokenDocument The changed token document.
 * @param {object} changes The submitted token changes.
 */
function refreshForTokenUpdate(tokenDocument, changes) {
	scheduleMarkRender();

	if (!["x", "y", "width", "height", "rotation"].some((key) => key in changes)) {
		return;
	}

	animationEndTime = performance.now() + MOVEMENT_REDRAW_DURATION;

	if (animationFrame !== null) {
		return;
	}

	const redraw = (timestamp) => {
		renderMarkConnections();

		if (timestamp < animationEndTime && canvas?.ready
			&& game.settings.get(MODULE_ID, SHOW_SETTING)) {
			animationFrame = window.requestAnimationFrame(redraw);
			return;
		}

		animationFrame = null;
	};

	animationFrame = window.requestAnimationFrame(redraw);
}

/** Draw visible marker-to-marked connections in world space. */
function renderMarkConnections() {
	renderTimer = null;

	if (!game.settings.get(MODULE_ID, SHOW_SETTING) || !canvas?.ready) {
		destroyMarkOverlay();
		return;
	}

	const graphics = getMarkOverlay();
	if (!graphics) {
		return;
	}

	graphics.clear();

	const connectionsByMarker = new Map();
	let hasConnections = false;

	for (const markedToken of canvas.tokens?.placeables ?? []) {
		const markerUuid = getMarkerUuid(markedToken.actor);
		if (!markerUuid || !isMarked(markedToken.actor)) {
			continue;
		}

		const markerActor = resolveMarker(markerUuid);
		const markerToken = getMarkerToken(markerActor, markedToken);
		if (!markerToken || !isConnectionFocused(markerToken, markedToken)) {
			continue;
		}

		const connections = connectionsByMarker.get(markerToken) ?? [];
		connections.push(markedToken);
		connectionsByMarker.set(markerToken, connections);
	}

	for (const [markerToken, markedTokens] of connectionsByMarker) {
		const centerOffset = (markedTokens.length - 1) / 2;

		for (const [index, markedToken] of markedTokens.entries()) {
			drawConnection(
				graphics,
				markerToken,
				markedToken,
				(index - centerOffset) * CONNECTION_OFFSET,
			);
			hasConnections = true;
		}
	}

	updateEffectAnimation(hasConnections);
}

/** Continue the subtle arrowhead pulse only while a connection is visible. */
function updateEffectAnimation(hasConnections) {
	if (!hasConnections) {
		window.cancelAnimationFrame(effectAnimationFrame);
		effectAnimationFrame = null;
		return;
	}

	if (effectAnimationFrame !== null) {
		return;
	}

	effectAnimationFrame = window.requestAnimationFrame(() => {
		effectAnimationFrame = null;
		renderMarkConnections();
	});
}

/**
 * Create the persistent graphics container above the scene's tokens.
 *
 * @returns {PIXI.Graphics|null}
 */
function getMarkOverlay() {
	if (overlay?.destroyed) {
		overlay = null;
	}

	if (overlay) {
		return overlay;
	}

	if (!canvas.interface) {
		return null;
	}

	overlay = new PIXI.Graphics();
	overlay.eventMode = "none";
	overlay.zIndex = 1;
	canvas.interface.addChild(overlay);
	return overlay;
}

/** Remove the canvas-owned overlay when disabled or changing scenes. */
function destroyMarkOverlay() {
	window.clearTimeout(renderTimer);
	renderTimer = null;
	window.cancelAnimationFrame(animationFrame);
	animationFrame = null;
	animationEndTime = 0;
	window.cancelAnimationFrame(effectAnimationFrame);
	effectAnimationFrame = null;

	if (!overlay) {
		return;
	}

	overlay.removeFromParent();
	overlay.destroy();
	overlay = null;
}

/**
 * Resolve the system's marker UUID stored on a marked actor.
 *
 * @param {Actor|null} actor The actor carrying the mark.
 * @returns {string|null}
 */
function getMarkerUuid(actor) {
	const markerUuid = actor?.system?.marker;
	return typeof markerUuid === "string" && markerUuid ? markerUuid : null;
}

/**
 * Confirm that a currently enabled effect supplies a DnD4e mark status.
 *
 * @param {Actor|null} actor The actor to inspect.
 * @returns {boolean}
 */
function isMarked(actor) {
	return Array.from(actor?.effects ?? []).some((effect) => {
		if (effect.disabled || effect.isSuppressed) {
			return false;
		}

		return Array.from(effect.statuses ?? []).some((status) => MARK_STATUS_PATTERN.test(status));
	});
}

/**
 * Resolve a marker UUID without letting malformed document references interrupt drawing.
 *
 * @param {string} markerUuid The UUID stored by DnD4e mark automation.
 * @returns {Actor|null}
 */
function resolveMarker(markerUuid) {
	try {
		const document = fromUuidSync(markerUuid);
		return document?.documentName === "Actor" ? document : document?.actor ?? null;
	} catch (_error) {
		return null;
	}
}

/**
 * Find the visible scene token representing the marker, excluding a self-reference.
 *
 * @param {Actor|null} markerActor The actor who imposed the mark.
 * @param {Token} markedToken The token which carries the mark.
 * @returns {Token|null}
 */
function getMarkerToken(markerActor, markedToken) {
	if (!markerActor) {
		return null;
	}

	return (canvas.tokens?.placeables ?? []).find((token) => token !== markedToken
		&& token.actor?.id === markerActor.id
		&& token.visible) ?? null;
}

/**
 * Determine whether either end of a connection currently has the user's focus.
 *
 * @param {Token} markerToken The token which imposed the mark.
 * @param {Token} markedToken The token which carries the mark.
 * @returns {boolean}
 */
function isConnectionFocused(markerToken, markedToken) {
	return markerToken.hover || markerToken.controlled
		|| markedToken.hover || markedToken.controlled;
}

/**
 * Draw a directional line from the marker's edge to the marked token's edge.
 *
 * @param {PIXI.Graphics} graphics The overlay graphics context.
 * @param {Token} markerToken The token which imposed the mark.
 * @param {Token} markedToken The token which carries the mark.
 * @param {number} lateralOffset The perpendicular spacing for sibling connections.
 */
function drawConnection(graphics, markerToken, markedToken, lateralOffset) {
	const markerCenter = getTokenCenter(markerToken);
	const markedCenter = getTokenCenter(markedToken);
	const deltaX = markedCenter.x - markerCenter.x;
	const deltaY = markedCenter.y - markerCenter.y;
	const distance = Math.hypot(deltaX, deltaY);

	if (distance === 0) {
		return;
	}

	const unitX = deltaX / distance;
	const unitY = deltaY / distance;
	const perpendicularX = -unitY;
	const perpendicularY = unitX;
	const start = offsetPoint(
		offsetPoint(markerCenter, unitX, unitY, getTokenRadius(markerToken)),
		perpendicularX,
		perpendicularY,
		lateralOffset,
	);
	const end = offsetPoint(
		offsetPoint(
			markedCenter,
			-unitX,
			-unitY,
			getTokenRadius(markedToken) + TARGET_GAP,
		),
		perpendicularX,
		perpendicularY,
		lateralOffset,
	);
	const arrowPulse = 1 + Math.sin((performance.now() / ARROW_PULSE_DURATION) * Math.PI * 2)
		* ARROW_PULSE_AMPLITUDE;
	const arrowLength = ARROW_LENGTH * arrowPulse;
	const arrowWidth = ARROW_WIDTH * arrowPulse;
	const arrowBase = offsetPoint(end, -unitX, -unitY, arrowLength);
	const barbPoint = offsetPoint(end, -unitX, -unitY, arrowLength * 0.64);

	// A dark under-stroke preserves the connector over bright maps and token art.
	graphics.lineStyle({
		width: LINE_SHADOW_WIDTH,
		color: LINE_SHADOW_COLOR,
		alpha: 0.45,
		cap: "round",
	});
	graphics.moveTo(start.x, start.y);
	graphics.lineTo(arrowBase.x, arrowBase.y);
	graphics.lineStyle({
		width: LINE_WIDTH,
		color: LINE_COLOR,
		alpha: 0.84,
		cap: "round",
	});
	graphics.moveTo(start.x, start.y);
	graphics.lineTo(arrowBase.x, arrowBase.y);
	graphics.lineStyle({
		width: ARROW_OUTLINE_WIDTH,
		color: LINE_SHADOW_COLOR,
		alpha: 0.8,
		join: "round",
	});
	graphics.beginFill(LINE_COLOR, 0.95);
	graphics.moveTo(end.x, end.y);
	graphics.lineTo(
		barbPoint.x + perpendicularX * arrowWidth,
		barbPoint.y + perpendicularY * arrowWidth,
	);
	graphics.lineTo(
		arrowBase.x + perpendicularX * arrowWidth * 0.38,
		arrowBase.y + perpendicularY * arrowWidth * 0.38,
	);
	graphics.lineTo(arrowBase.x, arrowBase.y);
	graphics.lineTo(
		arrowBase.x - perpendicularX * arrowWidth * 0.38,
		arrowBase.y - perpendicularY * arrowWidth * 0.38,
	);
	graphics.lineTo(
		barbPoint.x - perpendicularX * arrowWidth,
		barbPoint.y - perpendicularY * arrowWidth,
	);
	graphics.closePath();
	graphics.endFill();
}

/**
 * Get the canvas-space center of a token.
 *
 * @param {Token} token The token to inspect.
 * @returns {{x: number, y: number}}
 */
function getTokenCenter(token) {
	return token.center ?? {
		x: token.x + token.w / 2,
		y: token.y + token.h / 2,
	};
}

/**
 * Keep the connector outside the token's artwork.
 *
 * @param {Token} token The token to inspect.
 * @returns {number}
 */
function getTokenRadius(token) {
	return Math.min(token.w, token.h) * TOKEN_INSET;
}

/**
 * Offset a point along a normalized direction vector.
 *
 * @param {{x: number, y: number}} point The origin point.
 * @param {number} xDirection The normalized x direction.
 * @param {number} yDirection The normalized y direction.
 * @param {number} distance The distance to offset.
 * @returns {{x: number, y: number}}
 */
function offsetPoint(point, xDirection, yDirection, distance) {
	return {
		x: point.x + xDirection * distance,
		y: point.y + yDirection * distance,
	};
}
