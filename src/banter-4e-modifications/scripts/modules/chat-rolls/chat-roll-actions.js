/** Pinned 0.9.3 typed-term allocation, including its untyped remainder split. */
export function typedDamage(roll) {
  const damage = [];
  let remaining = roll.total;
  for (const term of roll.terms) {
    if (typeof term.total === 'number' && term.flavor) {
      damage.push([term.total, term.flavor]);
      remaining -= term.total;
    }
  }
  if (remaining) {
    if (!damage.length) {
      damage.push([remaining, 'physical']);
    } else {
      damage.forEach((part, index) => {
        part[0] += 0 | remaining / damage.length + (index < remaining % damage.length);
      });
    }
  }
  return damage;
}

/**
 * Await the same actor API as the native action, so repeated clicks on this
 * client cannot overlap. No shared applied/undo claim is made: native damage
 * may intentionally be applied repeatedly or to different controlled actors.
 */
export class ChatRollActions {
  static pending = new Set();

  /**
   * 0.9.3 calcDamage starts applyDamage without awaiting it. Capture that one
   * call on a per-request receiver so the UI lock lasts through the HP update,
   * without replacing methods on a shared Actor or claiming an undo receipt.
   */
  static async applyActorDamage(actor, damage, multiplier) {
    const writes = [];
    const receiver = new Proxy(actor, { get(target, key) {
      if (key === 'applyDamage') {
        return (...args) => {
          const write = Promise.resolve(actor.applyDamage(...args));
          writes.push(write);
          return write;
        };
      }
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await actor.calcDamage.call(receiver, damage, multiplier);
    const results = await Promise.allSettled(writes);
    if (results.some(result => result.status === 'rejected')) {
      throw new Error('Actor HP update failed');
    }
  }

  /** Preserve controlled-token targeting; calcDamage owns mitigation and HP. */
  static async apply(message) {
    if (message.isContentVisible === false || ChatRollActions.pending.has(message.id)) {
      return false;
    }
    const roll = message.rolls?.[0];
    if (!roll?.options?.hitTypeDamage || roll.options.hitTypeHealing || game.system.version !== '0.9.3') {
      return false;
    }
    const actors = [...new Set((canvas.tokens.controlled ?? []).map(token => token.actor).filter(Boolean))];
    if (!actors.length) {
      ui.notifications.error(game.i18n.localize('DND4E.NeedTokenSelected'));
      return false;
    }
    if (actors.some(actor => !actor.isOwner && !game.user.isGM)) {
      ui.notifications.warn('You must own every controlled actor to apply damage.');
      return false;
    }
    const divisor = Number(roll.options.divisors?.[roll.options.hitType]?.value ?? 1);
    if (!(divisor > 0)) {
      return false;
    }
    ChatRollActions.pending.add(message.id);
    try {
      const results = await Promise.allSettled(actors.map(actor => ChatRollActions.applyActorDamage(actor, typedDamage(roll), 1 / divisor)));
      const failed = results.filter(result => result.status === 'rejected');
      if (failed.length) {
        console.error('banter-4e-modifications | Damage application failed', failed);
        ui.notifications.error('Some damage applications failed. Check actor HP before applying again.');
        return false;
      }
      return true;
    } finally {
      ChatRollActions.pending.delete(message.id);
    }
  }

  /** Use the awaited adapter only on the pinned version; keep other native actions. */
  static bind(button, message) {
    if (game.system.version !== '0.9.3') {
      return;
    }
    // Remove native delegated selector to avoid applying twice.
    button.classList.remove('chat-damage-button');
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await ChatRollActions.apply(message);
      } finally {
        button.disabled = false;
      }
    });
  }
}
