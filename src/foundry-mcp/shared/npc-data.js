/**
 * Supported DnD4e 0.9.3 source fields for new NPCs and their powers/traits.
 * This schema is shared by MCP validation and the browser write boundary.
 * Omitted fields use system defaults; document IDs, flags and executable data
 * are deliberately absent. Arrays describe their element schema.
 */
const number = "number";
const integer = "integer";
const string = "string";
const boolean = "boolean";
const keyed = (keys, shape) => Object.fromEntries(keys.split(" ").map(key => [key, shape]));
const bonuses = { feat: integer, item: integer, power: integer, race: integer, untyped: integer };
const description = { value: string, chat: string, unidentified: string, gm: string };
const damageTypes = "acid cold fire force lightning necrotic physical poison psychic radiant thunder damage ongoing";
const damageFlags = keyed(damageTypes, boolean);
const movement = { formula: string, traits: string, temp: number, ...bonuses };

export const NPC_SYSTEM_SCHEMA = {
  advancedCals: boolean,
  details: {
    level: integer, tier: integer, exp: integer, size: string, origin: string,
    type: string, other: string, race: string, alignment: string,
    role: { primary: string, secondary: string, leader: boolean },
    saves: { value: integer, ...bonuses }, surges: { value: integer, max: integer, ...bonuses }
  },
  attributes: {
    hp: { value: integer, max: integer, autototal: boolean, starting: integer, perlevel: integer, misc: integer, ...bonuses },
    temphp: { value: integer, max: integer },
    init: { base: integer, ability: string, notes: string, ...bonuses }
  },
  abilities: keyed("str con dex int wis cha", { value: integer }),
  defences: keyed("ac fort ref wil", { base: integer, ...bonuses }),
  skills: keyed("acr arc ath blu dip dun end hea his ins itm nat prc rel stl stw thi", { base: integer, training: integer, ability: string, ...bonuses }),
  movement: {
    base: { base: number, armour: number, temp: number, ...bonuses },
    ...keyed("walk run charge shift burrow climb fly swim teleport", movement),
    custom: string, notes: string
  },
  senses: { basic: string, special: keyed("nv lv dv bs ts tr", { value: boolean, range: number }), allAround: boolean, custom: string, notes: string },
  languages: { spoken: { value: [string], custom: string }, script: { value: [string], custom: string } },
  resistances: keyed(damageTypes, { res: integer, vuln: integer, immune: boolean }),
  untypedResistances: { resistances: [string], vulnerabilities: [string], immunities: [string] },
  actionpoints: { value: integer, encounteruse: boolean, effects: string, notes: string, custom: string },
  biography: string, powerGroupTypes: string, powerSortTypes: string
};

export const FEATURE_SYSTEM_SCHEMA = {
  description, descriptionGM: { value: string }, featureType: string, level: integer,
  requirements: string, featureSource: string, featureGroup: string, auraSize: string,
  damageType: damageFlags, keywordsCustom: string
};

export const POWER_SYSTEM_SCHEMA = {
  description, descriptionGM: { value: string },
  level: integer, prepared: boolean, powerType: string, powerSubtype: string,
  useType: string, actionType: string, powersource: string, secondPowersource: string,
  subName: string, weaponType: string, weaponUse: string, rangeType: string,
  rangePower: string, rangeText: string, rangeTextShort: string, area: string,
  auraSize: string, target: string, trigger: string, requirement: string,
  requirements: string, special: string, rechargeRoll: string, rechargeCondition: string,
  sustain: { actionType: string, detail: string },
  attack: {
    isAttack: boolean, isBasic: boolean, isCharge: boolean, isOpp: boolean,
    canCharge: boolean, canOpp: boolean, ability: string, abilityBonus: integer,
    def: string, defBonus: integer, detail: string, formula: string
  },
  hit: {
    isDamage: boolean, isHealing: boolean, damageBonusNull: boolean,
    detail: string, formula: string, critFormula: string, healFormula: string,
    healSurge: string
  },
  miss: { halfDamage: boolean, detail: string, formula: string },
  effect: { detail: string },
  damage: { parts: [{ formula: string, type: [string] }] },
  damageCrit: { parts: [{ formula: string, type: [string] }] },
  damageType: damageFlags, keywordsCustom: string, keyWords: [string],
  chatFlavor: string, effectHTML: boolean, postEffect: boolean,
  postSpecial: boolean, autoGenChatPowerCard: boolean,
  uses: { value: integer, max: string, per: string }
};

/**
 * Reject unknown nested fields and non-JSON data before any document creation.
 */
export function validateShape(value, schema, path = "data") {
  if (Array.isArray(schema)) {
    if (!Array.isArray(value) || value.length > 100) {
      throw new Error(`${path} must be an array of at most 100 entries.`);
    }
    value.forEach((entry, index) => validateShape(entry, schema[0], `${path}[${index}]`));
  } else if (typeof schema === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error(`${path} must be a plain object.`);
    }
    for (const [key, entry] of Object.entries(value)) {
      if (!["__proto__", "constructor", "prototype"].includes(key) && Object.hasOwn(schema, key)) {
        validateShape(entry, schema[key], `${path}.${key}`);
      } else {
        throw new Error(`Unsupported field: ${path}.${key}`);
      }
    }
  } else if (schema === integer ? !Number.isSafeInteger(value)
    : schema === number ? typeof value !== "number" || !Number.isFinite(value)
      : typeof value !== schema || (schema === string && value.length > 50000)) {
    throw new Error(`Invalid ${path}: expected ${schema}.`);
  }
}

/**
 * Validate the complete creation request independently of MCP annotations.
 */
export function validateNpcRequest(args) {
  const { items = [], ...actor } = args ?? {};
  validateShape(actor, {
    requestId: string, name: string, folder: string, img: string,
    system: NPC_SYSTEM_SCHEMA
  });
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(actor.requestId ?? "")
    || typeof actor.name !== "string" || !actor.name.trim() || actor.name.length > 200
    || typeof actor.folder !== "string" || !actor.folder.trim() || actor.folder.length > 1000 || !actor.system) {
    throw new Error("A request ID, NPC name, destination Actor folder and system object are required.");
  }
  if (!Array.isArray(items) || items.length > 100) {
    throw new Error("Items must be an array of at most 100 powers or traits.");
  }
  for (const item of items) {
    const schema = item?.type === "power" ? POWER_SYSTEM_SCHEMA : item?.type === "feature" ? FEATURE_SYSTEM_SCHEMA : null;
    if (!schema) {
      throw new Error("NPC items must be powers or features.");
    }
    validateShape(item, { name: string, type: string, img: string, system: schema }, "item");
    if (!item.name?.trim() || item.name.length > 200 || !item.system) {
      throw new Error("Each NPC item requires a name and system object.");
    }
  }
}
