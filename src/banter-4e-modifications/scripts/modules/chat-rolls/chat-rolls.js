import { describeRoll } from './chat-roll-data.js';
import { DamageSourceCapture } from './damage-source-capture.js';
import { ChatRollActions } from './chat-roll-actions.js';

const MODULE = 'banter-4e-modifications';
export const CHAT_ROLL_SETTING = 'enable-compact-chat-rolls';

/** Compact local disclosures around the system's original evaluated roll markup. */
export class ChatRolls {
  static expanded = new Map();

  /** Each browser chooses its own chat presentation. */
  static registerSettings() {
    game.settings.register(MODULE, CHAT_ROLL_SETTING, {
      name: 'Enable compact chat rolls',
      hint: 'Collapsible skill, attack, and damage messages. Apply Damage uses controlled tokens.',
      scope: 'client', config: true, type: Boolean, default: true, requiresReload: true,
    });
  }

  /** Capture durable source data even when the rolling client uses native cards. */
  static install() {
    return DamageSourceCapture.install();
  }

  /** Create text nodes for all names and formulas, including effect-authored text. */
  static element(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  /** Idempotent for both Foundry HTML and legacy jQuery render hooks. */
  static render(message, html) {
    if (message.isContentVisible === false || game.system?.id !== 'dnd4e'
      || !game.settings.get(MODULE, CHAT_ROLL_SETTING)) {
      return;
    }
    const root = html?.[0] ?? html;
    if (!root?.querySelectorAll || root.querySelector('.banter-roll')) {
      return;
    }
    const bodies = [...root.querySelectorAll('.dice-roll')];
    // Unsupported/mixed messages keep their complete native presentation.
    if (bodies.length !== message.rolls?.length) {
      return;
    }
    const models = message.rolls.map((roll, index) => describeRoll(message, roll, index));
    if (models.some(model => !model)) {
      return;
    }
    bodies.forEach((body, index) => ChatRolls.renderResult(message, body, models[index], index));
  }

  /** Retain native calculations, target links, context menus, and damage listeners. */
  static renderResult(message, body, model, index) {
    const key = `${message.id}:${index}`;
    const card = ChatRolls.element('section', `banter-roll banter-roll--${model.kind}`);
    const details = ChatRolls.element('details', 'banter-roll__disclosure');
    details.open = ChatRolls.expanded.get(key) === true;
    details.addEventListener('toggle', () => {
      ChatRolls.expanded.set(key, details.open);
      if (ChatRolls.expanded.size > 1000) {
        ChatRolls.expanded.delete(ChatRolls.expanded.keys().next().value);
      }
    });
    const summary = ChatRolls.element('summary', 'banter-roll__summary');
    const main = ChatRolls.element('div', 'banter-roll__main');
    const sentence = ChatRolls.element('div', 'banter-roll__sentence', model.label);
    main.append(sentence);
    if (model.kind === 'attack') {
      ChatRolls.bindTargetHighlight(sentence, message, message.rolls[index]);
    }
    // Flavor is system-rendered HTML; read its text, never inject it as markup.
    const flavor = body.querySelector('.dice-flavor')?.textContent?.trim();
    const hostFlavor = body.closest('.message')?.querySelector('.message-content > .flavor-text')?.textContent?.trim();
    const source = model.source || flavor || hostFlavor;
    if (model.kind !== 'skill' && source) {
      main.append(ChatRolls.element('div', 'banter-roll__source', source));
    }
    const score = ChatRolls.element('span', 'banter-roll__score');
    score.append(ChatRolls.element('strong', '', String(model.total)),
      ChatRolls.element('small', '', model.kind === 'damage' ? 'DAMAGE' : 'TOTAL'));
    if (model.kind !== 'damage' && model.natural.length) {
      ChatRolls.attachNaturalPopup(score, model);
    }
    const chips = ChatRolls.element('div', 'banter-roll__chips');
    for (const badge of model.exceptional) {
      const chip = ChatRolls.element('span', `banter-roll__chip ${badge.decisivePenalty ? 'is-negative' : 'is-positive'}`,
        `${badge.value >= 0 ? '+' : ''}${badge.value} ${badge.name}`);
      chip.setAttribute('aria-label', `${chip.textContent}. ${badge.decisivePenalty ? 'Changed a hit into a miss' : 'Changed a miss into a hit'}.`);
      chips.append(chip);
    }
    for (const contributor of model.contributors) {
      const formula = contributor.displayFormula;
      chips.append(ChatRolls.element('span', 'banter-roll__chip',
        `${contributor.name} · ${/^[+-]/.test(formula) ? '' : '+'}${formula} ${contributor.damageType || ''}`));
    }
    summary.append(main, score, ChatRolls.element('span', 'banter-roll__chevron', '›'), chips);
    const calculation = ChatRolls.element('div', 'banter-roll__calculation');
    body.querySelectorAll('.banter-attack-buffs').forEach(row => row.remove());
    body.before(card);
    const equation = ChatRolls.element('div', 'banter-roll__equation');
    if (model.natural.length) {
      equation.append(ChatRolls.element('span', 'banter-roll__natural', `D20 ${model.natural.join(', ')}`));
      if (model.natural.length === 1) {
        const modifier = message.rolls[index].total - model.natural[0];
        equation.append(ChatRolls.element('span', '', `${modifier < 0 ? '−' : '+'} ${Math.abs(modifier)} =`));
      }
    } else {
      equation.append(ChatRolls.element('span', '', 'Rolled damage'));
    }
    equation.append(ChatRolls.element('strong', '', String(model.total)));
    calculation.append(equation);
    for (const badge of model.badges) {
      calculation.append(ChatRolls.element('div', 'banter-roll__modifier', `${badge.name}: ${badge.value >= 0 ? '+' : ''}${badge.value}`));
    }
    for (const contributor of model.contributors) {
      calculation.append(ChatRolls.element('div', 'banter-roll__modifier',
        `${contributor.name}: ${contributor.displayFormula}${contributor.diceResults.length ? ` [${contributor.diceResults.join(', ')}]` : ''}${Number.isFinite(contributor.rolledContribution) ? ` = ${contributor.rolledContribution}` : ''} ${contributor.damageType || ''}`));
    }
    if (model.scale !== 1) {
      calculation.append(ChatRolls.element('div', 'banter-roll__modifier',
        `Raw roll ${message.rolls[index].total} ÷ ${model.scale} = ${model.total}. ${model.reasons.join(', ')}`));
    }
    const original = ChatRolls.element('details', 'banter-roll__original');
    original.append(ChatRolls.element('summary', '', 'Full dice calculation'), body);
    calculation.append(original);
    details.append(summary, calculation);
    card.append(details);
    const buttons = card.nextElementSibling;
    if (buttons?.classList.contains('chatDamageButtons')) {
      if (model.kind === 'attack') {
        buttons.hidden = true;
      } else if (model.kind === 'damage') {
        const apply = buttons.querySelector('[data-action="Damage"]');
        if (apply) {
          // Move the real button; the system delegates clicks from the message.
          // Plain text keeps event.target compatible with its pinned handler.
          apply.textContent = 'Apply Damage';
          apply.classList.add('banter-roll__apply');
          apply.setAttribute('aria-label', 'Apply Damage to controlled tokens');
          apply.removeAttribute('data-tooltip');
          ChatRollActions.bind(apply, message);
          calculation.append(buttons);
          card.append(apply);
        }
      }
    }
  }

  /** Highlight only the stored target on its original scene, without selecting it. */
  static bindTargetHighlight(sentence, message, roll) {
    const targetId = roll.options?.multirollData?.targetID;
    if (!targetId) {
      return;
    }
    let highlighted;
    const clear = event => {
      highlighted?._onHoverOut(event);
      highlighted = null;
    };
    sentence.addEventListener('pointerenter', event => {
      const canvas = globalThis.canvas;
      if (!canvas?.ready || (message.speaker?.scene && message.speaker.scene !== canvas.scene?.id)) {
        return;
      }
      const token = canvas.tokens.get(targetId);
      if (token?.isVisible && !token.controlled) {
        token._onHoverIn(event, { hoverOutOthers: true });
        highlighted = token;
      }
    });
    sentence.addEventListener('pointerleave', clear);
    sentence.addEventListener('pointercancel', clear);
  }

  /** Accessible, local natural-die popup; no tooltip affordance on buff labels. */
  static attachNaturalPopup(score, model) {
    score.tabIndex = 0;
    score.setAttribute('role', 'button');
    score.setAttribute('aria-label', `${model.total} total. Show natural d20.`);
    const popup = ChatRolls.element('span', 'banter-roll__popup', `D20 ${model.natural.join(', ')} · Total ${model.total}`);
    popup.setAttribute('role', 'tooltip');
    popup.hidden = true;
    score.append(popup);
    let pinned = false;
    const show = () => {
      popup.hidden = false;
      const bounds = score.getBoundingClientRect();
      popup.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 220))}px`;
      popup.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 70))}px`;
    };
    const hide = () => { popup.hidden = true; };
    score.addEventListener('pointerenter', show);
    score.addEventListener('pointerleave', () => {
      if (!pinned && document.activeElement !== score) {
        hide();
      }
    });
    score.addEventListener('focus', show);
    score.addEventListener('blur', () => { pinned = false; hide(); });
    score.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      pinned = !pinned;
      if (pinned) {
        show();
      } else {
        hide();
      }
    });
    score.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        pinned = false;
        hide();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        pinned = true;
        show();
      }
    });
  }
}
