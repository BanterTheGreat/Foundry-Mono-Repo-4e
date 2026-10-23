import { findBonusLoss, resolveBuffBadges } from "./attack-buff-math.js";

const OPTION_KEY = "banterAttackBuffs";
const WRAPPED = Symbol("banterAttackBuffs");

/**
 * Variant 1: persistent roll-time snapshots, rendered as compact buff badges.
 * Uses the pinned 0.9.3 preAttackRoll/addNewRoll seam, before attack-duration
 * effects expire. Never changes an actor, roll formula, or attack outcome.
 */
export class AttackBuffs {
  static contexts = new WeakMap();

  /** Load the system adapter only once Foundry has registered its documents. */
  static async install() {
    if (game.system.id !== "dnd4e") {
      return;
    }
    try {
      const [{ default: MultiAttackRoll }, utils] = await Promise.all([
        import("/systems/dnd4e/module/rolls/multi-attack-roll.mjs"),
        import("/systems/dnd4e/module/utils/utils.mjs"),
      ]);
      AttackBuffs.wrapRollClass(MultiAttackRoll, utils);
      Hooks.on("dnd4e.preAttackRoll", AttackBuffs.captureAttack);
      Hooks.on("renderChatMessageHTML", AttackBuffs.renderBadges);
      Hooks.on("renderChatMessage", AttackBuffs.renderBadges);
    } catch (error) {
      console.error("banter-4e-modifications | Unable to install attack buff badges", error);
    }
  }

  /**
   * Associate a target with its unique roll options, avoiding global pending
   * state when attacks or roll dialogs overlap on the same client.
   */
  static captureAttack(item, attacker, target, config) {
    AttackBuffs.contexts.set(config.targetOptions, { item, target, config });
  }

  /**
   * Await snapshot preparation inside the system's asynchronous roll method;
   * Foundry hooks themselves do not await promises. Options serialize with the
   * individual roll, including when the message contains multiple targets.
   */
  static wrapRollClass(RollClass, utils) {
    const original = RollClass.prototype.addNewRoll;
    if (original[WRAPPED]) {
      return;
    }
    async function addRollWithBuffs(parts, replacements, data, options) {
      const context = AttackBuffs.contexts.get(options);
      AttackBuffs.contexts.delete(options);
      let badges = [];
      if (context) {
        try {
          badges = await AttackBuffs.snapshot(context, data, options, utils);
        } catch (error) {
          console.error("banter-4e-modifications | Unable to capture attack buffs", error);
        }
      }
      const roll = await original.call(this, parts, replacements, data, options);
      if (badges.length) {
        roll.options[OPTION_KEY] = badges;
      }
      return roll;
    }
    addRollWithBuffs[WRAPPED] = true;
    RollClass.prototype.addNewRoll = addRollWithBuffs;

    const populate = RollClass.prototype.populateMultirollData;
    RollClass.prototype.populateMultirollData = function(targetData, critStates) {
      const result = populate.call(this, targetData, critStates);
      this.rollArray.forEach((roll, index) => {
        if (roll.options[OPTION_KEY]) {
          roll.options[OPTION_KEY] = resolveBuffBadges(roll.options[OPTION_KEY], roll.total,
            targetData.targDefValArray[index], critStates[index], this.multirollData[index].hitstate);
        }
      });
      return result;
    };
  }

  /**
   * Temporary includes DnD4e save/encounter durations and aura recipients, not
   * only core timed effects. Exclude equipment/feat transfers without duration.
   */
  static isTemporary(effect) {
    return !effect.disabled && !effect.isSuppressed && Boolean(effect.isTemporary
      || effect.system?.durationType || effect.duration?.expiry
      || effect.flags?.auraeffects?.fromAura
      || (!effect.transfer && effect.parent?.documentName === "Actor"));
  }

  /**
   * Reuse DnD4e's keyword matcher and formula evaluator without rolling random
   * effect values a second time. Proxy getters/methods retain their real actor
   * receiver; only the read-only appliedEffects view is replaced.
   */
  static staticEffectView(actor, excluded, rolledValues = new Map()) {
    const effects = (actor.appliedEffects ?? []).filter(effect => effect.uuid !== excluded).map(effect => {
      const changes = (effect.system?.changes ?? []).flatMap((change, index) => {
        if (!/^(power|weapon|grants)\.attack\./.test(change.key)) {
          return [];
        }
        try {
          const formula = Roll.replaceFormulaData(String(change.value), actor.getRollData());
          if (new Roll(formula).isDeterministic) {
            return [change];
          }
          const value = rolledValues.get(`${effect.uuid}:${index}`);
          return Number.isFinite(value) ? [{ ...change, value: String(value) }] : [];
        } catch {
          return [];
        }
      });
      return { name: effect.name, item: effect.item, system: { changes } };
    });
    return new Proxy(actor, {
      get(target, key) {
        if (key === "appliedEffects") {
          return effects;
        }
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  /**
   * Use deterministic markers to correlate random changes with their already
   * evaluated entries in the system's bonus arrays. This reuses the original
   * dice result instead of rolling a buff again. Refuse ambiguous types when
   * another module changed the array's shape or deterministic entries.
   */
  static async captureRolledValues(actor, target, item, data, options, utils) {
    const rolledValues = new Map();
    const markers = new Map();
    for (const owner of [actor, target].filter(Boolean)) {
      for (const effect of owner.appliedEffects ?? []) {
        for (const [index, change] of (effect.system?.changes ?? []).entries()) {
          if (!/^(power|weapon|grants)\.attack\./.test(change.key)) {
            continue;
          }
          let deterministic = false;
          try {
            deterministic = new Roll(Roll.replaceFormulaData(String(change.value), owner.getRollData())).isDeterministic;
          } catch {
            // An unresolved formula is also unsafe to use for attribution.
          }
          if (!deterministic) {
            const key = `${effect.uuid}:${index}`;
            const marker = 913000 + markers.size + 0.125;
            markers.set(marker, key);
            rolledValues.set(key, marker);
          }
        }
      }
    }
    const uncertainTypes = new Set();
    if (!markers.size) {
      return { rolledValues, uncertainTypes };
    }
    const symbolic = await AttackBuffs.evaluateBonuses(actor, target, item, data, options, utils, undefined, rolledValues);
    const resolved = new Map();
    for (const [type, values] of Object.entries(symbolic)) {
      const actual = options.bonuses[type] ?? [];
      const reliable = values.length === actual.length && values.every((value, index) =>
        markers.has(value) || value === actual[index]);
      for (const [index, value] of values.entries()) {
        if (markers.has(value)) {
          if (reliable && Number.isFinite(actual[index])) {
            resolved.set(markers.get(value), actual[index]);
          } else {
            uncertainTypes.add(type);
          }
        }
      }
    }
    return { rolledValues: resolved, uncertainTypes };
  }

  /**
   * Make an in-memory actor with one effect disabled. Both actor-owned and
   * transferred item effects retain IDs so the cloned power finds its weapon.
   * No document update or persistence occurs.
   */
  static withoutEffect(actor, effect) {
    const source = actor.toObject();
    const effects = effect.parent?.documentName === "Item"
      ? source.items.find(item => item._id === effect.parent.id)?.effects
      : source.effects;
    const removed = effects?.find(candidate => candidate._id === effect.id);
    if (!removed) {
      throw new Error(`Cannot locate buff source: ${effect.name}`);
    }
    removed.disabled = true;
    const clone = actor.clone(source, { keepId: true });
    clone.prepareData();
    return clone;
  }

  /** Evaluate only deterministic expressions, without emitting chat or dice. */
  static flatTotal(formula, data) {
    const roll = new Roll(Roll.replaceFormulaData(formula || "0", data, { recursive: true }));
    return roll.isDeterministic ? roll.evaluateSync().total : null;
  }

  /**
   * Replay flat effect bonuses through the system, including target grants.
   * All output arrays are fresh; macros and document lifecycle effects are not
   * executed. Random bonus types are rejected later if their replay disagrees.
   */
  static async evaluateBonuses(actor, target, item, data, options, utils, excluded, rolledValues) {
    const bonuses = Object.fromEntries(Object.keys(options.bonuses).map(type => [type, []]));
    const replay = { ...options, bonuses };
    const weapon = utils.getWeaponUse(item.system, actor);
    const powerData = item.getRollData({ variance: options.variance }).item;
    const weaponData = weapon?.getRollData().item;
    const rollData = { ...data, ...options.variance };
    await utils.applyEffects(rollData, AttackBuffs.staticEffectView(actor, excluded, rolledValues), powerData, weaponData, "attack", null, false, replay);
    if (target) {
      await utils.applyEffects(rollData, AttackBuffs.staticEffectView(target, excluded, rolledValues), powerData, weaponData, "attack", null, true, replay);
    }
    return bonuses;
  }

  /**
   * Snapshot each temporary effect's marginal contribution, including a weaker
   * typed bonus taking over when it is removed. Common situational modifiers
   * come from the actual per-target dialog/automation choices.
   * Stored shape: {name, value, loss, decisive, decisivePenalty?, kind?, source?}.
   * Enhancement badges describe the selected weapon, rather than a removable
   * temporary modifier; their loss is zero. Contains no hidden defence.
   */
  static async snapshot({ item, target, config }, data, options, utils) {
    const badges = [];
    const actor = item.actor;
    const weapon = utils.getWeaponUse(item.system, actor);
    const enhancement = Number(weapon?.system?.enhance);
    if (weapon && Number.isFinite(enhancement) && enhancement > 0) {
      badges.push({
        name: "Enchantment",
        source: weapon.name,
        kind: "enhancement",
        value: enhancement,
        loss: 0,
        decisive: false,
      });
    }
    const targetActor = target?.actor;
    const { rolledValues, uncertainTypes } = await AttackBuffs.captureRolledValues(actor, targetActor, item, data, options, utils);
    const baseline = await AttackBuffs.evaluateBonuses(actor, targetActor, item, data, options, utils, undefined, rolledValues);
    const candidates = [actor, targetActor].filter(Boolean).flatMap(owner =>
      (owner.appliedEffects ?? []).filter(AttackBuffs.isTemporary).map(effect => ({ owner, effect })));

    for (const { owner, effect } of candidates) {
      const changes = effect.system?.changes ?? effect.changes ?? [];
      const relevant = changes.some(change => /^(power|weapon|grants)\.attack\.|^system\.modifiers\.attack\.|^system\.abilities\.|^@/.test(change.key));
      if (!relevant) {
        continue;
      }
      try {
        const modifiesActor = owner === actor && changes.some(change => /^(system\.|@)/.test(change.key));
        const remainingActor = modifiesActor ? AttackBuffs.withoutEffect(actor, effect) : actor;
        const remainingItem = modifiesActor ? remainingActor.items.get(item.id) : item;
        const remainingData = modifiesActor ? remainingItem.getRollData({ variance: options.variance }) : data;
        const after = await AttackBuffs.evaluateBonuses(remainingActor, targetActor, remainingItem, remainingData, options, utils, effect.uuid, rolledValues);
        let loss = findBonusLoss(options.bonuses, baseline, after, uncertainTypes);
        if (loss === null) {
          continue;
        }
        if (modifiesActor) {
          const formula = item.system.attack?.formula;
          const beforeTotal = AttackBuffs.flatTotal(formula, data);
          const afterTotal = AttackBuffs.flatTotal(formula, remainingData);
          if (beforeTotal === null || afterTotal === null) {
            continue;
          }
          loss += beforeTotal - afterTotal;
        }
        if (loss !== 0 && Number.isFinite(loss)) {
          badges.push({ name: effect.name, value: loss, loss, decisive: false });
        }
      } catch (error) {
        console.warn(`banter-4e-modifications | Skipped buff ${effect.name}`, error);
      }
    }

    for (const [key, bonus] of Object.entries(config.commonAttackBonuses ?? {})) {
      const value = Number(bonus.value);
      if (!bonus.shouldApply || !Number.isFinite(value) || value === 0) {
        continue;
      }
      const label = CONFIG.DND4E.commonAttackBonuses[key]?.label ?? key;
      badges.push({ name: game.i18n.localize(label), value, loss: value, decisive: false });
    }
    return badges;
  }

  /**
   * Render attack and skill snapshots beneath the roll total. Respect private
   * roll visibility and both supported HTML/jQuery hook payloads. Rerenders
   * use only the serialized snapshot, never the actor's current effects.
   */
  static renderBadges(message, html) {
    if (message.isContentVisible === false) {
      return;
    }
    const root = html?.[0] ?? html;
    const rolls = root?.querySelectorAll?.(".dice-roll");
    if (!rolls) {
      return;
    }
    (message.rolls ?? []).forEach((roll, index) => {
      const skill = index === 0 ? message.flags?.["banter-4e-modifications"]?.skillCheck : null;
      const badges = skill
        ? resolveBuffBadges(skill.badges, roll.total, skill.dc, "", Number.isFinite(skill.dc) ? roll.total >= skill.dc ? "hit" : "miss" : "")
        : roll.options?.[OPTION_KEY];
      const visibleBadges = badges?.filter(badge => badge.kind !== "ability" || badge.value !== 0);
      const result = rolls[index]?.querySelector(".dice-result");
      if (!visibleBadges?.length || !result?.querySelector(".dice-total") || result.querySelector(".banter-attack-buffs")) {
        return;
      }
      const row = document.createElement("div");
      row.className = "banter-attack-buffs";
      row.setAttribute("aria-label", skill ? "Skill proficiency and modifiers" : "Weapon enhancement and temporary attack modifiers");
      for (const badge of visibleBadges) {
        const chip = document.createElement("span");
        chip.className = `banter-attack-buff${badge.decisivePenalty ? " banter-attack-buff--decisive-penalty" : badge.decisive ? " banter-attack-buff--decisive" : ""}`;
        chip.tabIndex = 0;
        const name = badge.kind === "enhancement" ? "Enchantment" : badge.name;
        chip.textContent = `${badge.decisive || badge.decisivePenalty ? "✦ " : ""}${name} ${badge.value > 0 ? "+" : ""}${badge.value}`;
        chip.title = badge.kind === "enhancement"
          ? `${badge.source}: listed enhancement +${badge.value}.`
          : badge.kind === "ability"
          ? `${badge.name}${Number.isFinite(badge.score) ? ` ${badge.score}` : ""}: ${badge.value >= 0 ? "+" : ""}${badge.value} ability modifier.`
          : badge.decisivePenalty
          ? `Without ${badge.name}, this ${skill ? "check would succeed" : "attack would hit"}.`
          : badge.decisive
          ? `Without ${badge.name}, this ${skill ? "check would fail" : "attack would miss"}.`
          : `${badge.name}: ${badge.value > 0 ? "+" : ""}${badge.value} to this ${skill ? "check" : "attack"} after bonus stacking.`;
        row.append(chip);
      }
      result.append(row);
    });
  }
}
