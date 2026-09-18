/**
 * Attach lazily generated DnD4e item tooltips to actor-display controls.
 *
 * @param {HTMLElement} root The rendered actor display element.
 * @param {Actor} actor The actor whose embedded items are displayed.
 */
export function initializeActorDisplayTooltips(root, actor) {
	for (const element of root.querySelectorAll("[data-item-tooltip]")) {
		element.addEventListener("mouseenter", () => activateItemTooltip(element, actor), { once: true });
	}
}

/**
 * Generate, cache, and activate the tooltip which Foundry could not see before
 * the first pointer entry.
 *
 * @param {HTMLElement} element The tooltip anchor.
 * @param {Actor} actor The parent actor.
 */
async function activateItemTooltip(element, actor) {
	const item = actor.items.get(element.dataset.itemId);
	if (!item) {
		return;
	}

	try {
		const customPower = item.type === "power" && Boolean(item.system?.autoGenChatPowerCard);
		let usesCustomFormatting = customPower;
		let html = "";
		if (customPower) {
			try {
				html = await generatePowerTooltip(actor, item);
			} catch (error) {
				console.warn(`Dnd4e Info Displays | Falling back to the system tooltip for ${item.name}.`, error);
			}
		}
		if (!html) {
			html = await generateSystemTooltip(actor, item);
			usesCustomFormatting = false;
		}
		if (!html || !element.isConnected) {
			return;
		}

		const cssClass = usesCustomFormatting
			? `dnd4e-info-tooltip dnd4e-info-tooltip--power ${element.dataset.powerUsage || ""}`
			: "dnd4e-info-tooltip dnd4e-info-tooltip--system";
		element.dataset.tooltipHtml = html;
		element.dataset.tooltipClass = cssClass;
		game.tooltip.activate(element, {
			html,
			direction: element.dataset.tooltipDirection || "RIGHT",
			cssClass,
		});
	} catch (error) {
		console.error(`Dnd4e Info Displays | Could not generate tooltip for ${item.name}.`, error);
	}
}

/**
 * Use the system's established item-card renderer for custom-authored powers,
 * feats, weapons, equipment, and consumables.
 *
 * @param {Actor} actor The parent actor.
 * @param {Item} item The item to render.
 * @returns {Promise<string>}
 */
async function generateSystemTooltip(actor, item) {
	const generator = dnd4e?.compatibility?.tah?.TokenBarHooks?.generateItemTooltip;
	if (typeof generator !== "function") {
		return "";
	}

	return generator(actor, item);
}

/**
 * Render an auto-generated power as a compact rules card.
 *
 * @param {Actor} actor The power's actor.
 * @param {Item} power The power item.
 * @returns {Promise<string>}
 */
export async function generatePowerTooltip(actor, power) {
	const system = power.system ?? {};
	const hasAttack = Boolean(system.attack?.isAttack);
	let attackBonus = 0;
	let rollData = {};

	if (hasAttack) {
		try {
			attackBonus = await power.getAttackBonus();
		} catch (error) {
			console.warn(`Dnd4e Info Displays | Could not calculate ${power.name}'s attack bonus.`, error);
		}
	}

	try {
		rollData = await actor.getRollData();
	} catch (error) {
		console.warn(`Dnd4e Info Displays | Could not prepare roll data for ${power.name}.`, error);
	}

	const blocks = [];
	pushRule(blocks, "requirement", localize("DND4E.Requirement", "Requirement"), system.requirement);
	pushRule(blocks, "trigger", localize("DND4E.Trigger", "Trigger"), system.trigger);

	const attackBlock = generateAttackBlock(power, attackBonus, hasAttack);
	const effectBlock = rule("effect", localize("DND4E.Effect", "Effect"), system.effect?.detail);
	const specialBlock = rule("special", localize("DND4E.Special", "Special"), system.special);
	if (system.postEffect && system.postSpecial) {
		blocks.push(attackBlock, effectBlock, specialBlock);
	} else if (system.postEffect) {
		blocks.push(specialBlock, attackBlock, effectBlock);
	} else if (system.postSpecial) {
		blocks.push(effectBlock, attackBlock, specialBlock);
	} else {
		blocks.push(effectBlock, specialBlock, attackBlock);
	}

	const sustainAction = system.sustain?.actionType;
	const sustainLabel = sustainAction && sustainAction !== "none"
		? `${localize("DND4E.Sustain", "Sustain")} ${configLabel(CONFIG.DND4E.abilityActivationTypes, sustainAction)}`
		: "";
	pushRule(blocks, "sustain", sustainLabel, system.sustain?.detail);

	const flavour = system.description?.chat
		? `<p class="flavour">${system.description.chat}</p>`
		: "";
	const body = blocks.filter(Boolean).join("");
	if (!flavour && !body) {
		return "";
	}

	const html = `${flavour}<div class="main-block">${body}</div>`;
	return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
		secrets: actor.isOwner,
		async: true,
		relativeTo: actor,
		rollData,
	});
}

/**
 * Render the rules content displayed below an NPC power's header.
 *
 * Auto-generated powers use the compact module card. Custom-authored powers
 * retain the DnD4e system's item-card formatting as a reliable fallback.
 *
 * @param {Actor} actor The power's actor.
 * @param {Item} power The power item.
 * @returns {Promise<{html: string, cssClass: string}>}
 */
export async function generateInlinePowerDetails(actor, power) {
	const customPower = Boolean(power.system?.autoGenChatPowerCard);
	if (customPower) {
		try {
			const html = await generatePowerTooltip(actor, power);
			if (html) {
				return { html, cssClass: "is-custom" };
			}
		} catch (error) {
			console.warn(`Dnd4e Info Displays | Falling back to the system card for ${power.name}.`, error);
		}
	}

	try {
		return {
			html: await generateSystemTooltip(actor, power),
			cssClass: "is-system",
		};
	} catch (error) {
		console.error(`Dnd4e Info Displays | Could not render inline details for ${power.name}.`, error);
		return { html: "", cssClass: "" };
	}
}

/** @param {Item} power @param {number} attackBonus @param {boolean} hasAttack */
function generateAttackBlock(power, attackBonus, hasAttack) {
	const system = power.system ?? {};
	const personal = system.rangeType === "personal";
	const range = personal ? "" : getPowerRange(system);
	const target = system.target ? ` (${system.target})` : "";
	const attack = hasAttack
		? `${formatModifier(attackBonus)} ${localize("DND4E.VS", "vs.")} ${configLabel(CONFIG.DND4E.defensives, system.attack?.def, "abbreviation")}`
		: "";
	const attackLine = [range ? `${range}${target}` : "", attack].filter(Boolean).join("; ");
	const parts = [];
	if (attackLine) {
		parts.push(rule("attack", hasAttack ? localize("DND4E.Attack", "Attack") : "Range", attackLine));
	}
	parts.push(rule("hit", localize("DND4E.Hit", "Hit"), system.hit?.detail));
	parts.push(rule("miss", localize("DND4E.Miss", "Miss"), system.miss?.detail));
	const content = parts.filter(Boolean).join("");
	return content ? `<div class="attack-block">${content}</div>` : "";
}

/** @param {object} system The power system data. */
function getPowerRange(system) {
	const rangePower = system.rangePower ?? "";
	let area = system.area ?? "";
	if (area !== "") {
		try {
			area = Roll.safeEval(area);
		} catch (_error) {
			// Preserve authored formula text when it cannot be evaluated safely.
		}
	}

	switch (system.rangeType) {
		case "weapon": return [configLabel(CONFIG.DND4E.weaponType, system.weaponType), rangePower].filter(Boolean).join(" ");
		case "melee": return `${localize("DND4E.Melee", "Melee")} ${rangePower}`.trim();
		case "reach": return `${localize("DND4E.rangeReach", "Reach")} ${rangePower}`.trim();
		case "range": return `${localize("DND4E.rangeRanged", "Ranged")} ${rangePower}${system.range?.long ? `/${system.range.long}` : ""}`.trim();
		case "closeBurst":
		case "closeBlast": return `${configLabel(CONFIG.DND4E.rangeType, system.rangeType)} ${area}`.trim();
		case "rangeBurst":
		case "rangeBlast":
		case "wall": return `${configLabel(CONFIG.DND4E.rangeType, system.rangeType)} ${area} ${localize("DND4E.RangeWithin", "within")} ${rangePower}`.trim();
		case "personal":
		case "special": return configLabel(CONFIG.DND4E.rangeType, system.rangeType);
		case "touch": return `${localize("DND4E.Melee", "Melee")} ${localize("DND4E.DistTouch", "Touch")}`;
		default: return "";
	}
}

function pushRule(blocks, cssClass, label, value) {
	const html = rule(cssClass, label, value);
	if (html) {
		blocks.push(html);
	}
}

function rule(cssClass, label, value) {
	return value ? `<p class="${cssClass}"><b>${label}:</b> ${value}</p>` : "";
}

function configLabel(config, key, property = "label") {
	const entry = config?.[key];
	const label = typeof entry === "string" ? entry : entry?.[property] ?? entry?.label ?? key ?? "";
	return label ? game.i18n.localize(label) : "";
}

function localize(key, fallback) {
	const result = game.i18n.localize(key);
	return result === key ? fallback : result;
}

function formatModifier(value) {
	const number = Number(value) || 0;
	return number >= 0 ? `+${number}` : String(number);
}
