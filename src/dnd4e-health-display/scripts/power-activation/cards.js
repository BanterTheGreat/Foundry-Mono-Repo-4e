import { MODULE_ID } from "./rules.js";

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
