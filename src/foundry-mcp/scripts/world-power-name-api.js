import { validateWorldPowerNames } from "../shared/world-power-name-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();

/** Rename world power Items after GM review, preserving UUIDs and all mechanics. */
export async function renameWorldPowers(args, {
  game = globalThis.game, confirm = confirmNpcEdit, assertConnection = () => {}
} = {}) {
  validateWorldPowerNames(args);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Power renaming requires the paired active GM on DnD4e 0.9.3.");
    }
  };
  const resolve = uuid => {
    const item = game.items.get(uuid.slice(5));
    if (!item || item.uuid !== uuid || item.parent || item.pack || item.type !== "power") {
      throw new Error("Select existing world power Items; embedded Items and compendiums are excluded.");
    }
    return item;
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another world power rename is awaiting confirmation.");
  }
  const targets = args.powers.map(({ uuid, name }) => {
    const item = resolve(uuid);
    return { item, name: name.trim(), snapshot: JSON.stringify(item.toObject(true)) };
  }).filter(target => target.item.name !== target.name);
  const changes = targets.map(({ item, name }) => ({ document: item.name, uuid: item.uuid, path: "name", before: item.name, after: name }));
  if (!changes.length) {
    return { status: "unchanged", changes, applied: [] };
  }
  const assertUnchanged = target => {
    if (resolve(target.item.uuid) !== target.item || JSON.stringify(target.item.toObject(true)) !== target.snapshot) {
      throw new Error("World power changed during review; read source and request a fresh rename.");
    }
  };
  pending.add(game);
  try {
    const approved = await confirm({ name: "World power names", title: "Foundry MCP: Confirm power renames",
      summary: args.summary ?? "Rename selected world powers while preserving mechanics and links.", changes });
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
        await target.item.update({ name: target.name });
        assertSession();
        if (resolve(target.item.uuid).name !== target.name) {
          throw new Error("Power name did not save.");
        }
        applied.push({ uuid: target.item.uuid, name: target.name });
      }
      return { status: "updated", changes, applied };
    } catch (error) {
      return { status: "incomplete", changes, applied, error: error.message };
    }
  } finally {
    pending.delete(game);
  }
}
