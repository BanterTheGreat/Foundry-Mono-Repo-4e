/**
 * Message-wide attack identity and damage action around existing target rows.
 * Stored rolls own presentation; the live owned item owns new damage rolls.
 */
export class AttackChatCard {
  /**
   * Resolve the original speaker's item, never the currently selected token.
   * Native item IDs also support messages created before source UUID capture.
   */
  static async findItem(message) {
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
    return { speaker: message.speaker?.alias || 'Someone',
      power: rolls[0]?.options?.banterAttackSource?.itemName || 'Attack',
      targets: targets.size, defense: [...defenses].join(' / ') };
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
    identity.append(element('div', 'banter-attack-card__power', model.power));
    const button = element('button', 'banter-attack-card__damage', 'Roll Damage');
    button.type = 'button';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void AttackChatCard.rollDamage(message, event);
    });
    header.append(identity, button);
    const footer = element('footer', 'banter-attack-card__footer');
    footer.append(element('span', '', `${model.targets} ${model.targets === 1 ? 'target' : 'targets'}`),
      element('span', '', model.defense ? `vs. ${model.defense}` : ''));
    cards[0].before(group);
    group.append(header, ...cards, footer);
    cards.forEach(card => {
      // The shared header now supplies the power. Expanded native
      // flavor and calculations retain all weapon and other source details.
      card.querySelector('.banter-roll__source')?.remove();
      const index = cards.indexOf(card);
      const target = message.rolls[index]?.options?.multirollData?.target;
      card.querySelector('.banter-roll__sentence').textContent = target ? `vs. ${target}` : 'Attack';
    });
  }
}
