import { describeRoll } from './chat-roll-data.js';
import { ChatRollActions, typedDamage } from './chat-roll-actions.js';

const MODULE = 'dnd4e-health-display';
const applying = new Set();

/** Render persisted outcome groups using the ordinary damage card and critical styling. */
export async function renderTargetDamage(message, root, ChatRolls) {
  const data = message.flags?.[MODULE]?.damageChat;
  const content = root.querySelector('.message-content');
  if (!content || content.querySelector('.banter-target-damage')) {
    return;
  }
  const container = ChatRolls.element('section', 'banter-target-damage');
  content.replaceChildren(container);
  const header = ChatRolls.element('header', 'banter-attack-card__header');
  const identity = ChatRolls.element('div', 'banter-attack-card__identity');
  identity.append(ChatRolls.element('span', 'banter-attack-card__kind', '✦  DAMAGE'),
    ChatRolls.element('strong', 'banter-attack-card__power', data.name));
  header.append(identity);
  container.append(header);
  for (const [index, layer] of data.layers.entries()) {
    const source = game.messages.get(layer.messageId);
    const roll = source?.rolls?.[0];
    const model = roll && describeRoll(source, roll);
    if (!model || source.isContentVisible === false) {
      continue;
    }
    const host = ChatRolls.element('div', '');
    host.innerHTML = await roll.render();
    // Native Roll.render includes its own action tray. This card owns the
    // outcome-specific action, so never pass that tray to the ordinary renderer.
    host.querySelectorAll('.chatDamageButtons').forEach(buttons => buttons.remove());
    const body = host.querySelector('.dice-roll');
    if (!body) {
      continue;
    }
    container.append(host);
    model.total = layer.targets[0].total - (layer.targets[0].modifierTotal ?? 0);
    model.damageOutcome = layer.outcome === 'critical' ? 'crit' : layer.outcome === 'miss' ? 'miss' : null;
    model.damageSubject = `${layer.outcome === 'critical' ? 'CRIT' : layer.outcome.toUpperCase()} · ${layer.targets.length} targets`;
    model.unconfirmed = data.pending;
    ChatRolls.renderResult({ ...source, id: message.id, rolls: source.rolls }, body, model, index);
    const card = host.querySelector('.banter-roll');
    card.classList.remove('banter-roll--damage');
    card.classList.add('banter-roll--attack', `banter-roll--${layer.outcome}`, 'banter-target-damage__layer');
    const score = card.querySelector('.banter-roll__score');
    score.querySelector('strong').textContent = { critical: 'Crit', hit: 'Hit', miss: 'Miss' }[layer.outcome];
    score.querySelector('small').textContent = `${layer.targets.length} target${layer.targets.length === 1 ? '' : 's'}`;
    const sentence = card.querySelector('.banter-roll__sentence');
    sentence.replaceChildren(ChatRolls.element('strong', 'banter-target-damage__amount', String(model.total)),
      ChatRolls.element('span', 'banter-target-damage__unit', ' DAMAGE'));
    card.querySelector('.banter-roll__main > .banter-roll__source')?.remove();
    const summary = card.querySelector('summary');
    const tokens = () => canvas.ready && canvas.scene?.id === data.sceneId
      ? layer.targets.map(target => canvas.tokens.get(target.tokenId)).filter(token => token?.isVisible) : [];
    let highlighted = [];
    const clear = event => {
      highlighted.forEach(token => token._onHoverOut(event));
      highlighted = [];
    };
    summary.addEventListener('pointerenter', event => {
      highlighted = tokens().filter(token => !token.controlled);
      highlighted.forEach(token => token._onHoverIn(event, { hoverOutOthers: false }));
    });
    summary.addEventListener('pointerleave', clear);
    summary.addEventListener('pointercancel', clear);
    summary.addEventListener('click', event => {
      if (event.target.closest('.banter-roll__apply')) {
        return;
      }
      if (event.target.closest('.banter-roll__chevron')) {
        return;
      }
      event.preventDefault();
      if (canvas.scene?.id === data.sceneId) {
        game.user.updateTokenTargets(tokens().map(token => token.id));
      }
    });
    const calculation = card.querySelector('.banter-roll__calculation');
    for (const target of layer.targets) {
      const token = tokens().find(entry => entry.id === target.tokenId);
      calculation.append(ChatRolls.element('div', 'banter-roll__modifier', `${token?.name ?? 'Unavailable target'}: ${target.total}${target.modifierFormula ? ` (${target.modifierFormula})` : ''}`));
    }
    const applied = Boolean(message.flags?.['banter-4e-modifications']?.appliedTargetDamage?.[layer.outcome]
      || game.user.flags?.['banter-4e-modifications']?.appliedTargetDamage?.[message.id]?.[layer.outcome]);
    const button = ChatRolls.element('button', 'banter-roll__apply', applied ? 'Applied' : 'Apply');
    button.title = game.user.isGM
      ? `Apply ${layer.outcome} damage to selected tokens, or this group's targets when none are selected. Can be applied again.`
      : `Apply ${layer.outcome} damage to your assigned character. Can be applied again.`;
    button.setAttribute('aria-label', button.title);
    button.type = 'button';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled || applying.has(`${message.id}:${layer.outcome}`) || message.isContentVisible === false) {
        return;
      }
      const selected = canvas.tokens.controlled ?? [];
      const character = game.user.character;
      if (!game.user.isGM && !character?.isOwner) {
        ui.notifications.warn('You must have an assigned character that you own to apply damage.');
        return;
      }
      const affected = game.user.isGM ? (selected.length ? selected : tokens())
        : [{ actor: character, id: character.token?.id }];
      if ((game.user.isGM && !selected.length && affected.length !== layer.targets.length)
        || affected.some(token => !token.actor || (!token.actor.isOwner && !game.user.isGM))) {
        ui.notifications.warn('Every affected token must be available on this scene and owned by you to apply damage.');
        return;
      }
      applying.add(`${message.id}:${layer.outcome}`);
      button.disabled = true;
      try {
        const divisor = Number(roll.options.divisors?.[roll.options.hitType]?.value) || 1;
        for (const token of affected) {
          const target = canvas.scene?.id === data.sceneId
            ? layer.targets.find(entry => entry.tokenId === token.id
              || (!game.user.isGM && canvas.tokens.get(entry.tokenId)?.actor?.id === character.id)) : undefined;
          const parts = typedDamage(roll).map(([value, type]) => [value / divisor / (layer.half ? 2 : 1), type]);
          const rawTotal = parts.reduce((total, [value]) => total + value, 0);
          const adjustment = (target?.total ?? model.total) - rawTotal;
          if (parts.length) {
            parts[0][0] += adjustment;
          } else {
            parts.push([target?.total ?? model.total, 'physical']);
          }
          await ChatRollActions.applyActorDamage(token.actor, parts, 1);
        }
        button.textContent = 'Applied';
        button.title = `Applied ${layer.outcome} damage to ${affected.length} token${affected.length === 1 ? '' : 's'}`;
        button.setAttribute('aria-label', button.title);
        if (game.user.isGM) {
          await message.update({ [`flags.banter-4e-modifications.appliedTargetDamage.${layer.outcome}`]: true });
        } else {
          await game.user.setFlag('banter-4e-modifications', `appliedTargetDamage.${message.id}.${layer.outcome}`, true);
        }
      } catch (error) {
        console.error('Target damage application failed', error);
        ui.notifications.error('Damage application failed. Check target HP before applying again.');
      } finally {
        applying.delete(`${message.id}:${layer.outcome}`);
        button.disabled = false;
      }
    });
    summary.insertBefore(button, summary.querySelector('.banter-roll__chevron'));
  }
}
