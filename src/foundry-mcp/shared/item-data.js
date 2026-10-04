import { validateShape, POWER_SYSTEM_SCHEMA, FEATURE_SYSTEM_SCHEMA } from "./npc-data.js";

const keyed = (keys, shape) => Object.fromEntries(keys.split(" ").map(key => [key, shape]));
const description = { value: "string", chat: "string", unidentified: "string", gm: "string" };
const damageFlags = keyed("acid cold fire force lightning necrotic physical poison psychic radiant thunder damage ongoing", "boolean");
const damageParts = { parts: [{ formula: "string", type: ["string"] }] };
const physical = {
  description, descriptionGM: { value: "string" }, level: "integer",
  quantity: "integer", weight: "number", price: "number", rarity: "string",
  identified: "boolean", equipped: "boolean", attuned: "boolean"
};

/**
 * Native DnD4e 0.9.3 fields, excluding document links, effects and macros.
 * See module/data/item/{weapon,equipment}.mjs at the pinned system tag.
 */
export const ITEM_SYSTEM_SCHEMAS = {
  weapon: {
    ...physical, weaponType: "string", weaponHand: "string", weaponBaseType: "string",
    weaponBaseTypeCustom: "string", proficient: "string", profBonus: "integer",
    enhance: "integer", isRanged: "boolean", range: { value: "number", long: "number" },
    properties: keyed("amm bru def hic imp lof lom mou off rch rel sml spc sto thv tlg two ver", "boolean"),
    weaponGroup: keyed("axe bladeH bladeL blowgun bow cbow dragon flail garrote ham mace pik pole sling spear staff unarm whip", "boolean"),
    damageDice: { parts: [{ numDice: "string", numFaces: "string", modifier: "string" }] },
    damage: damageParts, damageCrit: damageParts, damageType: damageFlags,
    damageTypeOverride: "boolean", brutalNum: "integer", attackForm: "string",
    damageForm: "string", critDamageForm: "string", critRange: "integer"
  },
  equipment: {
    ...physical, armour: {
      type: "string", subtype: "string", enhance: "integer", ac: "integer",
      fort: "integer", ref: "integer", wil: "integer", movePen: "boolean",
      movePenValue: "integer", skillCheck: "boolean", skillCheckValue: "integer"
    },
    armourBaseType: "string", armourBaseTypeCustom: "string",
    shieldBaseType: "string", shieldBaseTypeCustom: "string", proficient: "string"
  },
  power: POWER_SYSTEM_SCHEMA,
  feature: FEATURE_SYSTEM_SCHEMA
};

export const WORLD_ITEM_TYPES = Object.freeze(Object.keys(ITEM_SYSTEM_SCHEMAS));

/**
 * Validate requests again in the browser, independently of the MCP schema.
 */
export function validateItemRequest(args) {
  const schema = args && Object.hasOwn(ITEM_SYSTEM_SCHEMAS, args.type)
    ? ITEM_SYSTEM_SCHEMAS[args.type] : null;
  if (!schema) {
    throw new Error("Choose a supported world Item type: weapon, equipment, power or feature.");
  }
  validateShape(args, {
    requestId: "string", name: "string", type: "string", folder: "string",
    img: "string", system: schema
  });
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId ?? "")
    || !args.name?.trim() || args.name.length > 200
    || !args.folder?.trim() || args.folder.length > 1000 || !args.system) {
    throw new Error("A request ID, Item name, destination Item folder and system object are required.");
  }
  for (const field of ["quantity", "weight", "price", "level", "enhance"]) {
    if (args.system[field] !== undefined && args.system[field] < 0) {
      throw new Error(`Item ${field} must be non-negative.`);
    }
  }
}
