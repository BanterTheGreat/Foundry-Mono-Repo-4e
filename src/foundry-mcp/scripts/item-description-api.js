import { validateItemDescriptions } from "../shared/item-description-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();
const supportedTypes = new Set(["weapon", "equipment", "power", "feature", "consumable", "tool", "loot", "backpack", "ritual"]);

/**
 * Edit rules/flavor text after GM review, preserving identity and mechanical data.
 */
export async function editItemDescriptions(args, {
  game = globalThis.game, confirm = confirmNpcEdit, assertConnection = () => {}
} = {}) {
  validateItemDescriptions(args);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Item description editing requires the paired active GM on DnD4e 0.9.3.");
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
    throw new Error("Another Item description edit is awaiting confirmation.");
  }
  const targets = args.items.map(({ uuid, description }) => {
    const { item, actor } = resolve(uuid);
    const source = item.toObject(true);
    const patch = Object.fromEntries(Object.entries(description)
      .filter(([key, value]) => source.system?.description?.[key] !== value)
      .map(([key, value]) => [`system.description.${key}`, value]));
    return { item, actor, patch, snapshot: JSON.stringify(source), source };
  }).filter(target => Object.keys(target.patch).length);
  const changes = targets.flatMap(({ item, patch, source }) => Object.entries(patch).map(([path, after]) => ({
    document: item.name, uuid: item.uuid, path, before: source.system?.description?.[path.split(".").at(-1)], after
  })));
  if (!changes.length) {
    return { status: "unchanged", changes, applied: [] };
  }
  const assertUnchanged = target => {
    const current = resolve(target.item.uuid);
    if (current.item !== target.item || current.actor !== target.actor
      || JSON.stringify(current.item.toObject(true)) !== target.snapshot) {
      throw new Error("Item changed during review; read source and request a fresh description edit.");
    }
  };
  pending.add(game);
  try {
    const approved = await confirm({ name: "Item descriptions", title: "Foundry MCP: Confirm Item descriptions",
      summary: args.summary ?? "Update selected Item rules and flavor descriptions.", changes });
    assertSession();
    if (approved !== true) {
      return { status: "cancelled", changes, applied: [] };
    }
    targets.forEach(assertUnchanged);
    const applied = [];
    try {
      for (const target of targets) {
        assertSession();
        assertUnchanged(target);
        // Foundry may expand/mutate update data; retain our flat patch for verification.
        await target.item.update(structuredClone(target.patch));
        assertSession();
        const saved = resolve(target.item.uuid).item.toObject(true);
        if (Object.entries(target.patch).some(([path, value]) => saved.system?.description?.[path.split(".").at(-1)] !== value)) {
          throw new Error("Item description did not save as requested; inspect source before retrying.");
        }
        applied.push({ uuid: target.item.uuid, fields: Object.keys(target.patch) });
      }
      return { status: "updated", changes, applied };
    } catch (error) {
      return { status: "incomplete", changes, applied, error: error.message };
    }
  } finally {
    pending.delete(game);
  }
}
