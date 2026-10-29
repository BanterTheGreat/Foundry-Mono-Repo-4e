import { resolveRange } from "./system-adapter.js";
import { rangeAreaDrawing } from "./range-area-drawing.js";

/** A client-only preview which never starts a workflow or changes documents/targets. */
export class PowerRangeHover {
	constructor(resolver = resolveRange) {
		this.resolve = resolver;
		this.revision = 0;
		this.hooks = [];
	}

	/** Remove only this preview and invalidate any pending formula resolution. */
	clear() {
		this.revision++;
		for (const [name, id] of this.hooks) {
			Hooks.off(name, id);
		}
		this.hooks = [];
		this.graphics?.destroy();
		this.rangeMask?.destroy();
		this.graphics = this.rangeMask = null;
	}

	/** Resolve native ranges even when the power has not enabled target automation. */
	async show(item, source, blocked = () => false) {
		this.clear();
		const revision = this.revision;
		const valid = () => !blocked() && canvas.ready && canvas.grid.isSquare
			&& source?.actor === item?.actor && item?.isOwner && item.type === "power"
			&& ["weapon", "melee", "touch", "reach", "range", "closeBurst", "closeBlast", "rangeBurst", "rangeBlast", "wall"].includes(item.system.rangeType)
			&& canvas.tokens.get(source.id) === source;
		if (!valid()) {
			return;
		}
		// Install cancellation before awaiting: scene/token changes can happen during resolution.
		for (const name of ["canvasTearDown", "controlToken", "deleteToken", "updateActor", "updateItem", "deleteItem"]) {
			this.hooks.push([name, Hooks.on(name, () => this.clear())]);
		}
		try {
			const range = await this.resolve(item);
			if (revision !== this.revision) {
				return;
			}
			if (!valid()) {
				this.clear();
				return;
			}
			Object.assign(this, { source, caster: source, range });
			const draw = () => {
				if (!valid()) {
					this.clear();
					return;
				}
				this.draw();
			};
			for (const name of ["canvasPan", "sightRefresh", "lightingRefresh", "refreshToken", "updateToken"]) {
				this.hooks.push([name, Hooks.on(name, draw)]);
			}
			draw();
		} catch {
			// Unsupported or incomplete powers simply have no hover range.
			if (revision === this.revision) {
				this.clear();
			}
		}
	}

	/** Reuse targeting's fill, boundaries and vision mask without area placement. */
	draw() {
		this.graphics ??= canvas.interface.addChild(new PIXI.Graphics());
		this.graphics.eventMode = "none";
		this.graphics.clear();
		rangeAreaDrawing.refreshRangeMask.call(this);
		const { shape } = this.range;
		if (shape) {
			const distance = ["closeBurst", "closeBlast"].includes(shape) ? this.range.area : this.range.maximum;
			// A directional blast has no chosen direction on hover; show its reachable extent.
			rangeAreaDrawing.drawRangeFill.call({ ...this, range: { normal: distance, maximum: distance } });
			rangeAreaDrawing.drawRangeBoundary.call(this, distance, 0xf5d787, false);
			return;
		}
		rangeAreaDrawing.drawRangeFill.call(this);
		if (this.range.maximum > this.range.normal) {
			rangeAreaDrawing.drawRangeBoundary.call(this, this.range.maximum, 0x9fc5e4, true);
		}
		rangeAreaDrawing.drawRangeBoundary.call(this, this.range.normal, 0xf5d787, false);
	}
}

export const powerRangeHover = new PowerRangeHover();

/** Bind whole NPC power rows, including keyboard focus and their nested action buttons. */
export function bindPowerRangeHover(root, actor, token, blocked) {
	const listeners = [];
	for (const row of root.querySelectorAll(".dnd4e-experimental-actor-display__power[data-item-id]")) {
		const show = () => void powerRangeHover.show(actor.items.get(row.dataset.itemId), token, blocked);
		const hide = event => {
			if (!row.contains(event.relatedTarget)) {
				powerRangeHover.clear();
			}
		};
		for (const [name, callback] of [["mouseenter", show], ["mouseleave", hide], ["focusin", show], ["focusout", hide], ["click", () => powerRangeHover.clear()]]) {
			row.addEventListener(name, callback);
			listeners.push([row, name, callback]);
		}
	}
	return () => {
		powerRangeHover.clear();
		for (const [row, name, callback] of listeners) {
			row.removeEventListener(name, callback);
		}
	};
}
