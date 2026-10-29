import { MODULE_ID, BINDINGS_SETTING, reportRows, tickReport } from "./ledger-data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
let services = { getState: () => ({ reports: {} }), retry: async () => {} };
let ledger;

/** Attach recorder access without making the presentation own combat state. */
export function configureLedgerUI(recorder) {
	services = recorder;
}

/** Register the independent GM-only world-settings submenu. */
export function registerLedgerSettings() {
	game.settings.register(MODULE_ID, BINDINGS_SETTING, {
		name: "Combat Ledger attribution", scope: "world", config: false, type: Object,
		default: { bindings: [] }, onChange: refreshLedger,
	});
	game.settings.registerMenu(MODULE_ID, "combatLedgerAttribution", {
		name: "Combat Ledger attribution", label: "Configure companion attribution",
		hint: "Merge friendly token or actor statistics into an owner actor and hide their separate rows.",
		icon: "fa-solid fa-link", restricted: true, type: LedgerAttributionSettings,
	});
}

/** Add a control exclusively to the primary sidebar instance, never its popout clone. */
export function addLedgerButton(app, element) {
	if (!game.user.isGM || app !== ui.combat || app.isPopout || element.querySelector("[data-combat-ledger]")) {
		return;
	}
	const header = element.querySelector(".combat-tracker-header") ?? element.querySelector(".directory-header");
	if (!header) {
		return;
	}
	const button = document.createElement("button");
	button.type = "button";
	button.className = "combat-ledger-tracker-button";
	button.dataset.combatLedger = "";
	button.title = "Combat Ledger";
	button.ariaLabel = "Combat Ledger";
	button.innerHTML = '<i class="fa-solid fa-chart-line" aria-hidden="true"></i>';
	button.addEventListener("click", () => {
		if (game.user.isGM) {
			ledger ??= new CombatLedger();
			ledger.reportId = null;
			void ledger.render({ force: true }).catch(error => console.warn(`${MODULE_ID} | Could not open Combat Ledger`, error));
		}
	});
	header.append(button);
}

/** Refresh only an already open GM window; recording never opens a dialog automatically. */
export function refreshLedger() {
	if (game.user?.isGM && ledger?.rendered) {
		void ledger.render({ force: true }).catch(error => console.warn(`${MODULE_ID} | Could not refresh Combat Ledger`, error));
	}
}

/** Format elapsed active time without implying sub-second accuracy. */
export function duration(ms) {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

/** Keep unknown attempts out of hit-rate denominators. */
function rate(hit, attempts) {
	return attempts ? `${Math.round(hit / attempts * 100)}%` : "—";
}

/** Generate two aligned line charts; SVG interpolates only finite numbers and fixed labels. */
export function ledgerChart(rounds, damage = false) {
	const points = rounds.slice().sort((a, b) => a.round - b.round);
	if (!points.length) {
		return "";
	}
	const series = damage ? [["playerDamage", "Player team", "#ccad6b"], ["enemyDamage", "Enemy team", "#8ba7ae"]]
		: [["playerHp", "PC health", "#bd6b68"], ["playerSurges", "PC surges", "#ccad6b"], ["enemyHp", "Enemy health", "#8ba7ae"]];
	const maximum = damage ? Math.max(50, Math.ceil(Math.max(...points.flatMap(point => series.map(([key]) => point[key] || 0))) / 50) * 50) : 100;
	const x = index => 48 + index * 560 / Math.max(1, points.length - 1);
	const y = value => 145 - Math.max(0, Math.min(maximum, value)) / maximum * 120;
	let svg = '<svg viewBox="0 0 640 185" role="img" aria-label="' + (damage ? "Total damage dealt by each team per round" : "Team health and surges by round") + '">';
	for (const fraction of [0, .25, .5, .75, 1]) {
		svg += `<line x1="43" x2="615" y1="${y(maximum * fraction)}" y2="${y(maximum * fraction)}" stroke="#413a2d"/><text x="2" y="${y(maximum * fraction) + 4}">${Math.round(maximum * fraction)}${damage ? "" : "%"}</text>`;
	}
	for (const [key, label, color] of series) {
		// Missing resource maxima produce gaps, rather than invented zero-health values.
		let segment = [];
		const segments = [];
		points.forEach((point, index) => {
			if (Number.isFinite(point[key])) {
				segment.push(`${x(index)},${y(point[key])}`);
			} else if (segment.length) {
				segments.push(segment);
				segment = [];
			}
		});
		segments.push(segment);
		for (const coordinates of segments.filter(entry => entry.length)) {
			svg += `<polyline points="${coordinates.join(" ")}" fill="none" stroke="${color}" stroke-width="3"${key === "playerSurges" ? ' stroke-dasharray="5 4"' : ""}/>`;
		}
		points.forEach((point, index) => {
			if (Number.isFinite(point[key])) {
				svg += `<circle cx="${x(index)}" cy="${y(point[key])}" r="4" fill="${color}"><title>${point.round ? `Round ${point.round}` : "Start"} · ${label}: ${Math.round(point[key] * 10) / 10}${damage ? " damage" : "%"}${point.partial ? " (partial)" : ""}</title></circle>`;
			}
		});
	}
	points.forEach((point, index) => {
		// Thin labels in long encounters; every point retains its hover description.
		if (index % Math.max(1, Math.ceil(points.length / 12)) === 0 || index === points.length - 1) {
			svg += `<text x="${x(index)}" y="171" text-anchor="middle">${point.round ? `R${point.round}` : "Start"}${point.partial ? "*" : ""}</text>`;
		}
	});
	return svg + "</svg>";
}

/** Read-only GM statistics window; no prototype variants or mock data ship here. */
export class CombatLedger extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "dnd4e-combat-ledger", classes: ["dnd4e-combat-ledger"],
		position: { width: 1020, height: 820 }, window: { title: "Combat Ledger", resizable: true },
		actions: {
			settings() { return new LedgerAttributionSettings().render({ force: true }); },
			retry() { return services.retry(); },
		},
	};
	static PARTS = { body: { template: `modules/${MODULE_ID}/scripts/combat-ledger/ledger.hbs`, scrollable: [""] } };

	/** Render current or last combat, applying bindings only to the overview rows. */
	async _prepareContext() {
		if (!game.user.isGM) {
			throw new Error("Combat Ledger is GM only.");
		}
		const state = services.getState();
		const records = Object.values(state.reports).sort((a, b) => b.startedAt - a.startedAt);
		const current = records.find(report => !report.endedAt && report.combatId === (ui.combat?.viewed ?? game.combat)?.id)
			?? records.find(report => !report.endedAt);
		const selected = state.reports[this.reportId] ?? current ?? state.reports[state.lastReportId];
		const choices = records.map(report => ({ id: report.id, selected: report.id === selected?.id,
			label: `${report.endedAt ? "Last combat" : "Current combat"} · ${report.name}` }));
		if (!selected) {
			return { empty: true, storageError: state.storageError };
		}
		const report = structuredClone(selected);
		if (!report.endedAt) {
			tickReport(report, Date.now());
		}
		const bindings = game.settings.get(MODULE_ID, BINDINGS_SETTING)?.bindings ?? [];
		const names = Object.fromEntries(game.actors.map(actor => [actor.uuid, actor.name]));
		const rows = reportRows(report, bindings, names);
		const friendly = rows.filter(row => ["pc", "friendly"].includes(row.team));
		const sideDamage = Object.values(report.participants).filter(actor => ["pc", "friendly"].includes(actor.team))
			.reduce((sum, actor) => sum + actor.damage, 0);
		const sorted = rows.sort((a, b) => ["pc", "friendly", "neutral", "enemy"].indexOf(a.team)
			- ["pc", "friendly", "neutral", "enemy"].indexOf(b.team) || a.name.localeCompare(b.name));
		return { choices, name: report.name, elapsed: duration(report.elapsedMs),
			status: report.endedAt ? "Last combat · ended" : `Current combat · Round ${report.round}`,
			definitionsOpen: this.definitionsOpen, partial: report.partial || report.gaps, storageError: state.storageError, dirty: state.dirty,
			round: report.round, partyDamage: sideDamage, unattributedDamage: report.unattributedDamage,
			partyHitRate: rate(friendly.reduce((sum, row) => sum + row.hit, 0), friendly.reduce((sum, row) => sum + row.attempts, 0)),
			resourceChart: ledgerChart(report.rounds), damageChart: ledgerChart(report.rounds, true),
			rows: sorted.filter(row => !this.team || row.team === this.team).map((row, index, list) => ({ ...row,
				teamLabel: { pc: "Player characters", friendly: "Friendly companions", neutral: "Neutral", enemy: "Enemies" }[row.team],
				teamStart: index === 0 || row.team !== list[index - 1].team,
				includesLabel: row.includes.join(", "), avgTurn: row.turns ? duration(row.turnMs / row.turns) : "—",
				avgContemplating: row.turns ? duration(row.contemplatingMs / row.turns) : "—",
				totalContemplating: duration(row.contemplatingMs), activeDuration: duration(row.activeTurnMs),
				activeContemplating: duration(row.activeContemplatingMs), hitRate: rate(row.hit, row.attempts),
				receivedRate: rate(row.received, row.incoming), d20: row.d20Count ? (row.d20Sum / row.d20Count).toFixed(1) : "—",
			})),
			teams: [["", "All teams"], ["pc", "Player characters"], ["friendly", "Friendly companions"], ["enemy", "Enemies"], ["neutral", "Neutral"]]
				.map(([id, label]) => ({ id, label, selected: id === (this.team ?? "") })),
		};
	}

	/** Rebind controls after each render without changing any combat document. */
	_onRender(context, options) {
		super._onRender(context, options);
		this.element.querySelector(".combat-ledger-definitions")?.addEventListener("toggle", event => {
			this.definitionsOpen = event.target.open;
		});
		this.element.querySelector('[name="report"]')?.addEventListener("change", event => {
			this.reportId = event.target.value;
			void this.render({ force: true });
		});
		this.element.querySelector('[name="team"]')?.addEventListener("change", event => {
			this.team = event.target.value;
			void this.render({ force: true });
		});
	}
}

/** Reject ambiguous mappings instead of allowing cycles or double attribution. */
export function validateBindings(bindings) {
	const sources = new Set();
	for (const binding of bindings) {
		if (!binding.source || !binding.owner?.startsWith("Actor.") || sources.has(binding.source)) {
			throw new Error("Each source needs exactly one owner actor.");
		}
		if ((binding.sourceActor ?? binding.source) === binding.owner
			|| bindings.some(other => (other.sourceActor ?? other.source) === binding.owner)) {
			throw new Error("An owner cannot also be a bound source. Self-bindings and attribution chains are not allowed.");
		}
		sources.add(binding.source);
	}
}

/** World-scoped attribution editor; changes are applied only by an explicit Save. */
export class LedgerAttributionSettings extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: ["dnd4e-combat-ledger"], position: { width: 680, height: "auto" },
		window: { title: "Combat Ledger · Attribution", resizable: true },
		actions: {
			async addBinding() {
				const source = this.element.querySelector('[name="source"]').value;
				const owner = this.element.querySelector('[name="owner"]').value;
				try {
					const document = await fromUuid(source);
					const sourceActor = document?.actor ? `Actor.${document.actor.id}` : source;
					const draft = [...this.draft, { source, owner, sourceActor }];
					validateBindings(draft);
					if (document?.actor?.id === owner.slice(6)) {
						throw new Error("A token cannot be bound to its own actor.");
					}
					this.draft = draft;
					await this.render({ force: true });
				} catch (error) {
					ui.notifications.warn(error.message);
				}
			},
			removeBinding(event, target) {
				this.draft.splice(Number(target.dataset.index), 1);
				return this.render({ force: true });
			},
			async saveBindings() {
				if (!game.user.isGM) {
					return;
				}
				try {
					validateBindings(this.draft);
					await game.settings.set(MODULE_ID, BINDINGS_SETTING, { bindings: this.draft });
					await this.close();
				} catch (error) {
					ui.notifications.error(`Could not save attribution: ${error.message}`);
				}
			},
		},
	};
	static PARTS = { body: { template: `modules/${MODULE_ID}/scripts/combat-ledger/attribution.hbs` } };

	/** Resolve names for both scene-token overrides and actor-wide bindings. */
	async _prepareContext() {
		if (!game.user.isGM) {
			throw new Error("Combat Ledger attribution is GM only.");
		}
		this.draft ??= structuredClone(game.settings.get(MODULE_ID, BINDINGS_SETTING)?.bindings ?? []);
		const tokens = game.scenes.contents.flatMap(scene => scene.tokens.contents).filter(token => token.disposition === 1 && token.actor);
		const actors = game.actors.filter(actor => actor.type === "Player Character" || actor.hasPlayerOwner || tokens.some(token => token.actorId === actor.id));
		return { actors: actors.map(actor => ({ uuid: actor.uuid, name: actor.name })),
			tokens: tokens.map(token => ({ uuid: token.uuid, name: `${token.parent.name} · ${token.name}` })),
			bindings: await Promise.all(this.draft.map(async (binding, index) => {
				const [source, owner] = await Promise.all([fromUuid(binding.source), fromUuid(binding.owner)]);
				return { index, source: source?.name ?? binding.source, owner: owner?.name ?? binding.owner,
					scope: binding.source.startsWith("Scene.") ? "Token override" : "All actor tokens" };
			})),
		};
	}
}
