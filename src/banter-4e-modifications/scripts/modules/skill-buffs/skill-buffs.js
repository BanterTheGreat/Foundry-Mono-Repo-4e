const MODULE_NAME = "banter-4e-modifications";
const WRAPPED = Symbol("banterSkillBuffs");

/** Capture skill modifier sources before DnD4e expires check-duration effects. */
export class SkillBuffs {
  /** Install on the pinned Actor4e skill API, preserving the normal dialog. */
  static install() {
    if (game.system?.id !== "dnd4e") {
      return;
    }
    SkillBuffs.wrapActorClass(CONFIG.Actor.documentClass);
  }

  /**
   * Store the snapshot in the nested options.flags consumed by d20Roll.
   * Per-call flags avoid pending global state and survive overlapping dialogs.
   */
  static wrapActorClass(ActorClass) {
    const original = ActorClass?.prototype.rollSkill;
    if (!original || original[WRAPPED]) {
      return;
    }
    function rollSkillWithBadges(skillId, options = {}) {
      let snapshot;
      try {
        const skill = this.system.skills[skillId];
        const customModifier = options.data?.mod !== undefined && options.data.mod !== skill.total;
        const customParts = options.parts && !options.parts.some(part => /@mod\b/.test(part));
        if (!customModifier && !customParts) {
          snapshot = SkillBuffs.snapshot(this, skillId, options.targetValue ?? options.dc);
        }
      } catch (error) {
        console.error("banter-4e-modifications | Unable to capture skill modifiers", error);
      }
      const forwarded = snapshot ? {
        ...options,
        options: {
          ...options.options,
          flags: {
            ...options.options?.flags,
            [MODULE_NAME]: { ...options.options?.flags?.[MODULE_NAME], skillCheck: snapshot },
          },
        },
      } : options;
      return original.call(this, skillId, forwarded);
    }
    rollSkillWithBadges[WRAPPED] = true;
    ActorClass.prototype.rollSkill = rollSkillWithBadges;
  }

  /**
   * Recalculate a skill on a prepared, in-memory actor. Foundry's own derived
   * data handles training, typed stacking, ability changes, floors and ceilings.
   */
  static contribution(actor, skillId, changeSource) {
    const source = actor.toObject();
    changeSource(source);
    const clone = actor.clone(source, { keepId: true });
    clone.prepareData();
    const before = actor.system.skills[skillId].total;
    const after = clone.system.skills[skillId]?.total;
    return Number.isFinite(before) && Number.isFinite(after) ? before - after : 0;
  }

  /**
   * Capture {skillId, dc, badges} as plain serializable data. Each badge's loss
   * is the change if that entire named source were removed. Training's printed
   * value remains the configured proficiency bonus, usually +5.
   */
  static snapshot(actor, skillId, dc) {
    const skill = actor.system.skills[skillId];
    const badges = [];
    const abilityId = skill.ability ?? globalThis.CONFIG?.DND4E?.skills?.[skillId]?.ability;
    const ability = actor.system.abilities?.[abilityId];
    const modifier = skill.mod ?? ability?.mod;
    // The ability badge describes the base modifier, like weapon enhancement
    // on attacks. Keep it neutral; removable effects retain their own badges.
    if (Number.isFinite(modifier) && Number.isNaN(parseInt(skill.absolute))) {
      const names = { str: "Strength", con: "Constitution", dex: "Dexterity", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
      const label = globalThis.CONFIG?.DND4E?.abilityScores?.[abilityId]?.label ?? names[abilityId] ?? abilityId;
      badges.push({
        name: globalThis.game?.i18n?.localize(label) ?? label,
        kind: "ability",
        score: Number.isFinite(ability?.value) ? ability.value : null,
        value: modifier,
        loss: 0,
        decisive: false,
      });
    }
    const addSource = (name, changeSource, value) => {
      try {
        const loss = SkillBuffs.contribution(actor, skillId, changeSource);
        if (Number.isFinite(loss) && loss !== 0) {
          badges.push({ name, value: value ?? loss, loss, decisive: false });
        }
      } catch (error) {
        console.warn(`banter-4e-modifications | Skipped skill modifier ${name}`, error);
      }
    };

    const trainingType = skill.training === 8 ? "expertise" : skill.training === 5 ? "trained" : null;
    if (trainingType) {
      const training = actor.system.skillTraining?.[trainingType];
      const value = Number(training?.value ?? skill.training) + Number(training?.untyped ?? 0);
      addSource(trainingType === "expertise" ? "Expertise" : "Proficiency", source => {
        source.system.skills[skillId].training = 0;
      }, value);
    }

    const level = actor.system.details?.level;
    if (Number.isFinite(level) && !actor.system.halfLevelOptions && Number.isNaN(parseInt(skill.absolute))) {
      badges.push({ name: "Half-Level", kind: "base", value: Math.floor(level / 2), loss: 0, decisive: false });
    }

    // Include manual named sheet bonuses as well as automated item effects.
    for (const [scope, bonuses] of [["skill", skill.bonus], ["global", actor.system.modifiers?.skills?.bonus]]) {
      (bonuses ?? []).forEach((bonus, index) => {
        if (!bonus.active) {
          return;
        }
        addSource(bonus.name || "Skill bonus", source => {
          const entries = scope === "skill" ? source.system.skills[skillId].bonus : source.system.modifiers.skills.bonus;
          entries[index].active = false;
        });
      });
    }

    // Group transferred effects by item so one item's several effects do not
    // become duplicate badges or independently overstate its contribution.
    const groups = new Map();
    for (const effect of actor.appliedEffects ?? []) {
      if (effect.disabled || effect.isSuppressed) {
        continue;
      }
      const changes = effect.system?.changes ?? effect.changes ?? [];
      const relevant = changes.some(change => change.key.startsWith(`system.skills.${skillId}.`)
        || /^system\.(modifiers\.skills\.|skillTraining\.|abilities\.)|^@/.test(change.key));
      if (!relevant && !(skillId === "prc" && effect.statuses?.has("blinded"))) {
        continue;
      }
      const item = effect.parent?.documentName === "Item" ? effect.parent : effect.item;
      const key = item?.uuid ?? effect.uuid;
      const group = groups.get(key) ?? { name: item?.name ?? effect.name, effects: [] };
      group.effects.push(effect);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      addSource(group.name, source => {
        for (const effect of group.effects) {
          const entries = effect.parent?.documentName === "Item"
            ? source.items.find(item => item._id === effect.parent.id)?.effects
            : source.effects;
          const entry = entries?.find(candidate => candidate._id === effect.id);
          if (!entry) {
            throw new Error(`Missing effect source: ${effect.name}`);
          }
          entry.disabled = true;
        }
      });
    }

    if (skill.armourCheck) {
      for (const item of actor.items) {
        if (item.type !== "equipment" || !item.system.equipped || !item.system.armour?.skillCheck) {
          continue;
        }
        addSource(`${item.name} (armour penalty)`, source => {
          source.items.find(candidate => candidate._id === item.id).system.armour.skillCheck = false;
        });
      }
    }
    const target = dc === null || dc === undefined || dc === "" ? null : Number(dc);
    const label = globalThis.CONFIG?.DND4E?.skills?.[skillId]?.label;
    return { skillId, ...(label ? { skillName: globalThis.game?.i18n?.localize(label) ?? label } : {}),
      dc: Number.isFinite(target) ? target : null, badges };
  }
}
