import { MODULE_ID, MAX_MESSAGE_BYTES } from "../shared/protocol.js";
import { validateLocalizeItemPowers } from "../shared/localize-item-powers-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";
import { resolveCreationFolder } from "./creation-utils.js";

const pending = new WeakSet();
const sourcePattern = /^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.(?:Item\.)?[A-Za-z0-9_-]+$/;
const markerKey = "localizedItemPower";

/** Copy referenced compendium powers to a world folder and relink only selected PC equipment. */
export async function localizeItemPowers(args, {
  game = globalThis.game, Item = globalThis.Item, Folder = globalThis.Folder,
  fromUuid = globalThis.fromUuid, confirm = confirmNpcEdit, assertConnection = () => {}
} = {}) {
  validateLocalizeItemPowers(args);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Item power localization requires the paired active GM on DnD4e 0.9.3.");
    }
  };
  const resolveEquipment = uuid => {
    const [, actorId, , itemId] = uuid.split(".");
    const actor = game.actors.get(actorId);
    const item = actor?.items.get(itemId);
    if (!actor || actor.type !== "Player Character" || actor.pack || actor.parent
      || !item || item.uuid !== uuid || item.parent !== actor || item.pack
      || !["weapon", "equipment", "consumable", "tool", "loot", "backpack"].includes(item.type)) {
      throw new Error("Select physical equipment on a world Player Character.");
    }
    return item;
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another item power localization is in progress.");
  }
  pending.add(game);
  try {
    const equipment = args.items.map(uuid => {
      const item = resolveEquipment(uuid);
      return { item, snapshot: JSON.stringify(item.toObject(true)), links: item.toObject(true).system?.itemPowers ?? [] };
    });
    if (equipment.some(entry => !Array.isArray(entry.links) || entry.links.some(link => typeof link !== "string"))) {
      throw new Error("Equipment Item Powers must be an array of UUID strings.");
    }
    const references = [...new Set(equipment.flatMap(entry => entry.links).filter(link => link.startsWith("Compendium.")))];
    if (references.length > 100) {
      throw new Error("Select equipment with at most 100 distinct compendium powers.");
    }
    const sources = new Map();
    for (const uuid of references) {
      if (!sourcePattern.test(uuid)) {
        throw new Error("Invalid compendium Item power UUID.");
      }
      const source = await fromUuid(uuid);
      assertSession();
      const readable = () => source?.documentName === "Item" && source.type === "power" && !source.parent && source.pack
        && game.packs.get(source.pack)?.documentName === "Item"
        && game.packs.get(source.pack).testUserPermission(game.user, "OBSERVER")
        && source.testUserPermission(game.user, "OBSERVER");
      if (!readable()) {
        throw new Error("Every compendium link must resolve to an accessible power Item.");
      }
      sources.set(uuid, { source, readable, snapshot: JSON.stringify(source.toObject(true)) });
    }
    if (new TextEncoder().encode(JSON.stringify([...sources.values()].map(entry => entry.snapshot))).length > MAX_MESSAGE_BYTES / 2) {
      throw new Error("Selected power sources exceed 2 MiB.");
    }
    if (!references.length) {
      return { status: "unchanged", applied: [], copies: [] };
    }
    const existingCopy = uuid => {
      const matches = [...game.items.values()].filter(item => !item.pack && !item.parent && item.type === "power"
        && item.getFlag(MODULE_ID, markerKey)?.sourceUuid === uuid);
      if (matches.length > 1) {
        throw new Error("Multiple managed local copies exist for a source power; resolve them before retrying.");
      }
      return matches[0];
    };
    const copies = new Map(references.map(uuid => [uuid, existingCopy(uuid)]));
    const copySnapshots = new Map([...copies].filter(([, item]) => item).map(([uuid, item]) => [uuid, JSON.stringify(item.toObject(true))]));
    const changes = equipment.filter(entry => entry.links.some(link => sources.has(link))).map(entry => ({
      document: entry.item.name, uuid: entry.item.uuid, path: "system.itemPowers", before: entry.links,
      after: entry.links.map(link => sources.has(link) ? copies.get(link)?.uuid ?? `New world power: ${sources.get(link).source.name}` : link)
    }));
    const approved = await confirm({ name: "Localize Item Powers", title: "Foundry MCP: Confirm Local Item Powers",
      summary: args.summary ?? "Copy linked compendium powers into Equipment/Item Powers and relink selected PC equipment.",
      changes: [...changes, ...references.map(uuid => ({ document: sources.get(uuid).source.name, path: "world power copy",
        before: uuid, after: copies.get(uuid) ? copies.get(uuid).toObject(true) : JSON.parse(sources.get(uuid).snapshot) }))] });
    assertSession();
    if (approved !== true) {
      return { status: "cancelled", changes, applied: [], copies: [] };
    }
    for (const [uuid, entry] of sources) {
      const current = await fromUuid(uuid);
      assertSession();
      if (current !== entry.source) {
        throw new Error("Compendium power was replaced or removed during review; read source and retry.");
      }
    }
    const assertSources = () => {
      assertSession();
      if ([...sources.values()].some(entry => !entry.readable() || JSON.stringify(entry.source.toObject(true)) !== entry.snapshot)) {
        throw new Error("Compendium power changed during review; read source and retry.");
      }
    };
    const assertEquipment = entry => {
      if (resolveEquipment(entry.item.uuid) !== entry.item || JSON.stringify(entry.item.toObject(true)) !== entry.snapshot) {
        throw new Error("Equipment changed during review; read source and retry.");
      }
    };
    assertSources();
    equipment.forEach(assertEquipment);
    for (const [uuid, item] of copies) {
      if (existingCopy(uuid) !== item || (item && JSON.stringify(item.toObject(true)) !== copySnapshots.get(uuid))) {
        throw new Error("Local power copies changed during review; read source and retry.");
      }
    }
    const applied = [];
    const receipts = [];
    try {
      const folder = await resolveCreationFolder(game, args.folder ?? "Equipment/Item Powers", Folder, assertSession, "Item");
      assertSources();
      equipment.forEach(assertEquipment);
      for (const [uuid, entry] of sources) {
        assertSources();
        let copy = copies.get(uuid);
        if (existingCopy(uuid) !== copy || (copy && JSON.stringify(copy.toObject(true)) !== copySnapshots.get(uuid))) {
          throw new Error("Local power copies changed before saving; read source and retry.");
        }
        if (!copy) {
          const data = JSON.parse(entry.snapshot);
          delete data._id;
          delete data.ownership;
          delete data._stats;
          data.folder = folder.id;
          data.sort = 0;
          data.flags ??= {};
          data.flags[MODULE_ID] = { [markerKey]: { sourceUuid: uuid } };
          copy = await Item.create(data, { renderSheet: false });
          assertSession();
          if (!copy) {
            throw new Error("Power copy creation cancelled.");
          }
          copies.set(uuid, copy);
        }
        receipts.push({ sourceUuid: uuid, uuid: copy.uuid, name: copy.name });
      }
      for (const entry of equipment) {
        assertSources();
        assertEquipment(entry);
        const links = entry.links.map(link => copies.get(link)?.uuid ?? link);
        if (JSON.stringify(links) !== JSON.stringify(entry.links)) {
          await entry.item.update({ "system.itemPowers": links });
          assertSession();
          if (JSON.stringify(entry.item.toObject(true).system.itemPowers) !== JSON.stringify(links)) {
            throw new Error("Equipment relink did not save completely.");
          }
          applied.push({ uuid: entry.item.uuid, itemPowers: links });
        }
      }
      return { status: "updated", changes, applied, copies: receipts };
    } catch (error) {
      return { status: "incomplete", changes, applied, copies: receipts, error: error.message };
    }
  } finally {
    pending.delete(game);
  }
}
