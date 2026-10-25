/** Fiction-first cards around native DnD4e 0.9.3 rules and actions. */
export class PowerChatCards {
  /**
   * Read historical speaker/usage without requiring a live owned item.
   */
  static describe(message, card) {
    const usage = message.flags?.dnd4e?.itemData?.system?.useType
      ?? ['atwill', 'encounter', 'daily'].find(value => card.classList.contains(`use-${value}`));
    return {
      speaker: message.speaker?.alias || globalThis.game?.actors?.get(card.dataset.actorId)?.name || 'Someone',
      usage: ['atwill', 'encounter', 'daily'].includes(usage) ? usage : 'other',
    };
  }

  /**
   * Create plain labels without injecting authored text as markup.
   */
  static element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /**
   * Repeated native/popout hooks leave transformed nodes and listeners intact.
   */
  static render(message, root) {
    let handled = false;
    for (const card of root.querySelectorAll('.dnd4e.chat-card.power-card')) {
      if (card.classList.contains('banter-power')) {
        handled = true;
        continue;
      }
      const header = card.querySelector('.card-header');
      const heading = header?.querySelector('h3');
      const content = card.querySelector('.card-content');
      if (!heading || !content) {
        continue;
      }
      PowerChatCards.format(message, card, header, heading, content);
      handled = true;
    }
    return handled;
  }

  /**
   * Fiction always precedes visible mechanics. Native effects and buttons stay put.
   */
  static format(message, card, header, heading, content) {
    const model = PowerChatCards.describe(message, card);
    card.classList.add('banter-power', `banter-power--${model.usage}`);
    card.classList.remove('collapsed');
    const newHeader = PowerChatCards.element('header', 'banter-power__header');
    const title = PowerChatCards.element('h3', 'banter-power__heading');
    title.append(...heading.childNodes);
    newHeader.append(title);
    const basics = content.querySelector('.item-details > .basics');
    const nativeUsage = basics?.querySelector('.usage');
    const usage = nativeUsage?.textContent.trim()
      || { atwill: 'At-Will', encounter: 'Encounter', daily: 'Daily' }[model.usage];
    if (usage) {
      newHeader.append(PowerChatCards.element('div', 'banter-power__usage', usage));
    }
    if (nativeUsage) {
      const separator = nativeUsage.nextElementSibling;
      if (separator?.classList.contains('sep')) {
        separator.remove();
      }
      nativeUsage.remove();
    }
    header.replaceWith(newHeader);
    // Native .flavour is distinct from compendium .flavor paragraphs, which
    // can contain mechanics. Never guess a fiction split in custom prose.
    const flavor = [...content.children].find(child => child.classList.contains('flavour'));
    if (flavor) {
      flavor.classList.add('banter-power__flavor');
      content.before(flavor);
    }
    content.classList.add('banter-power__rules');
    if (basics) {
      basics.classList.add('banter-power__basics');
      content.prepend(basics);
    }
    const details = content.querySelector('.item-details');
    if (details) {
      PowerChatCards.formatRules(details);
    }
    const footer = card.querySelector('.card-footer');
    const buttons = footer?.querySelector(':scope > .card-buttons');
    if (buttons) {
      footer.append(buttons);
    }
  }

  /**
   * Recognize labeled native paragraphs only, not labels buried in authored prose.
   */
  static ruleKind(block) {
    if (block?.tagName !== 'P' || block.firstElementChild?.tagName !== 'STRONG') {
      return null;
    }
    for (const node of block.childNodes) {
      if (node === block.firstElementChild) {
        break;
      }
      if (node.textContent.trim()) {
        return null;
      }
    }
    return ['requirement', 'trigger', 'target', 'effect', 'special', 'attack', 'hit', 'miss', 'sustain']
      .find(kind => block.classList.contains(kind)) || null;
  }

  /**
   * Move enriched contents rather than cloning links or flattening inline rolls.
   */
  static moveRuleValue(block, keepLabel) {
    if (!keepLabel) {
      block.firstElementChild.remove();
      const leading = block.firstChild;
      if (leading?.nodeType === 3) {
        leading.textContent = leading.textContent.replace(/^\s*:\s*/, '').trimStart();
      }
    }
    const value = PowerChatCards.element('div', 'banter-power__value');
    value.append(...block.childNodes);
    return value;
  }

  /**
   * Bundle only adjacent native Target/Attack and Hit/Miss paragraphs.
   * Preserve intervening nodes and all nested authored text in its source order.
   */
  static formatRules(details) {
    for (const block of [...details.children]) {
      if (block.parentElement !== details) {
        continue;
      }
      const kind = PowerChatCards.ruleKind(block);
      if (!kind) {
        continue;
      }
      const next = block.nextElementSibling;
      const nextKind = PowerChatCards.ruleKind(next);
      let adjacent = true;
      for (let node = block.nextSibling; node && node !== next; node = node.nextSibling) {
        if (node.textContent.trim()) {
          adjacent = false;
        }
      }
      const attackPair = adjacent && kind === 'target' && nextKind === 'attack';
      const outcomePair = adjacent && kind === 'hit' && nextKind === 'miss';
      const row = PowerChatCards.element('div', 'banter-power__rule');
      const label = PowerChatCards.element('div', 'banter-power__label',
        attackPair ? 'Attack' : outcomePair ? 'Outcome'
          : block.firstElementChild.textContent.trim().replace(/:\s*$/, ''));
      const value = PowerChatCards.moveRuleValue(block, outcomePair);
      block.before(row);
      row.append(label, value);
      if (attackPair) {
        value.append(document.createTextNode('; '));
        const attackValue = PowerChatCards.moveRuleValue(next, false);
        value.append(...attackValue.childNodes);
        next.remove();
      } else if (outcomePair) {
        value.append(PowerChatCards.moveRuleValue(next, true));
        next.remove();
      }
      block.remove();
    }
  }
}
