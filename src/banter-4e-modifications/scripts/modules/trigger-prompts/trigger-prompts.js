import { confirmedAutomationEvents } from "./automation-events.js";
import { TRIGGER_PROMPT_UI } from "./constants.js";
import { ActorTriggerConfiguration } from "./actor-trigger-configuration.js";
import { findHpDamage } from "./hp-damage-source.js";
import { AttackResultCapture } from "./attack-result-capture.js";
import {
  CombatEventBus,
  MOVEMENT_TYPE,
  createAttackEventFromDefense,
  createAttackTargetedEvents,
  createAttackEventsFromCapture,
  createHpChangedEvent,
  createMovementCommittedEvent,
  createSaveResolvedEvent,
} from "./combat-events.js";
import { CombatTriggerDispatcher } from "./combat-trigger-dispatcher.js";
import { TriggerPromptChat } from "./trigger-prompt-chat.js";

/**
 * Foundry hook adapter for the trigger-prompt submodule.
 *
 * Each hook handler translates one Foundry occurrence into a normalized combat
 * event and puts it on the event bus; the dispatcher subscribes to the bus.
 * Hooks that fire on every client (token moves and actor updates) act only on
 * the client whose user made the change, so each event is reported exactly once and
 * no GM has to be connected.
 */
export class TriggerPrompts {
  /**
   * @param {object} socket
   *   Registered SocketLib module used to reach a prompt's author.
   */
  constructor(socket) {
    this.socket = socket;
    this.confirmedAttacks = new Set();
    this.attackCapture = new AttackResultCapture();
    this.events = new CombatEventBus();
    this.promptChat = new TriggerPromptChat(socket);
    this.limits = this.promptChat.limits;
    this.dispatcher = new CombatTriggerDispatcher(this.promptChat);
    this.events.subscribe(event => this.dispatcher.handle(event));
  }

  /**
   * Tidies prompts left from an earlier session and, on one GM client, moves
   * legacy actor-flag assignments onto powers.
   *
   * @returns {Promise<void>}
   */
  async onReady() {
    await this.promptChat.sweepExpiredPrompts();
    for (const message of game.messages.values()) {
      this.promptChat.alerts.show(message);
    }
    if (game.user.isGM) {
      await ActorTriggerConfiguration.migrateAllLegacyAssignments();
    }
  }

  /**
   * Captures DnD4e's attack metadata before the corresponding chat message is
   * created. The subsequent message hook adds the final roll total.
   *
   * @param {Item} item
   * @param {object} target
   * @param {object} speaker
   */
  static onDnd4eRollAttack(item, target, speaker) {
    if (!game.TriggerPrompts) {
      return;
    }
    game.TriggerPrompts.attackCapture.capture({ item, target, speaker, sceneId: canvas.scene?.id ?? null });
  }

  /**
   * Completes a captured attack from a DnD4e chat-roll message and reports one
   * attack event per target.
   *
   * @param {ChatMessage} message
   */
  static onPreCreateRollMessage(message) {
    const attack = game.TriggerPrompts?.attackCapture.consume(message);
    if (!attack) {
      return;
    }
    const automated = Boolean(message.flags?.["dnd4e-health-display"]?.attackResults?.sessionId);
    if (automated) {
      TriggerPrompts.#snapshotAutomationAttack(message, attack);
    }
    game.TriggerPrompts.events.emitAll([
      ...createAttackTargetedEvents(attack),
      ...(automated ? [] : createAttackEventsFromCapture(attack)),
    ]);
  }

  /**
   * Waits for the rolling client's Dice So Nice animation, when present, then
   * reports a completed saving throw. The author check keeps every other client
   * from reporting the same message.
   *
   * @param {ChatMessage} message
   * @returns {Promise<void>}
   */
  static async onCreateRollMessage(message) {
    await TriggerPrompts.onAutomationMessage(message, null, {}, message.author?.id);
    if (message.author?.id !== game.user?.id) {
      return;
    }
    const savingThrow = TriggerPrompts.#captureSavingThrow(message);
    if (savingThrow) {
      await TriggerPrompts.#waitForDiceSoNiceAnimation(message.id);
      await game.TriggerPrompts?.events.emit(createSaveResolvedEvent(savingThrow));
    }
  }

  /** Report each confirmed automation target once, on the client that confirmed it. */
  static async onAutomationMessage(message, changes, options, userId) {
    const prompts = game.TriggerPrompts;
    const confirmation = changes?.flags?.["dnd4e-health-display"]?.attackResults?.pending
      ?? changes?.["flags.dnd4e-health-display.attackResults.pending"];
    if (!prompts || userId !== game.user.id || changes !== null && confirmation !== false) {
      return;
    }
    for (const event of confirmedAutomationEvents(message)) {
      const key = `${message.id}:${event.target.tokenId}`;
      if (prompts.confirmedAttacks.has(key)) {
        continue;
      }
      prompts.confirmedAttacks.add(key);
      await prompts.events.emit(event);
    }
  }

  /**
   * Reports a committed token move. Foundry fires `moveToken` on every client
   * once a move is applied, so only the user who requested it reports it,
   * keeping each move to one event whoever (player or GM) made it.
   *
   * @param {TokenDocument} document
   * @param {TokenMovementOperation} movement
   *   The committed movement, with its origin and the waypoints it passed.
   * @param {object} operation
   * @param {User} user
   *   User who requested the move.
   * @returns {Promise<void>}
   */
  static async onMoveToken(document, movement, operation, user) {
    const triggerPrompts = game.TriggerPrompts;
    if (!triggerPrompts || user?.id !== game.user.id || movement.method === "undo") {
      return;
    }
    const path = TriggerPrompts.#buildMovementPath(movement);
    if (path.length < 2) {
      return;
    }
    // Foundry v14 stores the action from the previous point on each waypoint.
    // Preserve the full path for other triggers, but exclude Shift segments
    // from opportunity attacks, including mixed Walk/Shift movement.
    const opportunityPaths = [];
    let previous = movement.origin;
    for (const waypoint of movement.passed?.waypoints ?? []) {
      const action = String(waypoint.action ?? document.movementAction ?? "walk").toLowerCase();
      if (action !== "shift") {
        const segment = TriggerPrompts.#buildMovementPath({ origin: previous, passed: { waypoints: [waypoint] } });
        if (segment.length > 1) {
          opportunityPaths.push(segment);
        }
      }
      previous = waypoint;
    }
    await triggerPrompts.events.emit(createMovementCommittedEvent({
      sceneId: document.parent.id,
      tokenId: document.id,
      path,
      movementType: opportunityPaths.length ? MOVEMENT_TYPE.WALK : MOVEMENT_TYPE.SHIFT,
      opportunityPaths,
    }));
  }

  /**
   * Reports hit-point changes made by this client's user. DnD4e carries the
   * previous HP value in the update options.
   *
   * @param {Actor} actor
   * @param {object} changes
   * @param {object} options
   * @param {string} userId
   *   User who made the update.
   * @returns {Promise<void>}
   */
  static async onUpdateActor(actor, changes, options, userId) {
    const triggerPrompts = game.TriggerPrompts;
    if (!triggerPrompts || userId !== game.user.id || !game.combat?.started) {
      return;
    }
    const oldHp = options.dnd4e?.hp?.hp;
    const newHp = actor.system.attributes?.hp?.value;
    const oldTemp = options.dnd4e?.hp?.temp;
    const newTemp = Number(actor.system.attributes?.temphp?.value ?? 0);
    if (!Number.isFinite(oldHp) || !Number.isFinite(newHp) || oldHp === newHp && !(Number(oldTemp) > newTemp)) {
      return;
    }
    const bloodiedThreshold = actor.system.details?.bloodied ?? actor.system.attributes?.hp?.max / 2;
    const events = game.combat.combatants
      .filter(combatant => combatant.actor?.uuid === actor.uuid)
      .map(combatant => {
        const change = { sceneId: combatant.sceneId, tokenId: combatant.tokenId, oldHp, newHp, bloodiedThreshold };
        const damage = findHpDamage(game.messages?.values?.() ?? [], change);
        return createHpChangedEvent({ ...change, attacker: damage?.attacker, attackRange: damage?.attackRange,
          damageTypes: damage?.damageTypes,
          damageTaken: damage?.amount ?? Math.max(0, oldHp - newHp) + Math.max(0, Number(oldTemp ?? newTemp) - newTemp),
        });
      });
    await triggerPrompts.events.emitAll(events);
  }

  /**
   * Adds the trigger-configuration control to legacy actor sheets.
   *
   * @param {object} app
   * @param {object[]} buttons
   */
  static onGetActorSheetHeaderButtons(app, buttons) {
    const actor = app.actor;
    if (!actor || !game.user.isGM && !actor.isOwner) {
      return;
    }
    buttons.unshift({ class: TRIGGER_PROMPT_UI.CONFIG_CLASS, icon: "fas fa-bolt", label: "Trigger prompts", onclick: () => ActorTriggerConfiguration.showActorDialog(actor) });
  }

  /**
   * Adds the configuration control to Foundry v13 ApplicationV2 actor sheets.
   *
   * @param {object} app
   * @param {object[]} controls
   */
  static onGetHeaderControlsApplicationV2(app, controls) {
    const actor = app.document;
    if (!actor || actor.documentName !== "Actor" || !game.user.isGM && !actor.isOwner) {
      return;
    }
    if (controls.some(control => control.action === TRIGGER_PROMPT_UI.CONFIG_ACTION)) {
      return;
    }

    controls.unshift({
      label: "Trigger prompts",
      icon: "fas fa-bolt",
      class: TRIGGER_PROMPT_UI.CONFIG_CLASS,
      action: TRIGGER_PROMPT_UI.CONFIG_ACTION,
      onClick: () => ActorTriggerConfiguration.showActorDialog(actor),
    });
  }

  /**
   * Delegates rendered prompt-card controls to the chat module.
   *
   * @param {ChatMessage} message
   * @param {HTMLElement} html
   */
  static onRenderPromptMessage(message, html) {
    game.TriggerPrompts?.promptChat.bindPromptCard(message, html);
  }

  /**
   * SocketLib entry point: claims a prompt this client authored.
   *
   * @param {string} messageId
   * @param {string} itemId
   * @returns {Promise<object|null>}
   */
  static async claimPromptFromSocket(messageId, itemId) {
    return game.TriggerPrompts?.promptChat.claimPrompt(messageId, itemId) ?? null;
  }

  /** Item allowance operations run on the chosen GM/owner authority. */
  static async itemLimitFromSocket(request) {
    return game.TriggerPrompts?.limits.handle(request) ?? null;
  }

  /**
   * SocketLib entry point: dismisses a prompt this client authored.
   *
   * @param {string} messageId
   * @returns {Promise<boolean>}
   */
  static async dismissPromptFromSocket(messageId) {
    return game.TriggerPrompts?.promptChat.dismissPrompt(messageId) ?? false;
  }

  /**
   * Reports a Player Defense outcome after its resolution on the GM.
   *
   * @param {object} defenseContext
   * @param {"hit"|"miss"} outcome
   * @returns {Promise<void>}
   */
  async handleActiveDefenseOutcome(defenseContext, outcome) {
    await this.events.emit(createAttackEventFromDefense(defenseContext, outcome));
  }

  /**
   * Discards the capture for an attack Player Defense has replaced before
   * creation, so its later roll cannot produce a second result.
   *
   * @param {ChatMessage} [message]
   *   The attack message Player Defense is replacing.
   */
  clearPendingAttackContext(message) {
    const attack = message ? this.attackCapture.consume(message) : null;
    if (attack) {
      if (message.flags?.["dnd4e-health-display"]?.attackResults?.sessionId) {
        TriggerPrompts.#snapshotAutomationAttack(message, attack);
      }
      this.events.emitAll(createAttackTargetedEvents(attack));
    } else {
      this.attackCapture.discard(message);
    }
  }

  /** Snapshot the actual rolled power and each defense chosen in the native attack form. */
  static #snapshotAutomationAttack(message, attack) {
    message.updateSource?.({ "flags.dnd4e-health-display.attackResults.triggerMetadata": {
      attackRange: attack.attackRange, isOpportunity: attack.isOpportunity,
      defenseTypes: Object.fromEntries(attack.targets.map(target => [target.tokenId, target.defenseType])),
    } });
  }

  /**
   * Lists the top-left positions a committed move travelled through.
   *
   * Foundry's `passed.waypoints` excludes the origin and ends at the
   * destination, so the origin is prepended. Repeated positions are dropped.
   *
   * @param {TokenMovementOperation} movement
   * @returns {Array<{x: number, y: number}>}
   *   At least two positions for a move that went anywhere, otherwise fewer.
   */
  static #buildMovementPath(movement) {
    const path = [];
    for (const position of [movement.origin, ...(movement.passed?.waypoints ?? [])]) {
      const previous = path.at(-1);
      if (Number.isFinite(position?.x) && Number.isFinite(position?.y) && (previous?.x !== position.x || previous?.y !== position.y)) {
        path.push({ x: position.x, y: position.y });
      }
    }
    return path;
  }

  /**
   * Extracts a completed, non-death saving throw from DnD4e's chat-roll data.
   *
   * @param {ChatMessage} message
   * @returns {{actorId: string|null, sceneId: string|null, tokenId: string|null, outcome: "success"|"fail"}|null}
   */
  static #captureSavingThrow(message) {
    const rollData = message.flags?.dnd4e?.roll;
    // DnD4e 0.9.3's Actor#rollSave builds an intended roll flag but does not
    // pass it through d20Roll to the ChatMessage. Its localized flavor and
    // d20 target are therefore the authoritative save-result seam.
    const isSavingThrowMessage = rollData?.type === "save" || /^(?:rolling )?saving throw\b/i.test(message.flavor ?? "");
    const isDeathSave = rollData?.isDeathSave === true || /^death saving throw\b/i.test(message.flavor ?? "");
    if (!isSavingThrowMessage || isDeathSave || !message.rolls?.[0]) {
      return null;
    }
    const roll = message.rolls[0];
    const target = roll.dice?.find(die => die.faces === 20)?.options?.target;
    if (!Number.isFinite(target) || !Number.isFinite(roll.total)) {
      return null;
    }
    return {
      actorId: rollData?.actorId ?? message.speaker?.actor ?? null,
      sceneId: message.speaker?.scene ?? null,
      tokenId: message.speaker?.token ?? null,
      outcome: roll.total < target ? "fail" : "success",
    };
  }

  /**
   * Waits for Dice So Nice to complete this exact message's animation. A
   * zero-delay turn lets Dice So Nice's create-message hook mark the message
   * as animating before its completion API checks it.
   *
   * @param {string} messageId
   * @returns {Promise<void>}
   */
  static async #waitForDiceSoNiceAnimation(messageId) {
    const waitForAnimation = game.dice3d?.waitFor3DAnimationByMessageID;
    if (!waitForAnimation) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    await waitForAnimation.call(game.dice3d, messageId);
  }
}
