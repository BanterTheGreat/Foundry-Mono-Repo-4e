import { AttackBuffs } from '../attack-buffs/attack-buffs.js';
import { findBonusLoss } from '../attack-buffs/attack-buff-math.js';

const CONTEXT = Symbol('banterDamageContext');
const WRAPPED = Symbol('banterDamageCapture');

/**
 * Per-call roll-data correlation, not a global pending item. A read-only proxy
 * passes the snapshot through the original Item#rollDamage to createRoll.
 * Only verified extra-damage ordering is attributed; ambiguous data is omitted.
 */
export class DamageSourceCapture {
  /** Install only against the inspected 0.9.3 APIs; other versions retain rolls. */
  static async install() {
    if (game.system?.id !== 'dnd4e' || game.system.version !== '0.9.3') {
      return;
    }
    try {
      const [{ default: RollClass }, utils] = await Promise.all([
        import('/systems/dnd4e/module/rolls/roll-with-expression.mjs'),
        import('/systems/dnd4e/module/utils/utils.mjs'),
      ]);
      DamageSourceCapture.wrap(CONFIG.Item.documentClass, RollClass, utils);
    } catch (error) {
      console.error('banter-4e-modifications | Unable to capture damage sources', error);
    }
  }

  /** Preserve receiver semantics and isolate each overlapping damage dialog. */
  static wrap(ItemClass, RollClass, utils) {
    const original = ItemClass.prototype.rollDamage;
    if (original[WRAPPED]) {
      return;
    }
    async function rollDamageWithSources(options = {}) {
      let context;
      try {
        context = await DamageSourceCapture.snapshot(this, options.variance ?? {}, utils);
      } catch (error) {
        console.warn('banter-4e-modifications | Damage attribution unavailable', error);
      }
      const item = this;
      const proxy = new Proxy(item, {
        get(target, key) {
          if (key === 'getRollData') {
            return (...args) => {
              const data = item.getRollData(...args);
              Object.defineProperty(data, CONTEXT, { value: context, configurable: true });
              return data;
            };
          }
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        set(target, key, value) { return Reflect.set(target, key, value, target); },
      });
      return original.call(proxy, options);
    }
    rollDamageWithSources[WRAPPED] = true;
    ItemClass.prototype.rollDamage = rollDamageWithSources;
    const create = RollClass.createRoll;
    RollClass.createRoll = function(parts, replacements, data, options = {}) {
      const roll = create.call(this, parts, replacements, data, options);
      const context = data?.[CONTEXT];
      if (context && options.hitTypeDamage && !options.hitTypeHealing) {
        const contributors = DamageSourceCapture.correlate(parts, replacements, options.hitType, context);
        for (const candidate of context.flatSources ?? []) {
          const loss = findBonusLoss(options.bonuses ?? {}, context.flatBonuses, candidate.without);
          if (Number.isFinite(loss) && loss !== 0) {
            contributors.push({ sourceUuid: candidate.sourceUuid, name: candidate.name, temporary: true,
              displayFormula: String(loss), damageType: '', attribution: 'verified', rolledContribution: loss });
          }
        }
        roll.options.banterChatRoll = { version: 1, kind: 'damage', source: context.source, contributors };
        const toMessage = roll.toMessage;
        roll.toMessage = async function(...args) {
          if (!this._evaluated) {
            await this.evaluate();
          }
          DamageSourceCapture.recordContributions(this);
          return toMessage.apply(this, args);
        };
      }
      return roll;
    };
  }

  /**
   * Replay keyword selection using deterministic marker values, never random
   * effect formulas. The real system still rolls all damage exactly as before.
   * Markers reveal source order, including permanent sources and duplicates.
   */
  static async snapshot(item, variance, utils) {
    const actor = item.actor;
    const data = item.getRollData({ variance });
    const weapon = utils.getWeaponUse(data.item, actor);
    const markers = new Map();
    const effects = (actor.appliedEffects ?? []).map(effect => ({
      name: effect.name, item: effect.item,
      system: { changes: (effect.system?.changes ?? []).flatMap((change, index) => {
        if (!/^(power|weapon)\.damage\..*\.roll$/.test(change.key)) {
          return [];
        }
        const marker = 971000 + markers.size;
        const formula = Roll.replaceFormulaData(String(change.value), actor.getRollData());
        const parts = DamageSourceCapture.extraParts(formula);
        markers.set(marker, { sourceUuid: effect.uuid, changeIndex: index, name: effect.name,
          temporary: AttackBuffs.isTemporary(effect), parts });
        return [{ ...change, value: String(marker) }];
      }) },
    }));
    const view = new Proxy(actor, {
      get(target, key) {
        if (key === 'appliedEffects') {
          return effects;
        }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const selected = [];
    const bonusKeys = Object.keys(actor.system.modifiers?.damage ?? {}).filter(key => !['value', 'bonus', 'warn', 'bonusValue', 'label'].includes(key));
    const options = { bonuses: Object.fromEntries(bonusKeys.map(key => [key, []])) };
    if (!item.system.hit?.damageBonusNull && markers.size) {
      await utils.applyEffects(data, view, data.item, weapon?.getRollData().item, 'damage', selected, null, options);
    }
    const sources = selected.map(part => markers.get(Number(String(part).replace(/[()]/g, ''))));
    if (sources.some(source => !source)) {
      throw new Error('Unrecognized damage source marker');
    }
    const flat = await DamageSourceCapture.flatSources(item, data, weapon, utils).catch(() => ({}));
    return { source: { actorUuid: actor.uuid, itemUuid: item.uuid, itemName: item.name, weaponName: weapon?.name,
      speakerName: ChatMessage.getSpeaker({ actor }).alias }, sources, ...flat };
  }

  /** Replay deterministic typed bonuses only, preserving the system's stacking. */
  static async flatSources(item, data, weapon, utils) {
    if (item.system.hit?.damageBonusNull) {
      return {};
    }
    const actor = item.actor;
    const effects = actor.appliedEffects ?? [];
    const safeEffects = effects.map(effect => ({ name: effect.name, uuid: effect.uuid, item: effect.item,
      system: { changes: (effect.system?.changes ?? []).filter(change => {
        if (!/^(power|weapon)\.damage\./.test(change.key) || change.key.endsWith('.roll')) {
          return false;
        }
        const formula = Roll.replaceFormulaData(String(change.value), actor.getRollData());
        if (!new Roll(formula).isDeterministic) {
          throw new Error('Random typed damage bonus cannot be safely replayed');
        }
        return true;
      }) } }));
    const evaluate = async excluded => {
      const view = new Proxy(actor, { get(target, key) {
        if (key === 'appliedEffects') {
          return safeEffects.filter(effect => effect.uuid !== excluded);
        }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      const options = { bonuses: Object.fromEntries(Object.keys(actor.system.modifiers.damage)
        .filter(key => !['value', 'bonus', 'warn', 'bonusValue', 'label'].includes(key)).map(key => [key, []])) };
      await utils.applyEffects(data, view, data.item, weapon?.getRollData().item, 'damage', [], null, options);
      return options.bonuses;
    };
    try {
      const flatBonuses = await evaluate();
      const flatSources = [];
      for (const effect of effects.filter(AttackBuffs.isTemporary)) {
        if (safeEffects.find(candidate => candidate.uuid === effect.uuid)?.system.changes.length) {
          flatSources.push({ sourceUuid: effect.uuid, name: effect.name, without: await evaluate(effect.uuid) });
        }
      }
      return { flatBonuses, flatSources };
    } catch {
      return {};
    }
  }

  /** Match the pinned system's expansion of .roll changes without evaluating. */
  static extraParts(formula) {
    return new Roll(formula).terms.flatMap(term => {
      if (term instanceof foundry.dice.terms.ParentheticalTerm) {
        return [{ formula: term.formula, displayFormula: term.term ?? term.formula, damageType: term.flavor ?? '' }];
      }
      if (term instanceof foundry.dice.terms.DiceTerm || typeof term.total === 'number') {
        return [{ formula: `(${term.expression})${term.flavor ? `[${term.flavor}]` : ''}`,
          displayFormula: term.expression, damageType: term.flavor ?? '' }];
      }
      return [];
    });
  }

  /**
   * Validate the entire ordered extraDamage sequence before assigning identity.
   * Critical maximization has a different expression: omit attribution there
   * until the system exposes a reliable source-to-maximized-term seam.
   */
  static correlate(parts, replacements, hitType, context) {
    if (hitType === 'crit') {
      return [];
    }
    const extra = new Set(replacements.filter(entry => entry.value === '@extraDamage').map(entry => entry.target));
    const actual = parts.map((part, index) => ({ part, index })).filter(entry => extra.has(entry.part));
    const expected = context.sources.flatMap(source => source.parts.map(part => ({ ...source, ...part })));
    if (actual.length !== expected.length || actual.some((entry, index) => entry.part !== expected[index].formula)) {
      return [];
    }
    return expected.map((entry, index) => ({ sourceUuid: entry.sourceUuid, changeIndex: entry.changeIndex, name: entry.name,
      temporary: entry.temporary, displayFormula: entry.displayFormula, damageType: entry.damageType,
      partIndex: actual[index].index, attribution: 'verified' }));
  }

  /**
   * Use exact top-level part boundaries only. If Foundry flattened an expression,
   * keep the formula/source but omit a rolled subtotal rather than guessing.
   */
  static recordContributions(roll) {
    const parts = roll.options.parts ?? [];
    const terms = roll.terms ?? [];
    const aligned = terms.length === parts.length * 2 - 1
      && terms.every((term, index) => index % 2 ? term.operator === '+' : Number.isFinite(term.total));
    for (const contributor of roll.options.banterChatRoll.contributors) {
      if (aligned && Number.isInteger(contributor.partIndex)) {
        const term = terms[contributor.partIndex * 2];
        contributor.rolledContribution = term.total;
        contributor.termRefs = [contributor.partIndex * 2];
        contributor.diceResults = (term.roll?.dice ?? (term.results ? [term] : []))
          .flatMap(die => die.results ?? []).filter(result => result.active !== false).map(result => result.result);
      }
    }
  }
}
