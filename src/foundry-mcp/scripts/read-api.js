import { WORLD_ITEM_TYPES } from "../shared/item-data.js";
import { conditionData } from "./condition-data.js";
import { MODULE_ID, READ_OPERATIONS, DOCUMENT_TYPES, EMBEDDED_TYPES, pagination } from "../shared/protocol.js";

/**
 * Fail closed when the opted-in GM session is no longer available.
 */
export function assertEnabledGM(game) {
  if (!game.ready || !game.socket?.connected || !game.user?.isGM || !game.settings.get(MODULE_ID, "enabled")) {
    throw new Error("An enabled, logged-in GM session is required.");
  }
}

/**
 * Require Foundry observer access, including every parent and compendium.
 */
function assertReadable(document, game) {
  if (!document) {
    throw new Error("Document not found.");
  }
  if (document.pack) {
    const pack = game.packs.get(document.pack);
    if (!pack?.testUserPermission(game.user, "OBSERVER")) {
      throw new Error("Compendium access denied.");
    }
  }
  for (let current = document; current; current = current.parent) {
    if (!current.testUserPermission(game.user, "OBSERVER")) {
      throw new Error("Document access denied.");
    }
  }
}

/**
 * Produce small discovery results rather than serializing whole collections.
 */
function summary(document) {
  return {
    id: document.id, uuid: document.uuid, name: document.name ?? "",
    documentType: document.documentName, type: document.type ?? null,
    folder: document.folder?.id ?? null
  };
}

/**
 * Filter names and paginate without exposing arbitrary runtime properties.
 */
function page(entries, args) {
  const { offset, limit, query } = pagination(args);
  const matching = entries.filter(entry => (entry.name ?? "").toLowerCase().includes(query.toLowerCase()));
  return {
    total: matching.length,
    nextOffset: offset + limit < matching.length ? offset + limit : null,
    entries: matching.slice(offset, offset + limit)
  };
}

/**
 * Validate UUID shape before asking Foundry to resolve a document.
 */
function validateUuid(uuid) {
  if (typeof uuid !== "string" || uuid.length > 512) {
    throw new Error("A document UUID is required.");
  }
  const parts = uuid.split(".");
  if (parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error("Invalid document UUID.");
  }
  let start;
  if (parts[0] === "Compendium") {
    // V13 supports both Compendium.scope.pack.id and scope.pack.DocumentType.id.
    start = parts.length >= 5 && DOCUMENT_TYPES.includes(parts[3]) ? 5 : 4;
    if (parts.length < start) {
      throw new Error("Invalid compendium UUID.");
    }
  } else {
    if (!DOCUMENT_TYPES.includes(parts[0]) || parts.length < 2) {
      throw new Error("Unsupported document type.");
    }
    start = 2;
  }
  if ((parts.length - start) % 2 !== 0) {
    throw new Error("Invalid embedded document UUID.");
  }
  for (let index = start; index < parts.length; index += 2) {
    if (!EMBEDDED_TYPES.includes(parts[index])) {
      throw new Error("Unsupported embedded document type.");
    }
  }
}

/**
 * Select optional fields from serialized data only, never live objects.
 */
function project(data, fields) {
  if (fields === undefined) {
    return data;
  }
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 30) {
    throw new Error("Fields must contain between 1 and 30 paths.");
  }
  const result = {};
  for (const field of fields) {
    if (typeof field !== "string" || field.length > 200) {
      throw new Error("Invalid field path.");
    }
    const parts = field.split(".");
    if (parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part) || ["__proto__", "constructor", "prototype"].includes(part))) {
      throw new Error("Invalid field path.");
    }
    let value = data;
    for (const part of parts) {
      value = value && Object.hasOwn(value, part) ? value[part] : undefined;
    }
    if (value !== undefined) {
      result[field] = value;
    }
  }
  return result;
}

/**
 * Serialize users with a safe field list; preserve source or prepared gameplay data.
 */
function serialize(document, source) {
  if (document.documentName === "User") {
    return {
      _id: document.id, name: document.name, role: document.role,
      active: document.active, isGM: document.isGM,
      character: document.character?.id ?? null, color: document.color, avatar: document.avatar
    };
  }
  return document.toObject(source);
}

/**
 * Dispatch only the supported read operations. Dependencies allow testing without Foundry.
 */
export async function executeRead(operation, args = {}, { game = globalThis.game, fromUuid = globalThis.fromUuid, config = globalThis.CONFIG } = {}) {
  assertEnabledGM(game);
  if (!READ_OPERATIONS.includes(operation)) {
    throw new Error("Unsupported read operation.");
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Arguments must be an object.");
  }
  let result;
  switch (operation) {
    case "list_conditions": {
      if (game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
        throw new Error("Condition discovery requires DnD4e 0.9.3.");
      }
      result = page((config?.statusEffects ?? []).map(status => conditionData(config, game, status.id)), args);
      break;
    }
    case "get_session":
      result = {
        world: { id: game.world.id, title: game.world.title },
        user: serialize(game.user), system: { id: game.system.id, version: game.system.version },
        foundryVersion: game.version, readOnly: false, documentTypes: DOCUMENT_TYPES,
        creation: { tool: "create_npc_actor", actorType: "NPC", system: "dnd4e", version: "0.9.3" },
        ritualCreation: { tool: "create_ritual", destinations: ["world Item folder", "Player Character"], system: "dnd4e", version: "0.9.3" },
        featCreation: { tool: "create_feat", destinations: ["world Item folder", "Player Character"], system: "dnd4e", version: "0.9.3" },
        pcSetup: { tool: "setup_pc", actorType: "Player Character", system: "dnd4e", version: "0.9.3", available: game.user.isActiveGM === true },
        pcItemIcons: { tool: "fix_pc_item_icons", actorType: "Player Character", merchantActorType: "NPC", system: "dnd4e", version: "0.9.3", available: game.user.isActiveGM === true },
        pcImport: { tool: "import_pc_options", equipmentPowers: true, itemTypes: ["power", "feature", "ritual", "weapon", "equipment", "consumable", "tool", "loot", "backpack"], actorType: "Player Character", system: "dnd4e", version: "0.9.3", available: game.user.isActiveGM === true },
        itemCreation: { tool: "create_item", itemTypes: WORLD_ITEM_TYPES, system: "dnd4e", version: "0.9.3" },
          magicItemCreation: { tool: "build_magic_item", itemTypes: ["weapon", "equipment"], system: "dnd4e", version: "0.9.3",
            sources: "base and enchantment compendium Item UUIDs", destination: "world Item folder",
            available: game.user.isActiveGM === true },
          merchantInventory: { readTool: "get_merchant_inventory", editTool: "edit_merchant_inventory", actorType: "NPC",
            system: "dnd4e", version: "0.9.3", confirmation: "active GM", approvalSeconds: 120,
            available: game.user.isActiveGM === true && game.modules.get("item-piles")?.active === true },
        editing: { tool: "edit_npc_actor", actorType: "NPC", system: "dnd4e", version: "0.9.3", confirmation: "active GM", available: game.user.isActiveGM === true },
        pcActorEditing: { tool: "edit_pc_actor", actorType: "Player Character", system: "dnd4e", version: "0.9.3", confirmation: "active GM", approvalSeconds: 120, available: game.user.isActiveGM === true },
        pcPowerEditing: { tool: "edit_pc_powers", actorType: "Player Character", system: "dnd4e", version: "0.9.3", confirmation: "active GM", approvalSeconds: 120, available: game.user.isActiveGM === true },
        pcBasicAttacks: { tool: "set_pc_basic_attack_ability", actorType: "Player Character", system: "dnd4e", version: "0.9.3", confirmation: "active GM", available: game.user.isActiveGM === true },
        itemEffects: { tool: "add_item_effects", system: "dnd4e", version: "0.9.3", confirmation: "active GM", approvalSeconds: 120, available: game.user.isActiveGM === true },
        elevationRegions: { tool: "add_elevation_regions", module: "scene-elevation-region", minimumFoundry: 14,
          confirmation: "active GM", available: game.user.isActiveGM === true && Number.parseInt(game.version, 10) >= 14
            && game.modules?.get("scene-elevation-region")?.active === true
            && !!globalThis.CONFIG?.RegionBehavior?.dataModels?.["scene-elevation-region.elevation"] },
        sceneDrawings: { tool: "add_scene_drawings", shapes: ["rectangle"], coordinates: "scene pixels", confirmation: "active GM", available: game.user.isActiveGM === true },
        activeSceneUuid: game.scenes.active?.uuid ?? null,
        combatUuid: game.combat?.uuid ?? null,
        modules: Array.from(game.modules.values(), module => ({ id: module.id, title: module.title, version: module.version, active: module.active }))
      };
      break;
    case "list_documents": {
      if (!DOCUMENT_TYPES.includes(args.documentType)) {
        throw new Error("Unsupported document type.");
      }
      const collection = game.collections.get(args.documentType);
      if (!collection) {
        throw new Error("Document collection unavailable.");
      }
      const entries = Array.from(collection.values()).filter(document => document.testUserPermission(game.user, "OBSERVER")).map(summary);
      result = page(entries, args);
      break;
    }
    case "get_document": {
      validateUuid(args.uuid);
      if (args.source !== undefined && typeof args.source !== "boolean") {
        throw new Error("Source must be a boolean.");
      }
      if (args.uuid.startsWith("Compendium.")) {
        const packId = args.uuid.split(".").slice(1, 3).join(".");
        if (!game.packs.get(packId)?.testUserPermission(game.user, "OBSERVER")) {
          throw new Error("Compendium access denied.");
        }
      }
      const document = await fromUuid(args.uuid);
      assertEnabledGM(game);
      assertReadable(document, game);
      if (![...DOCUMENT_TYPES, ...EMBEDDED_TYPES].includes(document.documentName)) {
        throw new Error("Unsupported document type.");
      }
      result = { ...summary(document), source: args.source ?? false, data: project(serialize(document, args.source ?? false), args.fields) };
      break;
    }
    case "list_compendiums":
      result = page(Array.from(game.packs.values())
        .filter(pack => pack.testUserPermission(game.user, "OBSERVER"))
        .map(pack => ({ id: pack.collection, name: pack.title, documentType: pack.documentName, locked: pack.locked })), args);
      break;
    case "list_compendium_documents": {
      if (typeof args.pack !== "string") {
        throw new Error("A compendium ID is required.");
      }
      const pack = game.packs.get(args.pack);
      if (!pack?.testUserPermission(game.user, "OBSERVER")) {
        throw new Error("Compendium not found or access denied.");
      }
      const index = await pack.getIndex();
      assertEnabledGM(game);
      if (!pack.testUserPermission(game.user, "OBSERVER")) {
        throw new Error("Compendium access denied.");
      }
      result = page(Array.from(index.values(), entry => ({
        id: entry._id, name: entry.name, type: entry.type ?? null, uuid: pack.getUuid(entry._id)
      })), args);
      break;
    }
  }
  assertEnabledGM(game);
  return result;
}
