import { validateShape } from "./npc-data.js";
import { validateChangeSummary } from "./confirmation-data.js";

export const EFFECT_APPLICATIONS = Object.freeze(["equipped", "passive", "all", "allies", "enemies", "hit", "miss", "hitOrMiss", "self", "selfAfterAttack", "selfHit", "selfMiss", "misc"]);
export const EFFECT_DURATIONS = Object.freeze(["permanent", "endOfTargetTurn", "endOfUserTurn", "endOfUserCurrent", "startOfTargetTurn", "startOfUserTurn", "saveEnd", "endOfEncounter", "endOfDay", "custom"]);
export const EFFECT_ACTIONS = Object.freeze(["attack", "damage", "check", "save", "deathsave", "heal", "attacked", "attackedhit", "attackedmiss", "damaged", "healed"]);
export const EFFECT_ITEM_TYPES = Object.freeze(["power", "consumable", "weapon", "equipment", "tool", "loot", "backpack", "feature"]);
export const EFFECT_DAMAGE_TYPES = Object.freeze("damage ongoing acid cold fire force lightning necrotic physical poison psychic radiant thunder".split(" "));
export const EFFECT_AURA_SCHEMA = Object.freeze({
  distanceFormula: "string", disposition: "string", applyToSelf: "boolean",
  evaluatePreApply: "boolean", canStack: "boolean", bestFormula: "string",
  collisionType: "string", showRadius: "boolean", color: "string",
  combatOnly: "boolean", disableOnHidden: "boolean", overrideName: "string", visualOnly: "boolean"
});

/**
 * Match Aura Effects 2.2.1's schema; never accept caller JavaScript or flags.
 */
export function auraEffectData(aura) {
  return {
    distanceFormula: aura.distanceFormula, disposition: { hostile: -1, any: 0, friendly: 1 }[aura.disposition ?? "any"],
    applyToSelf: aura.applyToSelf ?? true, evaluatePreApply: aura.evaluatePreApply ?? false,
    canStack: aura.canStack ?? false, bestFormula: aura.bestFormula ?? "",
    collisionType: aura.collisionType ?? "move", showRadius: aura.showRadius ?? false,
    ...(aura.color !== undefined ? { color: aura.color } : {}),
    combatOnly: aura.combatOnly ?? false, disableOnHidden: aura.disableOnHidden ?? true,
    overrideName: aura.overrideName ?? "", script: aura.visualOnly ? "false" : ""
  };
}

/**
 * Aura sizing and ranking must be deterministic numeric roll expressions.
 */
function isAuraFormula(value) {
  return isFormula(value) && !/\bd\d|\d+d\d|\[|\]/i.test(value);
}
const bonus = "(?:feat|race|item|class|power|enhance|untyped|floor|ceil|absolute)";
const actorKeys = [
  `system\\.defences\\.(?:ac|fort|ref|wil)\\.(?:armour|shield|${bonus})`,
  `system\\.movement\\.(?:base|walk|run|charge|shift|burrow|climb|fly|swim|teleport)\\.${bonus}`,
  `system\\.modifiers\\.(?:attack|damage|skills|defences|abilities)\\.${bonus}`,
  `system\\.details\\.(?:saves|surges|surgeBon|secondwindbon|deathsavebon)\\.${bonus}`,
  `system\\.attributes\\.hp\\.(?:starting|perlevel|${bonus})`,
  `system\\.attributes\\.init\\.${bonus}`,
  `system\\.skills\\.(?:acr|arc|ath|blu|dip|dun|end|hea|his|ins|itm|nat|prc|rel|stl|stw|thi)\\.${bonus}`,
  `system\\.resistances\\.(?:${EFFECT_DAMAGE_TYPES.join("|")})\\.(?:res|vuln|absolute)`,
  "system\\.marker"
];
const actorKey = new RegExp(`^(?:${actorKeys.join("|")})$`);
const conditionalKey = /^(?:(?:power|weapon)\.(?:attack|damage|defence|save|saveDC)|effect\.(?:save|saveDC)|grants\.attack)\.[A-Za-z0-9_,.-]+\.(?:feat|race|item|class|power|enhance|untyped|roll)$/;

/**
 * Accept numeric roll expressions and actor variables, never arbitrary calls.
 */
function isFormula(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || /__proto__|constructor|prototype/.test(value)) {
    return false;
  }
  const remainder = value.replace(/@[A-Za-z_][A-Za-z0-9_.]*/g, "0")
    .replace(/\b\d*d\d+\b/gi, "0")
    .replace(/\[(?:acid|cold|fire|force|lightning|necrotic|physical|poison|psychic|radiant|thunder)(?:,(?:acid|cold|fire|force|lightning|necrotic|physical|poison|psychic|radiant|thunder))*\]/g, "")
    .replace(/\b(?:floor|ceil|round|min|max|abs|scale)\s*(?=\()/g, "");
  return /^[0-9.+*/%(), -]+$/.test(remainder);
}

/**
 * Validate a declarative batch at both bridge ends. No arbitrary effect source,
 * flags, macros, custom change mode, or document paths cross this interface.
 */
export function validateItemEffects(args) {
  validateChangeSummary(args?.summary);
  validateShape(args, {
    summary: "string",
    items: [{ uuid: "string", notes: "string", effects: [{
      key: "string", name: "string", description: "string", condition: "string", application: "string", duration: "string",
      durationValue: "number", durationUnits: "string", durationAction: "string", saveDC: "integer",
      useSourceActorData: "boolean", statuses: ["string"], keywords: ["string"],
      aura: EFFECT_AURA_SCHEMA,
      changes: [{ key: "string", type: "string", value: "string", priority: "integer" }],
      dots: [{ amount: "string", types: ["string"] }]
    }] }]
  });
  if (!Array.isArray(args.items) || !args.items.length || args.items.length > 50) {
    throw new Error("Supply 1-50 Item proposals.");
  }
  const uuids = new Set();
  let count = 0;
  for (const item of args.items) {
    if (!/^(?:Item\.[A-Za-z0-9_-]{1,128}|Actor\.[A-Za-z0-9_-]{1,128}\.Item\.[A-Za-z0-9_-]{1,128})$/.test(item.uuid) || uuids.has(item.uuid)) {
      throw new Error("Choose distinct world or world-actor Item UUIDs; compendiums and tokens are excluded.");
    }
    uuids.add(item.uuid);
    if (item.notes !== undefined && item.notes.length > 5000) {
      throw new Error("Item notes must be at most 5000 characters.");
    }
    if (!Array.isArray(item.effects) || item.effects.length > 20 || (!item.effects.length && !item.notes?.trim())) {
      throw new Error("Supply effects, or explain why this Item needs manual handling in notes.");
    }
    const keys = new Set();
    for (const effect of item.effects) {
      count++;
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(effect.key ?? "") || keys.has(effect.key)
        || (effect.condition !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(effect.condition))
        || (!effect.condition && (!effect.name?.trim() || !effect.description?.trim()))
        || (effect.name !== undefined && (!effect.name.trim() || effect.name.length > 200))
        || !EFFECT_APPLICATIONS.includes(effect.application) || !EFFECT_DURATIONS.includes(effect.duration)) {
        throw new Error("Each effect needs a unique stable key, application and duration, plus a condition ID or name and rules description.");
      }
      keys.add(effect.key);
      if (effect.aura) {
        const aura = effect.aura;
        if (!isAuraFormula(aura.distanceFormula)
          || (aura.bestFormula !== undefined && aura.bestFormula !== "" && !isAuraFormula(aura.bestFormula))
          || (aura.disposition !== undefined && !["any", "friendly", "hostile"].includes(aura.disposition))
          || (aura.collisionType !== undefined && !["", "move", "sight", "light", "sound"].includes(aura.collisionType))
          || (aura.color !== undefined && !/^#[0-9a-f]{6}$/i.test(aura.color))
          || (aura.overrideName?.length ?? 0) > 200) {
          throw new Error("Aura settings need deterministic numeric distance/best formulas, a valid disposition, collision type and #RRGGBB color.");
        }
        if (aura.visualOnly && (effect.condition || effect.changes?.length || effect.statuses?.length || effect.dots?.length)) {
          throw new Error("Visual-only auras cannot apply conditions, modifiers or ongoing damage.");
        }
      }
      if ((effect.description?.length ?? 0) > 5000 || (effect.changes?.length ?? 0) > 50 || (effect.dots?.length ?? 0) > 10
        || [effect.statuses, effect.keywords].some(entries => entries && (entries.length > 30 || new Set(entries).size !== entries.length || entries.some(entry => !entry || entry.length > 80)))) {
        throw new Error("Effect descriptions, changes, conditions, keywords or ongoing damage exceed their limits or contain duplicates.");
      }
      if (effect.condition && (effect.name !== undefined || effect.statuses !== undefined || effect.changes !== undefined)) {
        throw new Error("Condition shortcuts copy Name and Mods; omit name, statuses and changes. Put extra mechanics in a separate effect.");
      }
      if (effect.duration === "custom") {
        if (!Number.isFinite(effect.durationValue) || effect.durationValue <= 0 || effect.durationValue > 31536000
          || !["seconds", "rounds", "turns"].includes(effect.durationUnits)) {
          throw new Error("Custom durations need a positive value and seconds, rounds or turns.");
        }
      } else if (effect.durationValue !== undefined || effect.durationUnits !== undefined) {
        throw new Error("Duration value/units are only for custom durations.");
      }
      if (effect.saveDC !== undefined && (effect.duration !== "saveEnd" || effect.saveDC < 1 || effect.saveDC > 100)) {
        throw new Error("saveDC is only valid for save-end effects (1-100).");
      }
      if (effect.durationAction !== undefined && (!EFFECT_ACTIONS.includes(effect.durationAction) || effect.duration === "saveEnd")) {
        throw new Error("Choose a native expiration action; save-end effects cannot use one.");
      }
      if (["equipped", "passive"].includes(effect.application) && (effect.duration !== "permanent" || effect.durationAction)) {
        throw new Error("Transferred properties must be permanent; activated effects belong on a power or consumable.");
      }
      for (const change of effect.changes ?? []) {
        if ((!actorKey.test(change.key) && !conditionalKey.test(change.key))
          || (change.key.endsWith(".roll") && !/^(power|weapon)\.damage\./.test(change.key))
          || !["add", "upgrade", "downgrade", "override", "multiply"].includes(change.type)) {
          throw new Error("Unsupported DnD4e modifier key or change type.");
        }
        if (change.priority !== undefined && (change.priority < 0 || change.priority > 100)) {
          throw new Error("Change priority must be 0-100.");
        }
        if (change.key === "system.marker") {
          if (change.value !== "@charaUID" || change.type !== "override" || effect.useSourceActorData === false) {
            throw new Error("Markers must override with @charaUID using source actor data.");
          }
        } else if (!isFormula(change.value)) {
          throw new Error("Use a simple DnD4e numeric formula without scripts or inline rolls.");
        }
      }
      for (const dot of effect.dots ?? []) {
        if (!isFormula(dot.amount) || !dot.types?.length || dot.types.some(type => !EFFECT_DAMAGE_TYPES.includes(type))) {
          throw new Error("Ongoing damage needs a simple amount formula and valid damage types.");
        }
      }
    }
  }
  if (count > 100) {
    throw new Error("A batch supports at most 100 effects.");
  }
}
