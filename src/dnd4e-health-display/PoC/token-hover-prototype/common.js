/*
 * THROWAWAY PROTOTYPE host. Sample data only; no Foundry access, no persistence.
 * Mirrors the data the real hover display already has (token-hover-display-data.js / token-hover-effects.js):
 * role, health segments + state word (no exact NPC HP shown), initiative distance, effects with a duration type.
 * Assumption: an "ongoing damage" effect exposes its amount and type; the real module may need to parse that.
 *
 * Prototype aids (not part of any design): click a token = damage, Shift+click = heal,
 * E (while hovering) = add a random effect, Q = remove the last effect, "Next turn" advances initiative.
 */
window.Proto = (() => {
	const COLS = 16;
	const ROWS = 10;
	const ROLE_ICON = { solo: "fa-solid fa-skull", leader: "fa-solid fa-star", elite: "fa-solid fa-diamond" };
	const ROLE_LABEL = { solo: "Solo", leader: "Leader", elite: "Elite", minion: "Minion" };

	const CATALOG = {
		helpless: { name: "Helpless", icon: "fa-solid fa-bed", end: "eotUser" },
		grabbed: { name: "Grabbed", icon: "fa-solid fa-hand-fist", end: "eotUser" },
		dazed: { name: "Dazed", icon: "fa-solid fa-face-dizzy", end: "save" },
		slowed: { name: "Slowed", icon: "fa-solid fa-person-walking", end: "eotUser" },
		blinded: { name: "Blinded", icon: "fa-solid fa-eye-slash", end: "sotUser" },
		ongoing: { name: "Ongoing 5 fire", icon: "fa-solid fa-fire", end: "save", ongoing: { n: 5, type: "fire" }, desc: "Takes 5 fire damage at the start of each of its turns." },
		weakened: { name: "Weakened", icon: "fa-solid fa-heart-crack", end: "save" },
		immobilized: { name: "Immobilized", icon: "fa-solid fa-link", end: "eotTarget" },
		stunned: { name: "Stunned", icon: "fa-solid fa-bolt", end: "eotUser" },
		prone: { name: "Prone", icon: "fa-solid fa-person-falling", end: "none" },
		inspired: { name: "Inspired (+2 attack)", icon: "fa-solid fa-wand-sparkles", end: "encounter", desc: "+2 bonus to attack rolls." },
		blessing: { name: "War Chiefstain's Blessing", icon: "fa-solid fa-flag", end: "encounter", desc: "+2 bonus to attack rolls against the target." },
		secondWind: { name: "Second Wind", icon: "fa-solid fa-wind", end: "sotTarget", desc: "+2 bonus to all defenses." },
	};

	// Standard 4e conditions have no description of their own; everything else is a custom effect with a title and description.
	const CONDITIONS = new Set(["helpless", "grabbed", "dazed", "slowed", "blinded", "weakened", "immobilized", "stunned", "prone"]);
	const fx = (key, source) => ({ key, ...CATALOG[key], condition: CONDITIONS.has(key), source });

	const creatures = [
		{ id: "hana", name: 'Hana "Gale" Soliogn', short: "Hana", type: "PC", hue: 205, size: 1, x: 5, y: 4, hp: 38, max: 46,
			effects: [fx("helpless", "vorhaal"), fx("grabbed", "gorrak"), fx("ongoing", "hobgob"), fx("blinded", "goblin1"), fx("weakened", "vorhaal"), fx("slowed", "gorrak")] },
		{ id: "kess", name: "Kess Varro", short: "Kess", type: "PC", hue: 160, size: 1, x: 6, y: 5, hp: 22, max: 52,
			effects: [fx("dazed", "goblin1"), fx("inspired", "tilda")] },
		{ id: "brannoch", name: "Brannoch Stonehand", short: "Brannoch", type: "PC", hue: 30, size: 1, x: 4, y: 5, hp: 61, max: 61,
			effects: [fx("slowed", "hobgob")] },
		{ id: "tilda", name: "Tilda Ember", short: "Tilda", type: "PC", hue: 285, size: 1, x: 5, y: 6, hp: 12, max: 40, effects: [fx("secondWind", "tilda")] },
		{ id: "goblin1", name: "Goblin Cutthroat", short: "Cutthroat", type: "NPC", role: "minion", hue: 100, size: 1, x: 7, y: 4, hp: 1, max: 1,
			effects: [fx("dazed", "kess")], traits: [{ name: "Minion", text: "Dies to any hit." }, { name: "Sneak Attack", text: "+1d6 with combat advantage." }] },
		{ id: "goblin2", name: "Goblin Cutthroat", short: "Cutthroat", type: "NPC", role: "minion", hue: 100, size: 1, x: 8, y: 2, hp: 1, max: 1, effects: [],
			traits: [{ name: "Minion", text: "Dies to any hit." }] },
		{ id: "goblin3", name: "Goblin Cutthroat", short: "Cutthroat", type: "NPC", role: "minion", hue: 100, size: 1, x: 8, y: 5, hp: 0, max: 1, effects: [],
			traits: [{ name: "Minion", text: "Dies to any hit." }] },
		{ id: "hobgob", name: "Hobgoblin Warcaster", short: "Warcaster", type: "NPC", role: "leader", hue: 20, size: 1, x: 9, y: 4, hp: 40, max: 45,
			effects: [fx("inspired", "hobgob")],
			traits: [{ name: "Warcaster's Command", text: "Allies within 5 gain +2 to attack rolls." }, { name: "Fire Burst (at-will)", text: "Ongoing 5 fire, save ends." }] },
		{ id: "gorrak", name: "Gorrak Ironjaw", short: "Gorrak", type: "NPC", role: "elite", hue: 345, size: 1, x: 7, y: 6, hp: 62, max: 130,
			effects: [fx("immobilized", "brannoch"), fx("weakened", "kess"), fx("blinded", "tilda"), fx("prone"), fx("stunned", "hana"), fx("dazed", "tilda"), fx("slowed", "kess"), fx("ongoing", "hana")],
			traits: [{ name: "Action Point", text: "Gorrak gains one extra action." }, { name: "Savage Reprisal", text: "Immediate reaction: 10 damage to an attacker who bloodies him." }] },
		{ id: "vorhaal", name: "Vorhaal the Pale Warden", short: "Vorhaal", type: "NPC", role: "solo", hue: 215, size: 2, x: 11, y: 3, hp: 140, max: 320,
			effects: [fx("weakened", "hana"), fx("blessing", "brannoch")],
			traits: [{ name: "Frost Aura 2", text: "Enemies starting a turn in the aura take 5 cold." }, { name: "Shatter Ward (reaction)", text: "When bloodied, a burst 3 pushes enemies 3 squares." }] },
	];
	const order = ["kess", "vorhaal", "hana", "goblin1", "hobgob", "brannoch", "goblin2", "tilda", "gorrak", "goblin3"];
	const state = { turn: 2, gm: true, hoverId: null };
	const byId = (id) => creatures.find((c) => c.id === id);
	const initial = (c) => c.name.replace(/^The /, "")[0];

	/** Same rules as getTokenHoverDisplayData(). */
	function getData(c) {
		const n = c.role === "minion" ? 1 : c.type === "PC" ? 6 : 4;
		const filled = c.hp <= 0 ? 0 : Math.min(n, Math.ceil((c.hp / c.max) * n));
		const states = c.type === "PC"
			? ["Defeated", "Critical", "Heavily Wounded", "Bloodied", "Hurt", "Scraped", "Healthy"]
			: ["Defeated", "Last Stand", "Bloodied", "Hurt", "Healthy"];
		const healthState = c.hp <= 0 ? "Defeated" : c.role === "minion" ? "Alive" : (states[filled] ?? "Healthy");
		const idx = order.indexOf(c.id);
		const count = idx < 0 ? null : (idx - state.turn + order.length) % order.length;
		return {
			c, n, filled, healthState,
			bloodied: c.hp > 0 && c.role !== "minion" && c.hp <= c.max / 2,
			lastStand: c.type === "NPC" && c.role !== "minion" && filled === 1,
			defeated: c.hp <= 0,
			segments: Array.from({ length: n }, (_u, i) => i < filled),
			role: c.role && c.role !== "minion" ? { key: c.role, icon: ROLE_ICON[c.role], label: ROLE_LABEL[c.role] } : c.role ? { key: "minion", label: "Minion" } : null,
			turn: count === null ? null : { count, label: count === 0 ? "Acting now" : `Acts in ${count} turn${count === 1 ? "" : "s"}` },
		};
	}

	/**
	 * Work out how an effect ends and where on the initiative order that happens.
	 * dist 0 = this turn, null = no turn-based end.
	 */
	function resolveEnd(c, e) {
		const src = e.source ? byId(e.source) : null;
		const at = (who, when) => {
			const idx = order.indexOf(who.id);
			let dist = idx < 0 ? null : (idx - state.turn + order.length) % order.length;
			if (when === "start" && dist === 0) {
				// the creature's turn has already started, so "start of next turn" is a full round away
				dist = order.length;
			}
			return { idx, dist, when, who };
		};
		switch (e.end) {
			case "save": return { kind: "save", ...at(c, "end"), text: "Save ends", detail: "d20 at the end of its own turn, 10+" };
			case "eotTarget": return { kind: "turn", ...at(c, "end"), text: `End of ${c.short}'s turn`, detail: "" };
			case "eotUser": return { kind: "turn", ...at(src ?? c, "end"), text: `End of ${(src ?? c).short}'s turn`, detail: "" };
			case "sotUser": return { kind: "turn", ...at(src ?? c, "start"), text: `Start of ${(src ?? c).short}'s turn`, detail: "" };
			case "sotTarget": return { kind: "turn", ...at(c, "start"), text: `Start of ${c.short}'s next turn`, detail: "" };
			case "encounter": return { kind: "encounter", idx: -1, dist: null, text: "End of encounter", detail: "" };
			default: return { kind: "none", idx: -1, dist: null, text: "No set end", detail: "" };
		}
	}

	function applyDamage(c, sign, big) {
		if (sign < 0 && c.role === "minion") {
			c.hp = 0;
		} else {
			c.hp = Math.max(0, Math.min(c.max, c.hp + sign * Math.max(1, Math.ceil(c.max * (big ? 0.34 : 0.2)))));
		}
	}

	function barHtml(d, extraClass = "") {
		return `<div class="hp-bar ${extraClass}" style="--n:${d.n}" role="img" aria-label="Health: ${d.healthState}">`
			+ d.segments.map((on) => `<span class="seg${on ? " on" : ""}"></span>`).join("")
			+ `<span class="state">${d.healthState}</span></div>`;
	}

	/** Build the host scene. Hooks: tokenExtra(d)->html, onHover(c,el,ev), onLeave(c), onChange(), onMove(ev), aids (html), onAids(el). */
	function mount(opts = {}) {
		document.body.insertAdjacentHTML("afterbegin", `
			<div class="stage"><div class="board" id="board">
				<div class="prop rug" style="--x:3;--y:3;--w:4;--h:4"></div>
				<div class="prop" style="--x:1;--y:1;--w:3;--h:1"></div>
				<div class="prop" style="--x:12;--y:7;--w:3;--h:2"></div>
				<div class="prop" style="--x:9;--y:7;--w:1;--h:2"></div>
				<div class="layer" id="under"></div>
			</div></div>
			<div class="aids">
				<button id="next">Next turn</button>
				<label><input type="checkbox" id="gm" checked> GM view</label>
				<span class="sep"></span>
				<span>click <b>−HP</b> · Shift+click <b>+HP</b> · <kbd>E</kbd> add effect · <kbd>Q</kbd> remove</span>
				${opts.aids ? `<span class="sep"></span>${opts.aids}` : ""}
			</div>`);
		const board = document.getElementById("board");
		board.style.setProperty("--cols", COLS);
		board.style.setProperty("--rows", ROWS);
		const layout = () => {
			const cell = Math.max(28, Math.min(72, Math.floor((innerWidth - 40) / COLS), Math.floor((innerHeight - 120) / ROWS)));
			board.style.setProperty("--cell", `${cell}px`);
		};
		layout();
		addEventListener("resize", layout);

		const els = new Map();
		for (const c of creatures) {
			const el = document.createElement("div");
			el.dataset.id = c.id;
			el.style.cssText = `--x:${c.x};--y:${c.y};--s:${c.size};--hue:${c.hue}`;
			board.appendChild(el);
			els.set(c.id, el);
			el.addEventListener("mouseenter", (ev) => {
				state.hoverId = c.id;
				opts.onHover?.(c, el, ev);
			});
			el.addEventListener("mouseleave", () => {
				state.hoverId = null;
				opts.onLeave?.(c);
			});
			el.addEventListener("mousemove", (ev) => opts.onMove?.(ev, c, el));
			el.addEventListener("click", (ev) => {
				applyDamage(c, ev.shiftKey ? 1 : -1, false);
				refresh();
			});
		}

		function refresh() {
			for (const c of creatures) {
				const d = getData(c);
				const el = els.get(c.id);
				el.className = `token ${c.type === "PC" ? "pc" : "hostile"}${d.defeated ? " defeated" : ""}${order[state.turn] === c.id ? " acting" : ""}${d.bloodied ? " bloodied" : ""}${d.lastStand ? " last-stand" : ""}`;
				el.innerHTML = `<div class="disc"><span class="ini">${initial(c)}</span></div>${opts.tokenExtra?.(d) ?? ""}`;
			}
			opts.onChange?.();
		}

		document.getElementById("next").onclick = () => {
			state.turn = (state.turn + 1) % order.length;
			refresh();
		};
		document.getElementById("gm").onchange = (ev) => {
			state.gm = ev.target.checked;
			refresh();
		};
		const pool = Object.keys(CATALOG);
		addEventListener("keydown", (ev) => {
			const c = state.hoverId ? byId(state.hoverId) : null;
			if (!c) {
				return;
			}
			if (ev.key === "e") {
				const key = pool[Math.floor(Math.random() * pool.length)];
				const others = creatures.filter((o) => o.id !== c.id);
				c.effects.push(fx(key, others[Math.floor(Math.random() * others.length)].id));
				refresh();
			} else if (ev.key === "q") {
				c.effects.pop();
				refresh();
			}
		});
		refresh();
		opts.onAids?.(document.querySelector(".aids"));
		return { board, els, refresh, cell: () => parseFloat(getComputedStyle(board).getPropertyValue("--cell")) };
	}

	function nav(current) {
		const items = [["index.html", "All"], ["1-token-ring.prototype.html", "1 Ring"],
			["4-effect-readout.prototype.html", "4 Effect readout"], ["5-quiet-dossier.prototype.html", "5 Quiet + Alt"], ["6-ring-readout.prototype.html", "6 Ring + readout"], ["7-health-designs.prototype.html?variant=A", "7 Health designs"], ["8-gem-iterations.prototype.html?variant=C", "8 Gem iterations"], ["9-stepped-tag.prototype.html?variant=1", "9 Stepped tag"]];
		document.body.insertAdjacentHTML("beforeend", `<nav class="protonav">${items.map(([href, label]) =>
			`<a href="${href}"${href === current ? ' class="cur"' : ""}>${label}</a>`).join("")}</nav>`);
		addEventListener("keydown", (ev) => {
			if (ev.target.matches?.("input,select,textarea")) {
				return;
			}
			const i = items.findIndex(([href]) => href === current);
			if (ev.key === "ArrowRight") {
				location.href = items[(i + 1) % items.length][0];
			} else if (ev.key === "ArrowLeft") {
				location.href = items[(i - 1 + items.length) % items.length][0];
			}
		});
	}

	return { creatures, order, state, byId, getData, resolveEnd, barHtml, mount, nav, ROLE_COLOR: { solo: "#c23034", leader: "#caa03f", elite: "#975bc9", minion: "#7d7870" } };
})();
