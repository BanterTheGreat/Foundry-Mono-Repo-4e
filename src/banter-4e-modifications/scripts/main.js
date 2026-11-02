import { Dnd4eSystemCustomizations } from "./modules/dnd4e-system-customizations/dnd4e-system-customizations.js";
import { PlayerDefense } from "./modules/player-defense/player-defense.js";
import { SocketHelper } from "./modules/player-defense/socket-helper.js";
import { TriggerPrompts } from "./modules/trigger-prompts/trigger-prompts.js";
import { CombatChallenge, COMBAT_CHALLENGE_SOCKET } from "./modules/trigger-prompts/combat-challenge.js";
import { TriggerItemLimits } from "./modules/trigger-prompts/trigger-item-limits.js";
import { PowerTriggerConfiguration } from "./modules/trigger-prompts/power-trigger-configuration.js";
import { OpportunityAttackChatActions } from "./modules/opportunity-attack-chat/opportunity-attack-chat-actions.js";
import { TargetingWarning } from "./modules/targeting-warning/targeting-warning.js";
import { ActorDirectoryLevels } from "./modules/actor-directory-levels/actor-directory-levels.js";
import { AttackBuffs } from "./modules/attack-buffs/attack-buffs.js";
import { SkillBuffs } from "./modules/skill-buffs/skill-buffs.js";
import { ChatRolls } from "./modules/chat-rolls/chat-rolls.js";
import { TRIGGER_SOCKET_ACTION } from "./modules/trigger-prompts/constants.js";
import { Logger } from "./shared/logger.js";
import { MODULE_NAME, ENABLE_ACTIVE_DEFENSE, ENABLE_DEBUG_LOGGING, ENABLE_OPPORTUNITY_ATTACK_CHAT_ACTIONS, ENABLE_TRIGGER_PROMPTS } from "./shared/globals.js";

let socket;

Hooks.on("i18nInit", ChatRolls.registerSettings);
Hooks.on("i18nInit", TargetingWarning.registerSettings);
Hooks.once("ready", ChatRolls.install);
Hooks.on("renderChatMessageHTML", ChatRolls.render);
Hooks.on("renderChatMessage", ChatRolls.render);


Hooks.on("i18nInit", () => {
  // Register Settings
  game.settings.register(MODULE_NAME, ENABLE_ACTIVE_DEFENSE, {
    name: "Enable active defense",
    description: "Prompts players to defend against NPC attack rolls in a dialog.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  game.settings.register(MODULE_NAME, ENABLE_TRIGGER_PROMPTS, {
    name: "Enable trigger prompts",
    description: "Posts private combat prompts when configured actor triggers may occur.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  game.settings.register(MODULE_NAME, ENABLE_OPPORTUNITY_ATTACK_CHAT_ACTIONS, {
    name: "Enable Opportunity Attack chat actions",
    description: "Adds Charge and Opportunity Attack variant actions to eligible DnD4e power chat cards.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  game.settings.register(MODULE_NAME, ENABLE_DEBUG_LOGGING, {
    name: "Enable debug logging",
    description: "Shows warning notifications and writes informational messages to the browser console. Errors are always shown.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });
});

//SocketLib; Required for editing chat messages as users for rolls.
Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule("banter-4e-modifications");
  socket.register("deleteMessage", SocketHelper.deleteMessage);
  socket.register("updateMessage", SocketHelper.updateMessage);
  socket.register("attemptDefenseDialog", SocketHelper.attemptDefenseDialog);
  socket.register("resolveDefenseTarget", SocketHelper.resolveDefenseTarget);
  socket.register(COMBAT_CHALLENGE_SOCKET, CombatChallenge.apply);
  // Trigger prompts are kept by their author, so these run on that client, not a GM.
  socket.register(TRIGGER_SOCKET_ACTION.CLAIM_PROMPT, TriggerPrompts.claimPromptFromSocket);
  socket.register(TRIGGER_SOCKET_ACTION.ITEM_LIMIT, TriggerPrompts.itemLimitFromSocket);
  socket.register(TRIGGER_SOCKET_ACTION.DISMISS_PROMPT, TriggerPrompts.dismissPromptFromSocket);
});

Hooks.once("ready", () => {
  if (game.settings.get(MODULE_NAME, ENABLE_ACTIVE_DEFENSE) && !globalThis.socketlib) {
    ui.notifications.error("Banter's 4e Modifications requires the SocketLib module to be installed and enabled for Player Defense.");
  }
});

Hooks.on("ready", () => game.SocketHelper = new SocketHelper());
Hooks.on("ready", () => {
  if (game.settings.get(MODULE_NAME, ENABLE_TRIGGER_PROMPTS)) {
    game.TriggerPrompts = new TriggerPrompts(socket);
    TriggerItemLimits.registerRest();
    game.TriggerPrompts.onReady().catch(error => Logger.error("Trigger prompt startup failed", { error: error.message }));
  }
});

// Should not be needed anymore with the V14 version.
// Hooks.on("init", Dnd4eSystemCustomizations.replaceConditionList);
Hooks.on("init", Dnd4eSystemCustomizations.replaceSkills);
Hooks.once("ready", TargetingWarning.install);
Hooks.once("ready", AttackBuffs.install);
Hooks.once("ready", SkillBuffs.install);
// Chat history renders before ready. Restoring stored badges needs no system
// imports or live actor data, so register its renderer as the module loads.
Hooks.on("renderChatMessageHTML", AttackBuffs.renderBadges);
Hooks.on("renderChatMessage", AttackBuffs.renderBadges);
Hooks.on("renderActorDirectory", ActorDirectoryLevels.onRenderActorDirectory);
Hooks.on("updateActor", ActorDirectoryLevels.onUpdateActor);

// Opportunity Attack chat actions

Hooks.on("i18nInit", () => {
  if (game.settings.get(MODULE_NAME, ENABLE_OPPORTUNITY_ATTACK_CHAT_ACTIONS)) {
    Hooks.on("renderChatMessageHTML", OpportunityAttackChatActions.onRenderChatMessage);
    Hooks.on("renderChatMessage", OpportunityAttackChatActions.onRenderChatMessage);
  }
});

// Player Defense

Hooks.on("i18nInit", () => {
  if (game.settings.get(MODULE_NAME, ENABLE_ACTIVE_DEFENSE)) {
    Hooks.on("ready", () => game.PlayerDefense = new PlayerDefense());
    Hooks.on("dnd4e.rollAttack", PlayerDefense.OnRollAttack);
    Hooks.on("preCreateChatMessage", PlayerDefense.OnPowerChatMessage);
    Hooks.on("renderChatMessageHTML", (message, html) => PlayerDefense.onRenderDefenseMessage(message, socket, html));
  }
});

// Trigger prompts

Hooks.on("i18nInit", () => {
  if (game.settings.get(MODULE_NAME, ENABLE_TRIGGER_PROMPTS)) {
    Hooks.on("dnd4e.rollAttack", TriggerPrompts.onDnd4eRollAttack);
    Hooks.on("preCreateChatMessage", TriggerPrompts.onPreCreateRollMessage);
    Hooks.on("createChatMessage", TriggerPrompts.onCreateRollMessage);
    Hooks.on("updateChatMessage", TriggerPrompts.onAutomationMessage);
    Hooks.on("moveToken", TriggerPrompts.onMoveToken);
    Hooks.on("updateActor", TriggerPrompts.onUpdateActor);
    Hooks.on("getActorSheetHeaderButtons", TriggerPrompts.onGetActorSheetHeaderButtons);
    Hooks.on("getItemSheetHeaderButtons", PowerTriggerConfiguration.onGetItemSheetHeaderButtons);
    Hooks.on("getHeaderControlsApplicationV2", TriggerPrompts.onGetHeaderControlsApplicationV2);
    Hooks.on("getHeaderControlsApplicationV2", PowerTriggerConfiguration.onGetHeaderControlsApplicationV2);
    Hooks.on("renderChatMessageHTML", (message, html) => TriggerPrompts.onRenderPromptMessage(message, html));
    Hooks.on("createChatMessage", message => game.TriggerPrompts?.promptChat.alerts.show(message));
    Hooks.on("updateChatMessage", message => game.TriggerPrompts?.promptChat.alerts.show(message));
    Hooks.on("deleteChatMessage", message => game.TriggerPrompts?.promptChat.alerts.remove(message.id));
  }
});
