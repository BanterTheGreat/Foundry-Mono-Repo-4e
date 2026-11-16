import { validateWeaponDamage } from "../shared/weapon-damage-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();


/**
 * Edit base weapon dice and optional matching rules text after GM review.
 */
export async function editWeaponDamage(args, {
  game = globalThis.game, confirm = confirmNpcEdit, assertConnection = () => {}
} = {}) {
  validateWeaponDamage(args);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Weapon damage editing requires the paired active GM on DnD4e 0.9.3.");
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
    if (!item || item.uuid !== uuid || item.pack || (item.parent ?? null) !== actor || item.type !== "weapon") {
      throw new Error("Select world weapons or weapons on world PCs/NPCs.");
    }
    return { item, actor };
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another weapon damage edit is awaiting confirmation.");
  }
  const targets = args.items.map(({ uuid, numDice, numFaces, description }) => {
    const { item, actor } = resolve(uuid);
    const source = item.toObject(true);
    const parts = source.system?.damageDice?.parts;
    if (!Array.isArray(parts) || parts.length !== 1) {
      throw new Error("Select weapons with exactly one base damage dice part; compound base damage requires manual editing.");
    }
    const nextParts = [{ ...parts[0], numDice: String(numDice), numFaces: String(numFaces) }];
    const patch = {};
    if (JSON.stringify(parts) !== JSON.stringify(nextParts)) {
      patch["system.damageDice.parts"] = nextParts;
    }
    if (description !== undefined && source.system?.description?.value !== description) {
      patch["system.description.value"] = description;
    }
    return { item, actor, patch, snapshot: JSON.stringify(source), source };
  }).filter(target => Object.keys(target.patch).length);
  const readPath = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);
  const changes = targets.flatMap(({ item, patch, source }) => Object.entries(patch).map(([path, after]) => ({
    document: item.name, uuid: item.uuid, path, before: readPath(source, path), after
  })));
  if (!changes.length) {
    return { status: "unchanged", changes, applied: [] };
  }
  const assertUnchanged = target => {
    const current = resolve(target.item.uuid);
    if (current.item !== target.item || current.actor !== target.actor
      || JSON.stringify(current.item.toObject(true)) !== target.snapshot) {
      throw new Error("Item changed during review; read source and request a fresh weapon damage edit.");
    }
  };
  pending.add(game);
  try {
    const approved = await confirm({ name: "Weapon damage", title: "Foundry MCP: Confirm weapon damage",
      summary: args.summary ?? "Update selected weapons? base damage dice and matching rules text.", changes });
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
        if (Object.entries(target.patch).some(([path, value]) => JSON.stringify(readPath(saved, path)) !== JSON.stringify(value))) {
          throw new Error("Weapon damage did not save as requested; inspect source before retrying.");
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
