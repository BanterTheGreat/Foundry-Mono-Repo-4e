/** Native DnD4e area range types supported on square grids. */
export const AREA_TYPES = ["closeBurst", "closeBlast", "rangeBurst", "rangeBlast"];

/** Resolve the affected rectangle in canvas pixels, preserving a chosen origin square. */
export function areaRectangle(source, range, origin, size) {
	const extent = range.area * size;
	if (range.shape === "closeBurst") {
		return { x: source.x - extent, y: source.y - extent, w: source.w + extent * 2, h: source.h + extent * 2 };
	}
	if (!origin) {
		return null;
	}
	if (range.shape === "rangeBurst") {
		return { x: origin.x - extent, y: origin.y - extent, w: extent * 2 + size, h: extent * 2 + size };
	}
	return { x: origin.x, y: origin.y, w: extent, h: extent };
}

/** Positive footprint overlap: touching a boundary does not include a creature. */
export function intersectsArea(token, rectangle) {
	return Boolean(rectangle && token.x < rectangle.x + rectangle.w && token.x + token.w > rectangle.x
		&& token.y < rectangle.y + rectangle.h && token.y + token.h > rectangle.y);
}

/** A blast may originate in any of its squares; choose the closest one to the caster. */
export function areaRangeOrigin(source, range, anchor, size) {
	if (!anchor || range.shape !== "rangeBlast") {
		return anchor;
	}
	const last = (range.area - 1) * size;
	return {
		x: Math.max(anchor.x, Math.min(anchor.x + last, source.x)),
		y: Math.max(anchor.y, Math.min(anchor.y + last, source.y)),
	};
}

/** Snap a close blast to the nearest square that shares an edge with the caster. */
export function closeBlastOrigin(source, point, area, size) {
	const candidates = [];
	const width = Math.round(source.w / size);
	const height = Math.round(source.h / size);
	for (let offset = 1 - area; offset < width; offset++) {
		candidates.push({ x: source.x + offset * size, y: source.y - area * size });
		candidates.push({ x: source.x + offset * size, y: source.y + source.h });
	}
	for (let offset = 1 - area; offset < height; offset++) {
		candidates.push({ x: source.x - area * size, y: source.y + offset * size });
		candidates.push({ x: source.x + source.w, y: source.y + offset * size });
	}
	return candidates.reduce((best, candidate) => {
		const distance = position => (position.x + area * size / 2 - point.x) ** 2 + (position.y + area * size / 2 - point.y) ** 2;
		return !best || distance(candidate) < distance(best) ? candidate : best;
	}, null);
}

/** Apply explicit disposition/caster preferences without interpreting power prose. */
export function areaTargetAllowed(source, target, range, config) {
	if (!target.actor || !target.visible) {
		return false;
	}
	if (target === source) {
		return range.shape !== "closeBurst" && config.includeCaster;
	}
	const disposition = Number(source.document.disposition);
	const other = Number(target.document.disposition);
	if (config.targetDisposition === "enemies") {
		return Math.abs(disposition) === 1 && other === -disposition;
	}
	if (config.targetDisposition === "allies") {
		return Math.abs(disposition) === 1 && other === disposition;
	}
	return true;
}
