/** Local, disposable canvas emphasis for a confirmed target selection. */
export class AttackSpotlight {
	constructor() {
		this.graphics = null;
		this.faded = new Map();
	}

	/**
	 * Shade the scene and gently fade other token artwork without document changes.
	 * @param {object} session Activation state, origin token and selected targets.
	 */
	update(session) {
		const current = token => token?.visible && canvas.tokens.get(token.id) === token;
		if (!canvas.ready || ["targeting", "updatingVariant", "closed"].includes(session.state)
			|| !current(session.source)) {
			this.clear();
			return;
		}
		const targets = session.targets.filter(current);
		if (!targets.length) {
			this.clear();
			return;
		}
		const focused = new Set([session.source, ...targets]);
		this.fadeOthers(focused, current);
		if (!this.graphics || this.graphics.destroyed) {
			this.graphics = canvas.interface.addChild(new PIXI.Graphics());
			this.graphics.eventMode = "none";
		}
		// Tokens draw ERASE-blended void meshes into the interface group. Draw after
		// that layer so those meshes cannot punch unintended holes in our shade.
		this.graphics.zIndex = (canvas.tokens.zIndex ?? 0) + 1;
		const graphics = this.graphics;
		graphics.clear();
		const bounds = canvas.dimensions.rect;
		const rectangle = (x, y, width, height) => new PIXI.Polygon([
			x, y, x + width, y, x + width, y + height, x, y + height,
		]);
		let shade = new foundry.data.PolygonTree().intersectPolygon(
			rectangle(bounds.x, bounds.y, bounds.width, bounds.height),
			{ clipType: ClipperLib.ClipType.ctUnion },
		);
		for (const token of focused) {
			// Sequential subtraction preserves overlapping cutouts without double shading.
			const points = [];
			for (let step = 0; step < 64; step++) {
				const angle = step * Math.PI * 2 / 64;
				points.push(token.x + token.w / 2 + Math.cos(angle) * (token.w / 2 + 5),
					token.y + token.h / 2 + Math.sin(angle) * (token.h / 2 + 5));
			}
			shade = shade.intersectPolygon(new PIXI.Polygon(points),
				{ clipType: ClipperLib.ClipType.ctDifference });
		}
		graphics.lineStyle(0).beginFill(0x000000, 0.35);
		shade.drawShape(graphics);
		graphics.endFill();
		for (const token of focused) {
			const color = token === session.source ? 0xe5b66c : 0x75bfff;
			const x = token.x + token.w / 2;
			const y = token.y + token.h / 2;
			graphics.lineStyle(10, color, 0.18).drawEllipse(x, y, token.w / 2 + 5, token.h / 2 + 5);
			graphics.lineStyle(3, color, 0.95).drawEllipse(x, y, token.w / 2 + 5, token.h / 2 + 5);
		}
	}

	/** Apply one owned alpha filter per unrelated mesh, preserving existing effects. */
	fadeOthers(focused, current) {
		const meshes = new Set((canvas.tokens.placeables ?? [])
			.filter(token => current(token) && !focused.has(token) && token.mesh && !token.mesh.destroyed)
			.map(token => token.mesh));
		for (const [mesh, filter] of this.faded) {
			if (!meshes.has(mesh)) {
				this.restoreMesh(mesh, filter);
			}
		}
		for (const mesh of meshes) {
			let filter = this.faded.get(mesh);
			if (!filter) {
				filter = new PIXI.filters.AlphaFilter(0.85);
				this.faded.set(mesh, filter);
			}
			if (!mesh.filters?.includes(filter)) {
				mesh.filters = [...(mesh.filters ?? []), filter];
			}
		}
	}

	/** Remove only our transparency filter, retaining concurrent appearance changes. */
	restoreMesh(mesh, filter) {
		if (!mesh.destroyed && mesh.filters?.includes(filter)) {
			mesh.filters = mesh.filters.filter(candidate => candidate !== filter);
		}
		filter.destroy();
		this.faded.delete(mesh);
	}

	/** Remove the shade on cancellation, completion, lost visibility or scene teardown. */
	clear() {
		for (const [mesh, filter] of this.faded) {
			this.restoreMesh(mesh, filter);
		}
		if (this.graphics && !this.graphics.destroyed) {
			this.graphics.removeFromParent();
			this.graphics.destroy();
		}
		this.graphics = null;
	}
}
