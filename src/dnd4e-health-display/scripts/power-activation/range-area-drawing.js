/** Shared, read-only range drawing for targeting and NPC power hover. */
export const rangeAreaDrawing = {
	/**
	 * Clip the entire overlay, including borders, to the unpadded map
	 * and the active sight of the attack origin, falling back to the caster's sight.
	 * Lit areas also require that vision source's light-perception LOS.
	 * GMs without an active origin/caster sight source use the map bounds instead.
	 * Never use the union of other controlled tokens' vision or previously explored fog.
	 */
	refreshRangeMask() {
		this.rangeMask ??= canvas.interface.addChild(new PIXI.Graphics());
		this.rangeMask.eventMode = "none";
		this.rangeMask.clear();
		this.graphics.mask = this.rangeMask;
		const bounds = canvas.dimensions?.sceneRect;
		if (!bounds) {
			return;
		}
		const map = new PIXI.Polygon([
			bounds.x, bounds.y, bounds.x + bounds.width, bounds.y,
			bounds.x + bounds.width, bounds.y + bounds.height, bounds.x, bounds.y + bounds.height,
		]);
		const draw = (polygon, constraint) => {
			if (!polygon?.points?.length) {
				return;
			}
			// Polygon.intersectPolygon/intersectRectangle return a single polygon.
			// Preserve every disconnected component (and holes) through both clips.
			let tree = new foundry.data.PolygonTree().intersectPolygon(polygon, {
				clipType: ClipperLib.ClipType.ctUnion,
			});
			if (constraint) {
				tree = tree.intersectPolygon(constraint);
			}
			tree = tree.intersectPolygon(map);
			this.rangeMask.beginFill(0xffffff);
			tree.drawShape(this.rangeMask);
			this.rangeMask.endFill();
		};
		const vision = this.source.vision?.active ? this.source.vision : this.caster.vision;
		if (!canvas.scene.tokenVision || (game.user.isGM && !vision?.active)) {
			this.rangeMask.beginFill(0xffffff).drawRect(bounds.x, bounds.y, bounds.width, bounds.height).endFill();
			return;
		}
		if (!vision?.active) {
			return;
		}
		draw(vision.shape);
		if (vision.visionMode?.perceivesLight && vision.light) {
			for (const light of canvas.effects.lightSources.values()) {
				if (light.active && light.shape) {
					draw(light.shape, vision.light);
				}
			}
		}
	},

	/** Tint normal range and the surrounding long-range band without overlapping colours. */
	drawRangeFill() {
		const normal = this.range.normal * canvas.grid.size;
		const maximum = this.range.maximum * canvas.grid.size;
		const x = this.source.x - normal;
		const y = this.source.y - normal;
		const width = this.source.w + 2 * normal;
		const height = this.source.h + 2 * normal;
		this.graphics.lineStyle(0).beginFill(0xf5d787, .10)
			.drawRect(x, y, width, height).endFill();
		if (maximum > normal) {
			const band = maximum - normal;
			const outerWidth = this.source.w + 2 * maximum;
			this.graphics.beginFill(0x9fc5e4, .07)
				.drawRect(x - band, y - band, outerWidth, band)
				.drawRect(x - band, y + height, outerWidth, band)
				.drawRect(x - band, y, band, height)
				.drawRect(x + width, y, band, height).endFill();
		}
	},

	/** Keep soft borders readable at every canvas zoom. */
	drawRangeBoundary(range, color, dashed) {
		const zoom = canvas.stage.scale.x;
		const padding = range * canvas.grid.size;
		const x = this.source.x - padding;
		const y = this.source.y - padding;
		const width = this.source.w + 2 * padding;
		const height = this.source.h + 2 * padding;
		for (const [weight, stroke] of [[1.5, color]]) {
			this.graphics.lineStyle(weight / zoom, stroke, .75);
			if (dashed) {
				for (const [sx, sy, dx, dy, length] of [
					[x, y, 1, 0, width], [x + width, y, 0, 1, height],
					[x + width, y + height, -1, 0, width], [x, y + height, 0, -1, height],
				]) {
					for (let offset = 0; offset < length; offset += 14 / zoom) {
						const end = Math.min(offset + 8 / zoom, length);
						this.graphics.moveTo(sx + dx * offset, sy + dy * offset)
							.lineTo(sx + dx * end, sy + dy * end);
					}
				}
			} else {
				this.graphics.drawRect(x, y, width, height);
			}
		}
	},
};
