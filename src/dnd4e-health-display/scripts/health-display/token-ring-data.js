/**
 * Pure presentation rules for the optional token-ring hover display: ring geometry, effect endings and ordering,
 * and where the effect strip sits beside the ring. Nothing here touches Foundry globals.
 */

export const RING_PADDING = 24;
export const MIN_RING_SIZE = 44;
export const MAX_EFFECT_ROWS = 10;

const ARC_START = 125;
const ARC_SWEEP = 290;
const SEGMENT_GAP = 3.5;
const BAR_PADDING = 3.5;
const STRIP_GAP = 16;
const NAME_LENGTH_LIMIT = 14;
const OPEN_ENDED_RANK = 1000;

/**
 * Convert polar coordinates around a centre to an SVG point.
 *
 * @param {number} centre Centre on both axes.
 * @param {number} radius Distance from the centre.
 * @param {number} degrees Angle in degrees, 0 pointing right and increasing clockwise.
 * @returns {{x: number, y: number}}
 */
function polar(centre, radius, degrees) {
	const radians = degrees * Math.PI / 180;
	return { x: centre + radius * Math.cos(radians), y: centre + radius * Math.sin(radians) };
}

/**
 * Build an SVG arc path between two angles.
 *
 * @param {number} centre Centre on both axes.
 * @param {number} radius Arc radius.
 * @param {number} from Start angle in degrees.
 * @param {number} to End angle in degrees.
 * @returns {string}
 */
function arcPath(centre, radius, from, to) {
	const start = polar(centre, radius, from);
	const end = polar(centre, radius, to);
	return `M${start.x.toFixed(2)} ${start.y.toFixed(2)}A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Build the segmented health arc. It spans 290 degrees with its gap at the bottom, where the name plate sits.
 * The segments sit inside one bordered bar, like the classic health bar, so the gaps read as divisions of a single bar.
 *
 * @param {boolean[]} filled Whether each segment is filled, in drain order.
 * @param {number} size Token diameter in pixels.
 * @returns {object}
 */
export function buildRingGeometry(filled, size) {
	const outer = size + RING_PADDING * 2;
	const centre = outer / 2;
	const radius = size / 2 + 9;
	const count = Math.max(1, filled.length);
	const span = ARC_SWEEP / count;
	const gap = count > 1 ? SEGMENT_GAP : 0;
	const segments = filled.map((isFilled, index) => {
		const path = arcPath(centre, radius, ARC_START + index * span + gap / 2, ARC_START + (index + 1) * span - gap / 2);
		return { filled: isFilled, path };
	});
	let notch = null;

	if (count > 1) {
		const angle = ARC_START + ARC_SWEEP / 2;
		const inner = polar(centre, radius - 6, angle);
		const outerPoint = polar(centre, radius + 10, angle);
		notch = { x1: inner.x, y1: inner.y, x2: outerPoint.x, y2: outerPoint.y };
	}

	// The bar's round caps reach past its path ends, so pull the ends in to leave a little padding around the segments.
	const inset = BAR_PADDING / radius * 180 / Math.PI;

	return {
		outer,
		centre,
		radius,
		segments,
		notch,
		bar: arcPath(centre, radius, ARC_START + inset, ARC_START + ARC_SWEEP - inset),
	};
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
	const geometry = buildRingGeometry((display.segments ?? []).map((segment) => Boolean(segment.filled)), ringSize);
	const { rows, overflow } = buildEffectRows(display.effects);

	return {
		size: ringSize,
		outer: geometry.outer,
		centre: geometry.centre,
		radius: geometry.radius,
		segments: geometry.segments,
		notch: geometry.notch,
		bar: geometry.bar,
		plateTop: RING_PADDING + ringSize + 4,
		name: display.name,
		defeated: Boolean(display.defeated),
		role: display.role ?? null,
		stateLabel: ["Healthy", "Alive"].includes(display.healthState) ? "" : display.healthState,
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
