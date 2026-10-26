import { MODULE_ID } from "./rules.js";

/**
 * Clone already-enriched rules without the card's action and keyword header.
 */
function powerRuleContent(card) {
	const root = document.createElement("div");
	root.innerHTML = card;
	const content = root.querySelector(".card-content");
	if (!content) {
		return null;
	}
	const rules = (content.querySelector(".item-details") ?? content).cloneNode(true);
	rules.querySelectorAll(".basics, .flavour, .card-buttons, .effects-tray").forEach(node => node.remove());
	return rules;
}

/**
 * Identify only top-level native labels, preserving nested secondary attacks.
 */
function powerRuleKind(block) {
	if (block.matches("p")) {
		return ["target", "attack", "requirement", "trigger", "effect", "hit", "miss", "special", "sustain"]
			.find(kind => block.classList.contains(kind));
	}
	if (block.classList.contains("banter-power__rule")) {
		return block.querySelector(":scope > .banter-power__label")?.textContent.trim().replace(/:\s*$/, "").toLowerCase();
	}
	return null;
}

/**
 * Use source order to distinguish effects before the primary attack from its riders.
 * Custom prose without recognized labels remains available in full in both views.
 */
function powerPhaseRules(card, before) {
	const rules = powerRuleContent(card);
	if (!rules) {
		return "";
	}
	const blocks = [...rules.children];
	const attackIndex = blocks.findIndex(block => ["attack", "hit", "miss", "outcome"].includes(powerRuleKind(block)));
	for (const [index, block] of blocks.entries()) {
		const kind = powerRuleKind(block);
		const preEffect = kind === "effect" && attackIndex >= 0 && index < attackIndex;
		const setup = ["target", "attack"].includes(kind) || preEffect;
		const excluded = ["requirement", "trigger"].includes(kind);
		if (excluded || (before ? kind && !setup : setup)) {
			block.remove();
		}
	}
	return rules.textContent.trim() ? rules.innerHTML : "";
}

/**
 * Read target, attack and preceding effects without action, keywords or requirements.
 */
export function preAttackRules(card) {
	return powerPhaseRules(card, true);
}

/**
 * Read outcome rules and subsequent effects after the primary attack.
 */
export function postAttackRules(card) {
	return powerPhaseRules(card, false);
}

/**
 * Render the native informational card without invoking Item.roll/usePower.
 * DnD4e 0.9.3 toChat uses this same data/template path, but does not return its message.
 */
export async function renderPowerCard(item, utils, { showActions = false } = {}) {
	const system = await item.getChatData();
	const rollData = item.getRollData();
	const cardData = item.system.autoGenChatPowerCard
		? await foundry.applications.ux.TextEditor.implementation.enrichHTML(utils.preparePowerCardData(system, rollData), { relativeTo: item.actor, rollData }) : null;
	const html = await foundry.applications.handlebars.renderTemplate("systems/dnd4e/templates/chat/item-card.hbs", {
		actor: item.actor, item, system, labels: item.labels, cardData,
		tokenId: item.actor?.token?.uuid ?? null,
		isPower: true, isRoll: showActions, effects: showActions ? item.effects : false,
		hasAttack: showActions && item.hasAttack, hasDamage: showActions && item.hasDamage, hasHealing: showActions && item.hasHealing,
		hasEffect: showActions && item.hasEffect, hasSave: showActions && item.hasSave, hasAreaTarget: showActions && item.hasAreaTarget,
	});
	const root = document.createElement("div");
	root.innerHTML = html.replace("ability-usage--", `ability-usage--${item.system.useType}`);
	if (!showActions) {
		root.querySelectorAll(".card-buttons, .effects-tray, [data-action]").forEach(node => node.remove());
	}
	// Optional shared visual formatter; never copy live chat DOM or its listeners.
	if (game.modules.get("banter-4e-modifications")?.active) {
		const { PowerChatCards } = await import("../../../banter-4e-modifications/scripts/modules/chat-rolls/power-chat-cards.js");
		PowerChatCards.render({ speaker: { alias: item.actor?.name }, flags: { dnd4e: { itemData: { system: item.system } } } }, root);
	}
	return root.innerHTML;
}

/** Create and return a specifically identifiable informational or provisional card. */
export async function createPowerMessage(item, html, sessionId = null) {
	const data = {
		user: game.user.id, style: CONST.CHAT_MESSAGE_STYLES.OTHER, content: html,
		speaker: ChatMessage.getSpeaker({ actor: item.actor }),
		flags: { [MODULE_ID]: { powerActivation: { sessionId, itemUuid: item.uuid, provisional: Boolean(sessionId) } } },
	};
	data.flags.dnd4e = { itemData: item.toObject(), itemUuid: item.uuid, actorUuid: item.actor.uuid };
	const mode = game.settings.get("core", "messageMode");
	if (["gm", "blind"].includes(mode)) {
		data.whisper = ChatMessage.getWhisperRecipients("GM").map(user => user.id);
	}
	if (mode === "blind") {
		data.blind = true;
	}
	if (mode === "self") {
		data.whisper = [game.user.id];
	}
	return ChatMessage.create(data);
}
