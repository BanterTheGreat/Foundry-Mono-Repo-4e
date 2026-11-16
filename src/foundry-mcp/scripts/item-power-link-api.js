import { validateItemPowerLinks } from "../shared/item-power-link-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();
const supportedTypes = new Set(["weapon", "equipment", "consumable", "tool", "loot", "backpack"]);

/**
 * Append native world Item Power links after GM review, preserving existing links and mechanics.
 */
export async function linkItemPowers(args, {
  game = globalThis.game, confirm = confirmNpcEdit, assertConnection = () => {}
} = {}) {
  validateItemPowerLinks(args);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Item power linking requires the paired active GM on DnD4e 0.9.3.");
    }
  };
  const resolve = uuid => {
    const parts = uuid.split(".");
    const actor = parts.length === 4 ? game.actors.get(parts[1]) : null;
    if (parts.length === 4 && (!actor || actor.uuid !== `Actor.${parts[1]}`
      || actor.parent || actor.pack || actor.isToken || !["NPC", "Player Character"].includes(actor.type))) {
      throw new Error("Select Items on existing world PCs/NPCs; token actors and compendiums are excluded.");
    }
    const item = actor ? actor.items.get(parts[3]) : game.items.get(parts[1]);
    if (!item || item.uuid !== uuid || item.pack || (item.parent ?? null) !== actor || !supportedTypes.has(item.type)) {
      throw new Error("Select supported world Items or Items on world PCs/NPCs.");
    }
    return { item, actor };
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another Item power link edit is awaiting confirmation.");
  }
  const powerUuids = [...new Set(args.items.flatMap(entry => entry.powers))];
  const resolvePower = uuid => {
    const power = game.items.get(uuid.slice(5));
    if (!power || power.uuid !== uuid || power.type !== "power" || power.parent || power.pack) {
      throw new Error("Every new Item Power link must resolve to an existing world power Item.");
    }
    return power;
  };
  const powers = powerUuids.map(uuid => {
    const power = resolvePower(uuid);
    return { power, snapshot: JSON.stringify(power.toObject(true)) };
  });
  const assertPowers = () => {
    for (const entry of powers) {
      if (resolvePower(entry.power.uuid) !== entry.power || JSON.stringify(entry.power.toObject(true)) !== entry.snapshot) {
        throw new Error("Linked power changed during review; read source and request fresh links.");
      }
    }
  };
  const targets = args.items.map(({ uuid, powers }) => {
    const { item, actor } = resolve(uuid);
    const source = item.toObject(true);
    const before = source.system?.itemPowers ?? [];
    if (!Array.isArray(before) || before.some(link => typeof link !== "string")) {
      throw new Error("Existing Item Powers must be an array of UUID strings.");
    }
    const links = [...before, ...powers.filter(link => !before.includes(link))];
    return { item, actor, links, before, snapshot: JSON.stringify(source) };
  }).filter(target => JSON.stringify(target.before) !== JSON.stringify(target.links));
  const changes = targets.map(({ item, before, links }) => ({
    document: item.name, uuid: item.uuid, path: "system.itemPowers", before, after: links
  }));
  if (!changes.length) {
    return { status: "unchanged", changes, applied: [] };
  }
  const assertUnchanged = target => {
    const current = resolve(target.item.uuid);
    if (current.item !== target.item || current.actor !== target.actor
      || JSON.stringify(current.item.toObject(true)) !== target.snapshot) {
      throw new Error("Item changed during review; read source and request a fresh Item power link edit.");
    }
  };
  pending.add(game);
  try {
    const approved = await confirm({ name: "Item Power links", title: "Foundry MCP: Confirm Item Power links",
      summary: args.summary ?? "Link selected world Item Powers to equipment while preserving existing links.", changes });
    assertSession();
    if (approved !== true) {
      return { status: "cancelled", changes, applied: [] };
    }
    assertPowers();
    targets.forEach(assertUnchanged);
    const applied = [];
    try {
      for (const target of targets) {
        assertSession();
        assertUnchanged(target);
        assertPowers();
        await target.item.update({ "system.itemPowers": [...target.links] });
        assertSession();
        const saved = resolve(target.item.uuid).item.toObject(true);
        if (JSON.stringify(saved.system?.itemPowers) !== JSON.stringify(target.links)) {
          throw new Error("Item Power links did not save as requested; inspect source before retrying.");
        }
        applied.push({ uuid: target.item.uuid, itemPowers: target.links });
      }
      return { status: "updated", changes, applied };
    } catch (error) {
      return { status: "incomplete", changes, applied, error: error.message };
    }
  } finally {
    pending.delete(game);
  }
}
