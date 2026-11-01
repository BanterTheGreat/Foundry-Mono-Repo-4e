/**
 * Pure presentation rules for the optional token-ring hover display: gems, the stepped name tag, effect endings and
 * ordering, and where the effect strip sits beside the token. Nothing here touches Foundry globals.
 */

export const RING_PADDING = 30;
export const MIN_RING_SIZE = 44;
export const MAX_EFFECT_ROWS = 10;
/** How far the gem row rises into the token, as a fraction of its own height. */
export const RIM_OVERLAP = 0.78;

const RING_OFFSET = 4;
const TAG_GAP = 3;
const STRIP_GAP = 16;
const NAME_LENGTH_LIMIT = 14;
const OPEN_ENDED_RANK = 1000;

/**
 * Turn the health segments into gems. A divider follows the middle gem so the bloodied point is visible.
 *
 * @param {boolean[]} filled Whether each segment is filled, in drain order.
 * @returns {Array<{filled: boolean, divider: boolean}>}
 */
export function buildGems(filled) {
	const half = filled.length / 2;
	return filled.map((isFilled, index) => ({
		filled: isFilled,
		divider: filled.length > 1 && index === half - 1,
	}));
}

/**
 * Build the outline of the stepped tag: a narrow gem row stacked on a wider name row, as one shape with rounded
 * corners and concave fillets where the rows meet. A gem row flush with either edge simply has no step on that side.
 *
 * @param {object} measure Measured sizes in pixels.
 * @param {number} measure.width Width of the whole tag (the name row).
 * @param {number} measure.tabHeight Height of the gem row.
 * @param {number} measure.plateHeight Height of the name row.
 * @param {number} measure.tabLeft Left edge of the gem row inside the tag.
 * @param {number} measure.tabWidth Width of the gem row.
 * @returns {{path: string, width: number, height: number}}
 */
export function buildTagOutline({ width, tabHeight, plateHeight, tabLeft, tabWidth }) {
	const height = tabHeight + plateHeight;
	const tabRight = tabLeft + tabWidth;
	const tabRadius = Math.min(9, tabHeight / 2);
	const plateRadius = Math.min(11, plateHeight / 2);
	const fillet = 5;
	const leftStep = tabLeft > 1;
	const rightStep = tabRight < width - 1;
	let path = `M${tabLeft} ${tabRadius}A${tabRadius} ${tabRadius} 0 0 1 ${tabLeft + tabRadius} 0H${tabRight - tabRadius}A${tabRadius} ${tabRadius} 0 0 1 ${tabRight} ${tabRadius}`;

	if (rightStep) {
		path += `V${tabHeight - fillet}A${fillet} ${fillet} 0 0 0 ${tabRight + fillet} ${tabHeight}H${width - plateRadius}A${plateRadius} ${plateRadius} 0 0 1 ${width} ${tabHeight + plateRadius}`;
	}

	path += `V${height - plateRadius}A${plateRadius} ${plateRadius} 0 0 1 ${width - plateRadius} ${height}H${plateRadius}A${plateRadius} ${plateRadius} 0 0 1 0 ${height - plateRadius}`;

	if (leftStep) {
		path += `V${tabHeight + plateRadius}A${plateRadius} ${plateRadius} 0 0 1 ${plateRadius} ${tabHeight}H${tabLeft - fillet}A${fillet} ${fillet} 0 0 0 ${tabLeft} ${tabHeight - fillet}Z`;
	} else {
		path += `V${tabRadius}Z`;
	}

	return { path, width, height };
}

/**
 * Shorten an actor name for an ending label: short names stay whole, otherwise the first word that is not an article.
 *
 * @param {string} name An actor name.
 * @returns {string}
 */
export function shortName(name) {
	const text = String(name ?? "").trim();

	if (text.length <= NAME_LENGTH_LIMIT) {
		return text;
	}

	const words = text.split(/\s+/).filter((word) => !/^(the|a|an)$/i.test(word));
	return words[0] ?? text;
}

/**
 * Count the turns from the current one until a creature's turn boundary.
 * A start boundary on the creature's own turn has already passed, so it is a full round away.
 *
 * @param {object} options Turn context.
 * @param {number} options.turnCount Combatants in the turn order.
 * @param {number} options.currentIndex Index of the acting combatant.
 * @param {number} options.targetIndex Index of the creature, or -1 when it is not in the encounter.
 * @param {boolean} options.atStart Whether the boundary is the start of the turn.
 * @returns {number|null}
 */
export function computeTurnsAway({ turnCount, currentIndex, targetIndex, atStart }) {
	if (!(turnCount > 0) || !Number.isInteger(currentIndex) || currentIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0) {
		return null;
	}

	const turns = (targetIndex - currentIndex + turnCount) % turnCount;
	return atStart && turns === 0 ? turnCount : turns;
}

/**
 * Turn an effect's raw ending into the compact label shown in the strip.
 *
 * @param {{type: string, who?: string, label?: string, turnsAway?: number|null}} ending Raw ending data.
 * @returns {{kind: string, label: string, turnsAway: number|null, soon: boolean}}
 */
export function describeEnding(ending) {
	const turnsAway = Number.isFinite(ending?.turnsAway) ? ending.turnsAway : null;
	const soon = turnsAway !== null && turnsAway <= 1;

	switch (ending?.type) {
		case "save":
			return { kind: "save", label: "Save", turnsAway, soon };
		case "encounter":
			return { kind: "encounter", label: "Encounter", turnsAway: null, soon: false };
		case "endOfTurn":
			return { kind: "turn", label: `EoT ${shortName(ending.who)}`, turnsAway, soon };
		case "startOfTurn":
			return { kind: "turn", label: `SoT ${shortName(ending.who)}`, turnsAway, soon };
		case "custom":
			return { kind: "custom", label: ending.label || "Custom", turnsAway: null, soon: false };
		default:
			return { kind: "none", label: "", turnsAway: null, soon: false };
	}
}

/**
 * Order effects by what ends soonest. Encounter-long effects follow, then open-ended ones; ties keep their order.
 *
 * @param {Array<{ending: {kind: string, turnsAway: number|null}}>} rows Effect rows.
 * @returns {Array<object>}
 */
export function sortEffectRows(rows) {
	const rank = (row) => {
		if (row.ending.turnsAway !== null) {
			return row.ending.turnsAway;
		}

		return OPEN_ENDED_RANK + (row.ending.kind === "encounter" ? 0 : 1);
	};

	return [...rows].sort((a, b) => rank(a) - rank(b));
}

/**
 * Build the strip rows. Conditions show only a title; other effects add their description underneath.
 *
 * @param {Array<object>} effects Effect display data from getEffectPresentation().
 * @returns {{rows: Array<object>, overflow: number}}
 */
export function buildEffectRows(effects) {
	const rows = sortEffectRows((effects ?? []).map((effect) => ({
		title: effect.name,
		img: effect.img,
		description: effect.isCondition ? "" : String(effect.description ?? "").trim(),
		ending: describeEnding(effect.ending),
	})));
	const shown = rows.length > MAX_EFFECT_ROWS ? rows.slice(0, MAX_EFFECT_ROWS - 1) : rows;

	return {
		rows: shown.map((row) => ({
			title: row.title,
			img: row.img,
			description: row.description,
			endingKind: row.ending.kind,
			endingLabel: row.ending.label,
			isEncounter: row.ending.kind === "encounter",
			isOpenEnded: row.ending.kind === "none",
			soon: row.ending.soon,
		})),
		overflow: rows.length - shown.length,
	};
}

/**
 * Build template data for the ring from the standard hover-display data.
 *
 * @param {object} display Data from getTokenHoverDisplayData().
 * @param {object} options Presentation options.
 * @param {number} options.size Token diameter in screen pixels.
 * @returns {object}
 */
export function buildTokenRingData(display, { size }) {
	const ringSize = Math.max(MIN_RING_SIZE, Math.round(size));
	const outer = ringSize + RING_PADDING * 2;
	const { rows, overflow } = buildEffectRows(display.effects);

	return {
		size: ringSize,
		outer,
		centre: outer / 2,
		radius: ringSize / 2 + RING_OFFSET,
		gems: buildGems((display.segments ?? []).map((segment) => Boolean(segment.filled))),
		tagTop: RING_PADDING + ringSize + TAG_GAP,
		name: display.name,
		defeated: Boolean(display.defeated),
		role: display.role ?? null,
		healthLabel: display.healthLabel,
		effects: rows,
		overflow,
	};
}

/**
 * Place the effect strip beside the ring, flipping to the left near the screen edge and keeping it on screen.
 * Coordinates are relative to the ring frame.
 *
 * @param {object} options Placement context.
 * @param {number} options.centre Ring centre inside its frame.
 * @param {number} options.radius Ring radius.
 * @param {{width: number, height: number}} options.strip Measured strip size.
 * @param {{left: number, top: number}} options.frame Frame position on screen.
 * @param {{width: number, height: number}} options.viewport Viewport size.
 * @returns {{flip: boolean, left: number, top: number, stubLeft: number, stubWidth: number}}
 */
export function placeEffectStrip({ centre, radius, strip, frame, viewport }) {
	const edge = radius + 8;
	const flip = frame.left + centre + edge + STRIP_GAP + strip.width > viewport.width - 8;
	const left = flip ? centre - edge - STRIP_GAP - strip.width : centre + edge + STRIP_GAP;
	const stubLeft = flip ? centre - edge - STRIP_GAP : centre + edge;
	const wantedTop = frame.top + centre - strip.height / 2;
	const clamped = Math.max(48, Math.min(wantedTop, viewport.height - strip.height - 56));

	return { flip, left, top: centre - strip.height / 2 + (clamped - wantedTop), stubLeft, stubWidth: STRIP_GAP };
}
