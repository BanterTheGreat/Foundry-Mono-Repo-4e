const DEFENSES = ["fort", "ref", "wil"];
const TARGET_EFFECTS = new Set(["hit", "miss", "hitOrMiss", "all", "enemies"]);

/**
 * Build read-only NPC power annotations from native effects, rules text and scene PCs.
 * Weak means tied for the lowest non-AC defense, not damage vulnerability or range eligibility.
 *
 * @param {Item} power The NPC power.
 * @param {Token} source The displayed token (its placed disposition is authoritative).
 * @param {Iterable<Token>} tokens Tokens on the current scene.
 * @returns {object} Compact template annotations.
 */
export function getNpcPowerHints(power, source, tokens = []) {
	const action = power.system?.actionType;
	const actionLabel = { standard: "Standard", minor: "Minor", reaction: "Reaction", interrupt: "Interrupt",
		move: "Move", free: "Free", opportunity: "Opportunity", none: "No action", rest: "Rest" }[action] ?? "Other";
	const conditionNames = getPowerConditions(power);
	const defense = power.system?.attack?.def;
	const weak = [];
	const candidates = [];
	const friendly = source?.document?.disposition === (globalThis.CONST?.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1);
	if (!friendly && (power.hasAttack ?? power.system?.attack?.isAttack) && DEFENSES.includes(defense)) {
		const seen = new Set();
		for (const token of tokens) {
			const actor = token.actor;
			if (actor?.type !== "Player Character") {
				continue;
			}
			const key = actor.uuid ?? actor;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			const values = DEFENSES.map(key => actor.system?.defences?.[key]?.value);
			if (values.some(value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)))) {
				continue;
			}
			const value = Number(actor.system.defences[defense].value);
			const name = token.name || actor.name;
			const candidate = { name, value };
			candidates.push(candidate);
			if (value === Math.min(...values.map(Number))) {
				weak.push(candidate);
			}
		}
	}
	const defenseLabel = { fort: "Fortitude", ref: "Reflex", wil: "Will" }[defense];
	const isWeakFallback = !weak.length && candidates.length > 0;
	if (isWeakFallback) {
		const lowest = Math.min(...candidates.map(candidate => candidate.value));
		weak.push(...candidates.filter(candidate => candidate.value === lowest));
	}
	return {
		actionLabel,
		conditionSummary: conditionNames.join(", "),
		weakSummary: formatPowerHitChances(weak),
		weakTargets: weak,
		isWeakFallback,
		weakLabel: isWeakFallback ? "Lowest" : "Weak",
		weakTooltip: weak.length ? (isWeakFallback
			? `Lowest ${defenseLabel} among scene PCs; this is not their personal weakest defense. Does not check range or line of sight.`
			: `vs ${defenseLabel}: tied for these PCs' lowest non-AC defense. Does not check range or line of sight.`) : "",
		hasPowerHints: Boolean(conditionNames.length || weak.length),
	};
}

/**
 * Format base d20 hit chances against prepared defenses, with natural 1/20 limits.
 * Excludes situational bonuses, combat advantage, cover, concealment and roll modes.
 * An unavailable bonus leaves the names visible without inventing a percentage.
 *
 * @param {Array<{name: string, value: number}>} targets Listed PCs and targeted defenses.
 * @param {number|null} attackBonus Native base power attack bonus.
 * @returns {string}
 */
export function formatPowerHitChances(targets, attackBonus = null) {
	return targets.map(target => {
		if (typeof attackBonus !== "number" || !Number.isFinite(attackBonus)) {
			return target.name;
		}
		const needed = Math.ceil(target.value - attackBonus);
		const percent = Math.max(5, Math.min(95, (21 - needed) * 5));
		return `${target.name} (${percent}%)`;
	}).join("\n");
}

/**
 * Prefer native target-effect statuses; also recognize explicit English condition applications
 * in hit/miss/effect rules and custom cards. This is a summary, never effect automation.
 * Requirements, triggers, flavor and power names are deliberately not searched.
 *
 * @param {Item} power The power to summarize.
 * @returns {string[]} Unique configured condition names.
 */
export function getPowerConditions(power) {
	const config = globalThis.CONFIG ?? {};
	const localize = value => globalThis.game?.i18n?.localize(value) ?? value;
	const labels = new Map(Object.entries(config.DND4E?.conditionTypes ?? {}).map(([id, label]) => [id, localize(label)]));
	for (const status of config.statusEffects ?? []) {
		labels.set(status.id, localize(status.name));
	}
	const found = new Set();
	for (const effect of power.effects ?? []) {
		if (!TARGET_EFFECTS.has(effect.system?.powerEffectType) || effect.disabled || effect.transfer) {
			continue;
		}
		for (const id of effect.statuses ?? []) {
			if (id !== "bloodied" && labels.has(id)) {
				found.add(labels.get(id));
			}
		}
	}
	const system = power.system ?? {};
	const rules = [system.hit?.detail, system.miss?.detail, system.effect?.detail,
		...(!system.autoGenChatPowerCard ? [system.description?.value] : [])];
	for (const html of rules.filter(Boolean)) {
		const element = document.createElement("div");
		element.innerHTML = html;
		const text = (element.textContent ?? "").replace(/\s+/g, " ");
		for (const [id, label] of Object.entries(config.DND4E?.conditionTypes ?? {})) {
			if (id === "bloodied") {
				continue;
			}
			// Native condition IDs are English rules terms even when the configured labels are localized.
			const term = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const application = new RegExp(`\\b(?:is|are|becomes?|knocks?|render(?:s)?|falls?)\\s+(?:the\\s+target\\s+)?(?:\\w+\\s+){0,3}?${term}\\b`, "i");
			for (const clause of text.split(/[.;:]/)) {
				if (!/\b(?:not|immune|immunity|cannot|can't|remove[sd]?|no longer|against|while|already)\b/i.test(clause)
					&& application.test(clause)) {
					found.add(labels.get(id) ?? localize(label));
				}
			}
		}
	}
	return [...found];
}
