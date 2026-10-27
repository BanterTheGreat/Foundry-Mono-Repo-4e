import { describeRoll } from './chat-roll-data.js';

/**
 * Message-wide attack identity and damage action around existing target rows.
 * Stored rolls own presentation; the live owned item owns new damage rolls.
 */
export class AttackChatCard {
  static defenseAnimations = new WeakMap();

  /** Keep reveal state local to this client and message, separate from authoritative outcomes. */
  static #defenseAnimation(message) {
    let animation = AttackChatCard.defenseAnimations.get(message);
    if (!animation) {
      animation = { revealed: new Set(), roots: new Set(), hook: null };
      AttackChatCard.defenseAnimations.set(message, animation);
    }
    return animation;
  }

  /** Reveal waiting rows only after every local DSN batch for this message has completed. */
  static #revealAfterAnimation(message, root, ChatRolls) {
    const animation = AttackChatCard.#defenseAnimation(message);
    animation.roots.add(root);
    if (animation.hook !== null) {
      return;
    }
    const cleanup = () => {
      Hooks.off('diceSoNiceRollComplete', animation.hook);
      Hooks.off('deleteChatMessage', animation.deleteHook);
      Hooks.off('canvasTearDown', animation.sceneHook);
      animation.hook = null;
      animation.roots.clear();
    };
    animation.deleteHook = Hooks.on('deleteChatMessage', deleted => {
      if (deleted.id === message.id) {
        cleanup();
      }
    });
    animation.sceneHook = Hooks.on('canvasTearDown', cleanup);
    animation.hook = Hooks.on('diceSoNiceRollComplete', id => {
      if (id !== message.id || message._dice3danimating) {
        return;
      }
      const roots = [...animation.roots];
      cleanup();
      for (const renderedRoot of roots) {
        if (renderedRoot.isConnected === false || message.isContentVisible === false) {
          continue;
        }
        const content = renderedRoot.querySelector('.message-content');
        if (content) {
          // Preserve the native attack calculations when rebuilding only the local presentation.
          const nativeBodies = [...content.querySelectorAll('.dice-roll')]
            .filter(body => !body.closest('.banter-roll--defense'));
          content.replaceChildren(...nativeBodies);
          AttackChatCard.renderWithDefenses(message, renderedRoot, ChatRolls);
        }
      }
    });
  }

  /**
   * Resolve the original speaker's item, never the currently selected token.
   * Native item IDs also support messages created before source UUID capture.
   */
  static async findItem(message) {
    const defense = message.flags?.playerDefense;
    if (defense) {
      const token = game.scenes?.get(defense.sceneId)?.tokens.get(defense.attackerTokenId);
      const actor = token?.actor ?? game.actors?.get(defense.attackerId);
      return actor?.items.get(defense.itemId) ?? actor?.items.find(item => item.name === defense.itemName);
    }
    const source = message.rolls[0]?.options?.banterAttackSource;
    if (source?.itemUuid) {
      return globalThis.fromUuid(source.itemUuid);
    }
    const actor = source?.actorUuid ? await globalThis.fromUuid(source.actorUuid)
      : globalThis.ChatMessage.getSpeakerActor(message.speaker);
    const itemId = message.flags?.dnd4e?.roll?.itemId;
    return actor?.items?.get(itemId);
  }

  /**
   * Invoke the pinned system's normal damage dialog once for the whole message.
   * Keep the button unchanged and check current ownership on every click.
   */
  static async rollDamage(message, event) {
    try {
      const item = await AttackChatCard.findItem(message);
      if (!item || typeof item.rollDamage !== 'function') {
        ui.notifications.warn('The original attack power is no longer available.');
        return;
      }
      if (!game.user.isGM && !item.actor?.isOwner) {
        ui.notifications.warn('You do not own the attacking actor.');
        return;
      }
      await item.rollDamage({ event });
    } catch (error) {
      console.error('banter-4e-modifications | Unable to roll attack damage', error);
      ui.notifications.error('Unable to roll damage for this attack.');
    }
  }

  /**
   * Summarize only stored targets and defense keys, never live target values.
   */
  static describe(message) {
    const rolls = message.rolls;
    const targets = new Set();
    const defenses = new Set();
    for (const roll of rolls) {
      const target = roll.options?.multirollData;
      if (target?.targetID || target?.target) {
        targets.add(target.targetID || target.target);
      }
      if (target?.def) {
        defenses.add(String(target.def).toUpperCase());
      }
    }
    const defense = message.flags?.playerDefense;
    const targetIds = message.flags?.['dnd4e-health-display']?.attackResults?.targetIds;
    for (const target of defense?.targets ?? []) {
      if (targetIds && !targetIds.includes(target.tokenId)) {
        continue;
      }
      targets.add(target.tokenId ?? target.id);
      defenses.add(target.defenseStat);
    }
    return { speaker: message.speaker?.alias || 'Someone',
      power: defense?.attackName || rolls[0]?.options?.banterAttackSource?.itemName || 'Attack',
      targets: targets.size, defense: [...defenses].join(' / ') };
  }

  /**
   * Build native attack and player-defense rows using the same compact roll model.
   * Persisted defense flags supply display rolls only; no dice are evaluated here.
   */
  static targetRows(message) {
    const defense = message.flags.playerDefense;
    const context = message.flags?.['dnd4e-health-display']?.attackResults;
    const rows = (message.rolls ?? []).filter(roll => !roll.options?.banterDefenseTarget
      && (!context || context.targetIds.includes(roll.options?.multirollData?.targetID)))
      .map(roll => ({ roll, model: describeRoll(message, roll) }));
    const animation = AttackChatCard.#defenseAnimation(message);
    for (const storedTarget of defense.targets) {
      let target = storedTarget;
      const hasAnimationDice = message.rolls.some(roll => roll.options?.banterDefenseTarget === target.tokenId);
      if (target.resolved && (!message._dice3danimating || !hasAnimationDice)) {
        animation.revealed.add(target.tokenId);
      }
      if (target.resolved && message._dice3danimating && hasAnimationDice && !animation.revealed.has(target.tokenId)) {
        target = { ...target, resolved: false, total: null, natural: null, rollHtml: '', postDefenseModifier: undefined };
      }
      if (context && !context.targetIds.includes(target.tokenId)) {
        continue;
      }
      const outcome = !target.resolved ? 'pending' : target.outcome === 'normal' ? 'hit' : target.outcome;
      const roll = { total: target.total ?? 0,
        dice: target.resolved ? [{ faces: 20, results: [{ result: target.natural, active: true }] }] : [],
        options: { playerDefense: true, multirollData: { targetID: target.tokenId, target: target.actorName,
          def: target.defenseStat, hitstate: outcome }, banterAttackSource: { itemName: defense.attackName } } };
      const model = describeRoll(message, roll);
      model.attackVerdict = { pending: 'Waiting', hit: 'Hit', miss: 'Evaded', critical: 'Crit' }[outcome];
      // Outcome colors describe success for whoever rolled the row's dice.
      model.attackOutcome = { pending: null, hit: 'miss', miss: 'hit', critical: 'critical' }[outcome];
      model.unconfirmed = Boolean(context?.pending) && target.resolved;
      model.manualEdit = Number.isFinite(target.postDefenseModifier)
        ? `Defense modifier (${target.postDefenseModifier >= 0 ? '+' : ''}${target.postDefenseModifier})` : null;
      rows.push({ roll, model, target });
    }
    if (context) {
      rows.sort((a, b) => context.targetIds.indexOf(a.roll.options.multirollData.targetID)
        - context.targetIds.indexOf(b.roll.options.multirollData.targetID));
    }
    return rows;
  }

  /**
   * Render one shared attack card, switching only each target's roll row.
   * The normal row renderer owns disclosures, target hover, colors and spacing.
   */
  static renderWithDefenses(message, root, ChatRolls) {
    const content = root.querySelector('.message-content');
    if (!content || content.querySelector('.banter-attack-card')) {
      return;
    }
    const nativeBodies = [...content.querySelectorAll('.dice-roll')].filter(body => !body.closest('.banter-defense'));
    const rows = AttackChatCard.targetRows(message);
    const view = { id: message.id, speaker: message.speaker,
      flags: { ...message.flags, playerDefense: { ...message.flags.playerDefense, targets: rows.filter(row => row.target).map(row => row.target) } },
      isContentVisible: message.isContentVisible, rolls: rows.map(row => row.roll) };
    if (message._dice3danimating) {
      AttackChatCard.#revealAfterAnimation(message, root, ChatRolls);
    }
    content.replaceChildren();
    for (const [index, row] of rows.entries()) {
      const body = row.target ? ChatRolls.element('div', 'dice-roll')
        : nativeBodies[message.rolls.indexOf(row.roll)] ?? ChatRolls.element('div', 'dice-roll');
      if (row.target) {
        body.innerHTML = row.target.rollHtml ?? '';
      } else if (!nativeBodies[message.rolls.indexOf(row.roll)]) {
        body.textContent = `${row.roll.formula ?? 'Attack roll'} = ${row.roll.total}`;
      }
      content.append(body);
      ChatRolls.renderResult(view, body, row.model, index);
      const cards = content.querySelectorAll('.banter-roll--attack');
      const card = cards[cards.length - 1];
      if (row.target) {
        card.classList.add('banter-roll--defense');
        card.querySelector('.banter-roll__score small').textContent = row.target.resolved ? `Defense ${row.target.total}` : 'Awaiting roll';
        const calculation = card.querySelector('.banter-roll__calculation');
        calculation.prepend(ChatRolls.element('div', 'banter-roll__modifier', `${row.target.defenseStat} defense against DC ${row.target.rollDC}`));
        if (!row.target.resolved) {
          calculation.querySelector('.banter-roll__equation')?.remove();
        }
        const text = row.target.resolved ? row.target.outcome === 'miss' ? row.target.missText : row.target.hitText : '';
        if (text) {
          const effect = ChatRolls.element('div', 'banter-roll__modifier');
          effect.innerHTML = text;
          calculation.append(effect);
        }
      }
    }
    AttackChatCard.render(view, root, ChatRolls.element);
    const calculation = content.querySelector('.banter-roll__calculation');
    if (calculation) {
      const flavors = [...root.querySelectorAll('.flavor-text')].filter(flavor => !flavor.closest('.banter-roll'));
      calculation.prepend(...flavors);
    }
  }

  /**
   * Keep target disclosures intact; insert a single header and footer per message.
   */
  static render(message, root, element) {
    const cards = [...root.querySelectorAll('.banter-roll--attack')];
    if (!cards.length || root.querySelector('.banter-attack-card')) {
      return;
    }
    const model = AttackChatCard.describe(message);
    const group = element('section', 'banter-attack-card');
    const header = element('header', 'banter-attack-card__header');
    const identity = element('div', 'banter-attack-card__identity');
    identity.append(element('span', 'banter-attack-card__kind', '⌖  ATTACK'),
      element('div', 'banter-attack-card__power', model.power));
    const button = element('button', 'banter-attack-card__damage', 'Roll Damage');
    button.type = 'button';
    if (message.flags?.playerDefense) {
      const context = message.flags?.['dnd4e-health-display']?.attackResults;
      button.disabled = Boolean(context?.pending) || message.flags.playerDefense.targets.some(target => !target.resolved);
    }
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void AttackChatCard.rollDamage(message, event);
    });
    header.append(identity);
    const footer = element('footer', 'banter-attack-card__footer');
    footer.append(element('span', '', `${model.targets} ${model.targets === 1 ? 'target' : 'targets'}${model.defense ? ` · vs. ${model.defense}` : ''}`), button);
    cards[0].before(group);
    group.append(header, ...cards, footer);
    cards.forEach(card => {
      // The shared header now supplies the power. Expanded native
      // flavor and calculations retain all weapon and other source details.
      card.querySelector('.banter-roll__source')?.remove();
      const index = cards.indexOf(card);
      const target = message.rolls[index]?.options?.multirollData?.target;
      card.querySelector('.banter-roll__sentence').textContent = message.rolls[index]?.options?.playerDefense
        ? `${target} defends` : target ? `vs. ${target}` : 'Attack';
    });
  }
}
